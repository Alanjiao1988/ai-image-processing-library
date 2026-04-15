import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { setupTelemetry } from "./lib/telemetry";
import { startupSelfTestService } from "./services/health/startup-self-test.service";
import { blobStorageService } from "./services/storage/blob-storage.service";

async function bootstrap() {
  setupTelemetry();

  try {
    await blobStorageService.ensureRequiredContainers();
  } catch (error) {
    logger.warn({ error }, "Blob container bootstrap failed. API will continue to start.");
  }

  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`API server is listening on http://localhost:${env.PORT}`);
    startupSelfTestService.maybeSchedule();
  });
}

void bootstrap();
