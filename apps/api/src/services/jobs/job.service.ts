import { GenerationJobStatus, ImageMode } from "@prisma/client";
import type { Express } from "express";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { imageProvider } from "../../providers/provider-factory";
import type { JobCreatedResponse, JobResponse } from "../../types/api";
import { HttpError } from "../../utils/http-error";
import { blobStorageService } from "../storage/blob-storage.service";

const terminalJobStatuses = new Set<GenerationJobStatus>([
  GenerationJobStatus.SUCCEEDED,
  GenerationJobStatus.FAILED,
]);

export class JobService {
  private readonly executionTimeoutMs = Math.max(
    env.IMAGE_TIMEOUT_MS * (env.IMAGE_MAX_RETRY + 1) + 60_000,
    300_000,
  );

  private readonly staleProcessingThresholdMs = this.executionTimeoutMs + 120_000;

  async createTextToImageJob(prompt: string): Promise<JobCreatedResponse> {
    await this.failStaleProcessingJobs();

    const job = await prisma.generationJob.create({
      data: {
        mode: ImageMode.TEXT_TO_IMAGE,
        status: GenerationJobStatus.PENDING,
        promptText: prompt,
      },
    });

    setImmediate(() => {
      void this.processTextToImageJob(job.id);
    });

    return {
      jobId: job.id,
      status: job.status,
      message: "文生图任务已创建，系统正在处理中。",
    };
  }

  async createImageBasedJob(
    mode: ImageMode,
    prompt: string,
    file: Express.Multer.File,
  ): Promise<JobCreatedResponse> {
    await this.failStaleProcessingJobs();

    const uploaded = await blobStorageService.uploadTempInput(
      file,
      mode === ImageMode.IMAGE_EDIT ? "edit" : "variation",
    );

    const job = await prisma.generationJob.create({
      data: {
        mode,
        status: GenerationJobStatus.PENDING,
        promptText: prompt,
        inputImageBlobPath: uploaded.blobPath,
      },
    });

    setImmediate(() => {
      void this.processImageBasedJob(job.id, mode);
    });

    return {
      jobId: job.id,
      status: job.status,
      message: "上传型任务已创建，系统正在基于临时图片执行生成。",
    };
  }

  async getJob(jobId: string): Promise<JobResponse> {
    const job = await prisma.generationJob.findUnique({
      where: {
        id: jobId,
      },
    });

    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "未找到指定的生成任务。");
    }

    return {
      id: job.id,
      mode: job.mode,
      status: job.status,
      promptText: job.promptText,
      inputImageUrl: job.inputImageBlobPath
        ? blobStorageService.getProxyUrl("uploads-temp", job.inputImageBlobPath)
        : null,
      resultImageUrl: job.tempResultBlobPath
        ? blobStorageService.getProxyUrl("generated-temp", job.tempResultBlobPath)
        : null,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private async processTextToImageJob(jobId: string) {
    try {
      const job = await this.enterProcessingState(jobId, ImageMode.TEXT_TO_IMAGE);

      if (!job.promptText) {
        throw new HttpError(400, "MISSING_PROMPT", "文生图任务缺少提示词。");
      }

      const generatedImages = await this.runWithExecutionTimeout(
        imageProvider.generate({
          prompt: job.promptText,
          count: 1,
        }),
      );

      const [firstImage] = generatedImages;

      if (!firstImage) {
        throw new HttpError(
          502,
          "IMAGE_PROVIDER_EMPTY_RESPONSE",
          "外部图片接口未返回可用图片。",
        );
      }

      const uploaded = await blobStorageService.uploadGeneratedResult(firstImage, job.mode);
      await this.markJobSucceeded(jobId, uploaded.blobPath, firstImage.externalRequestId ?? null);
    } catch (error) {
      logger.error({ error, jobId }, "Text-to-image job processing failed.");

      await prisma.generationJob.updateMany({
        where: {
          id: jobId,
          status: {
            notIn: Array.from(terminalJobStatuses),
          },
        },
        data: this.mapJobFailure(error),
      });
    }
  }

  private async processImageBasedJob(
    jobId: string,
    mode: ImageMode,
  ) {
    try {
      const job = await this.enterProcessingState(jobId, mode);

      if (!job.inputImageBlobPath) {
        throw new HttpError(400, "MISSING_INPUT_IMAGE", "上传型任务缺少输入图片。");
      }

      const generatedImages =
        mode === ImageMode.IMAGE_EDIT
          ? await this.runWithExecutionTimeout(
              imageProvider.edit({
                prompt: job.promptText ?? "",
                inputImageBlobPath: job.inputImageBlobPath,
                count: 1,
              }),
            )
          : await this.runWithExecutionTimeout(
              imageProvider.variation({
                prompt: job.promptText ?? "",
                referenceImageBlobPath: job.inputImageBlobPath,
                count: 1,
              }),
            );

      const [firstImage] = generatedImages;

      if (!firstImage) {
        throw new HttpError(
          502,
          "IMAGE_PROVIDER_EMPTY_RESPONSE",
          "外部图片接口未返回可用图片。",
        );
      }

      const uploaded = await blobStorageService.uploadGeneratedResult(firstImage, job.mode);
      await this.markJobSucceeded(jobId, uploaded.blobPath, firstImage.externalRequestId ?? null);
    } catch (error) {
      logger.error({ error, jobId, mode }, "Image-based job processing failed.");

      await prisma.generationJob.updateMany({
        where: {
          id: jobId,
          status: {
            notIn: Array.from(terminalJobStatuses),
          },
        },
        data: this.mapJobFailure(error),
      });
    }
  }

  private async enterProcessingState(jobId: string, mode: ImageMode) {
    const transition = await prisma.generationJob.updateMany({
      where: {
        id: jobId,
        mode,
        status: GenerationJobStatus.PENDING,
      },
      data: {
        status: GenerationJobStatus.PROCESSING,
        errorCode: null,
        errorMessage: null,
      },
    });

    if (transition.count === 0) {
      logger.warn({ jobId, mode }, "Generation job was not in PENDING state; processing skipped.");
      throw new HttpError(409, "JOB_STATE_INVALID", "任务状态已变更，本次处理已跳过。");
    }

    const job = await prisma.generationJob.findUnique({
      where: {
        id: jobId,
      },
    });

    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "未找到指定的生成任务。");
    }

    return job;
  }

  private async markJobSucceeded(
    jobId: string,
    blobPath: string,
    externalRequestId: string | null,
  ) {
    await prisma.generationJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: GenerationJobStatus.SUCCEEDED,
        tempResultBlobPath: blobPath,
        externalRequestId,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  private mapJobFailure(error: unknown) {
    if (error instanceof HttpError) {
      return {
        status: GenerationJobStatus.FAILED,
        errorCode: error.code,
        errorMessage: error.message,
      };
    }

    if (error instanceof Error) {
      return {
        status: GenerationJobStatus.FAILED,
        errorCode: "TEXT_TO_IMAGE_JOB_FAILED",
        errorMessage: error.message,
      };
    }

    return {
      status: GenerationJobStatus.FAILED,
      errorCode: "TEXT_TO_IMAGE_JOB_FAILED",
      errorMessage: "文生图任务执行失败。",
    };
  }

  private async failStaleProcessingJobs() {
    const staleBefore = new Date(Date.now() - this.staleProcessingThresholdMs);

    const result = await prisma.generationJob.updateMany({
      where: {
        status: GenerationJobStatus.PROCESSING,
        updatedAt: {
          lt: staleBefore,
        },
      },
      data: {
        status: GenerationJobStatus.FAILED,
        errorCode: "JOB_EXECUTION_TIMEOUT",
        errorMessage: "任务执行超时，系统已自动结束，请重试。",
      },
    });

    if (result.count > 0) {
      logger.warn(
        { staleCount: result.count, staleBefore: staleBefore.toISOString() },
        "Marked stale PROCESSING jobs as FAILED.",
      );
    }
  }

  private async runWithExecutionTimeout<T>(promise: Promise<T>) {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(
            new HttpError(
              504,
              "JOB_EXECUTION_TIMEOUT",
              `生成任务执行超过 ${this.executionTimeoutMs}ms，已自动终止。`,
            ),
          );
        }, this.executionTimeoutMs);
      }),
    ]);
  }
}

export const jobService = new JobService();
