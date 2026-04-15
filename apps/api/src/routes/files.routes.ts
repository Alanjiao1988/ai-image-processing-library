import { Router } from "express";

import { blobStorageService } from "../services/storage/blob-storage.service";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";

export const filesRouter = Router();

filesRouter.get(
  "/:container",
  asyncHandler(async (request, response) => {
    const blobPath = request.query.path;

    if (typeof blobPath !== "string" || !blobPath) {
      throw new HttpError(400, "MISSING_BLOB_PATH", "读取 Blob 文件时必须提供 path 查询参数。");
    }

    const downloadResponse = await blobStorageService.getBlobDownload(
      request.params.container,
      blobPath,
    );

    response.setHeader(
      "Content-Type",
      downloadResponse.contentType ?? "application/octet-stream",
    );

    if (!downloadResponse.readableStreamBody) {
      throw new HttpError(404, "BLOB_NOT_FOUND", "未找到对应的 Blob 文件。");
    }

    downloadResponse.readableStreamBody.pipe(response);
  }),
);
