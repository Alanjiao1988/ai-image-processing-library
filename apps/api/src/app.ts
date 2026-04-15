import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";

import { env } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { apiRouter } from "./routes";

export function createApp() {
  const app = express();

  app.use(
    pinoHttp({
      logger,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/ping", (_request, response) => {
    response.json({
      ok: true,
      service: "ai-image-app-api",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
