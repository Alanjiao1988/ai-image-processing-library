import { ImageMode, GenerationJobStatus } from "@prisma/client";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { imageProvider } from "../../providers/provider-factory";
import { blobStorageService } from "../storage/blob-storage.service";

const DEFAULT_PROMPT = "一只穿着宇航服的猫咪在月球上散步，企业海报风格，高清插画";

class StartupSelfTestService {
  maybeSchedule() {
    if (!env.STARTUP_SELF_TEST_ENABLED) {
      return;
    }

    setTimeout(() => {
      void this.run();
    }, env.STARTUP_SELF_TEST_START_DELAY_MS);
  }

  private async run() {
    const prompt = env.STARTUP_SELF_TEST_PROMPT || DEFAULT_PROMPT;

    logger.info(
      {
        promptPreview: prompt.slice(0, 120),
      },
      "Startup self-test started.",
    );

    try {
      await prisma.$queryRawUnsafe("SELECT 1");

      const blobHealth = await blobStorageService.getHealth();
      const providerHealth = await imageProvider.checkHealth();

      logger.info(
        {
          blobStatus: blobHealth.status,
          providerStatus: providerHealth.status,
        },
        "Startup self-test dependency checks completed.",
      );

      const generatedImages = await imageProvider.generate({
        prompt,
        count: 1,
      });

      const [firstImage] = generatedImages;

      if (!firstImage) {
        throw new Error("Startup self-test did not receive any generated images.");
      }

      const uploaded = await blobStorageService.uploadGeneratedResult(firstImage);

      const job = await prisma.generationJob.create({
        data: {
          mode: ImageMode.TEXT_TO_IMAGE,
          status: GenerationJobStatus.SUCCEEDED,
          promptText: prompt,
          tempResultBlobPath: uploaded.blobPath,
          externalRequestId: firstImage.externalRequestId ?? "startup-self-test",
        },
      });

      logger.info(
        {
          blobPath: uploaded.blobPath,
          contentType: uploaded.contentType,
          jobId: job.id,
          size: uploaded.size,
        },
        "Startup self-test succeeded.",
      );
    } catch (error) {
      logger.error(
        {
          error,
        },
        "Startup self-test failed.",
      );
    }
  }
}

export const startupSelfTestService = new StartupSelfTestService();
