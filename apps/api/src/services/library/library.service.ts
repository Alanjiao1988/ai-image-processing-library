import path from "node:path";

import { GenerationJobStatus, type Folder, type ImageAsset } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { HttpError } from "../../utils/http-error";
import { extractImageDimensions } from "../../utils/image-metadata";
import { normalizeBigInt } from "../../utils/serializers";
import { blobStorageService } from "../storage/blob-storage.service";

function mapImageAsset(asset: ImageAsset) {
  return {
    id: asset.id,
    folderId: asset.folderId,
    fileName: asset.fileName,
    sourceMode: asset.sourceMode,
    promptText: asset.promptText,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
    fileSizeBytes: normalizeBigInt(asset.fileSizeBytes),
    externalRequestId: asset.externalRequestId,
    createdAt: asset.createdAt.toISOString(),
    thumbnailUrl: asset.thumbnailBlobPath
      ? blobStorageService.getProxyUrl("library-thumb", asset.thumbnailBlobPath)
      : blobStorageService.getProxyUrl("library-original", asset.blobPath),
    originalUrl: blobStorageService.getProxyUrl("library-original", asset.blobPath),
  };
}

function mapFolder(folder: Folder, coverImage?: ImageAsset | null) {
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    imageCount: folder.imageCount,
    coverImageId: folder.coverImageId,
    coverImageUrl:
      coverImage?.thumbnailBlobPath
        ? blobStorageService.getProxyUrl("library-thumb", coverImage.thumbnailBlobPath)
        : coverImage?.blobPath
          ? blobStorageService.getProxyUrl("library-original", coverImage.blobPath)
          : null,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

export class LibraryService {
  async listFolders() {
    const folders = await prisma.folder.findMany({
      include: {
        coverImage: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return folders.map((folder) => mapFolder(folder, folder.coverImage));
  }

  async createFolder(input: { name: string; description?: string }) {
    try {
      const folder = await prisma.folder.create({
        data: {
          name: input.name.trim(),
          description: input.description?.trim() || null,
        },
      });

      return mapFolder(folder);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new HttpError(409, "FOLDER_NAME_EXISTS", "文件夹名称已存在，请更换后再试。");
      }

      throw error;
    }
  }

  async getFolder(folderId: string) {
    const folder = await prisma.folder.findUnique({
      where: {
        id: folderId,
      },
      include: {
        coverImage: true,
      },
    });

    if (!folder) {
      throw new HttpError(404, "FOLDER_NOT_FOUND", "未找到指定的文件夹。");
    }

    return mapFolder(folder, folder.coverImage);
  }

  async getFolderImages(folderId: string) {
    await this.getFolder(folderId);

    const images = await prisma.imageAsset.findMany({
      where: {
        folderId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return images.map(mapImageAsset);
  }

  async getImage(imageId: string) {
    const image = await prisma.imageAsset.findUnique({
      where: {
        id: imageId,
      },
      include: {
        folder: true,
      },
    });

    if (!image) {
      throw new HttpError(404, "IMAGE_NOT_FOUND", "未找到指定的图片。");
    }

    return {
      ...mapImageAsset(image),
      folder: {
        id: image.folder.id,
        name: image.folder.name,
      },
      sourceImageBlobPath: image.sourceImageBlobPath,
    };
  }

  async saveGeneratedToFolder(input: { jobId: string; folderId: string }) {
    const [job, folder] = await Promise.all([
      prisma.generationJob.findUnique({
        where: {
          id: input.jobId,
        },
      }),
      prisma.folder.findUnique({
        where: {
          id: input.folderId,
        },
      }),
    ]);

    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "未找到指定的生成任务。");
    }

    if (!folder) {
      throw new HttpError(404, "FOLDER_NOT_FOUND", "未找到指定的文件夹。");
    }

    if (job.status !== GenerationJobStatus.SUCCEEDED || !job.tempResultBlobPath) {
      throw new HttpError(
        409,
        "JOB_RESULT_NOT_READY",
        "当前任务尚未生成可保存的结果图，请等待任务完成后再试。",
      );
    }

    if (job.savedToLibraryAt) {
      throw new HttpError(
        409,
        "JOB_ALREADY_SAVED",
        "该生成结果已经保存到图片库，当前版本暂不支持重复入库。",
      );
    }

    const tempResult = await blobStorageService.downloadBlobBuffer(
      "generated-temp",
      job.tempResultBlobPath,
    );
    const storedAsset = await blobStorageService.uploadLibraryAsset({
      buffer: tempResult.buffer,
      mimeType: tempResult.contentType,
      mode: job.mode,
      fileName: tempResult.fileName,
    });
    const dimensions = extractImageDimensions(tempResult.buffer);

    const imageAsset = await prisma.$transaction(async (transaction) => {
      const asset = await transaction.imageAsset.create({
        data: {
          folderId: folder.id,
          fileName: this.normalizeFileName(storedAsset.fileName, storedAsset.blobPath),
          blobPath: storedAsset.blobPath,
          thumbnailBlobPath: null,
          sourceMode: job.mode,
          promptText: job.promptText,
          sourceImageBlobPath: job.inputImageBlobPath,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: storedAsset.contentType,
          fileSizeBytes: BigInt(storedAsset.size),
          externalRequestId: job.externalRequestId,
        },
      });

      await transaction.folder.update({
        where: {
          id: folder.id,
        },
        data: {
          imageCount: {
            increment: 1,
          },
          ...(folder.coverImageId ? {} : { coverImageId: asset.id }),
        },
      });

      await transaction.generationJob.update({
        where: {
          id: job.id,
        },
        data: {
          savedToLibraryAt: new Date(),
        },
      });

      return asset;
    });

    return {
      message: `生成结果已保存到文件夹“${folder.name}”。`,
      image: await this.getImage(imageAsset.id),
    };
  }

  private normalizeFileName(fileName: string, blobPath: string) {
    const trimmed = fileName.trim();

    if (trimmed) {
      return trimmed;
    }

    return path.basename(blobPath);
  }
}

export const libraryService = new LibraryService();
