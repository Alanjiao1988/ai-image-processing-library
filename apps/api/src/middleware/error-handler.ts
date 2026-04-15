import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { logger } from "../lib/logger";
import { HttpError } from "../utils/http-error";

export function notFoundHandler(request: Request, response: Response) {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${request.method} ${request.originalUrl} does not exist.`,
    },
  });
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof multer.MulterError) {
    return response.status(400).json({
      error: {
        code: "UPLOAD_ERROR",
        message: error.message,
      },
    });
  }

  if (error instanceof HttpError) {
    return response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
  }

  logger.error({ error }, "Unhandled API error.");

  return response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "服务端发生未预期错误，请查看后端日志定位问题。",
    },
  });
}
