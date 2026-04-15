import path from "node:path";

import type { Express } from "express";

const extensionToMimeType = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;

const supportedExtensions = new Set(Object.keys(extensionToMimeType));

export function isSupportedImageUpload(file: Pick<Express.Multer.File, "mimetype" | "originalname">) {
  if (file.mimetype?.startsWith("image/")) {
    return true;
  }

  const extension = path.extname(file.originalname || "").toLowerCase();
  return supportedExtensions.has(extension);
}

export function resolveUploadMimeType(
  file: Pick<Express.Multer.File, "mimetype" | "originalname">,
) {
  if (file.mimetype?.startsWith("image/")) {
    return file.mimetype;
  }

  const extension = path.extname(file.originalname || "").toLowerCase() as keyof typeof extensionToMimeType;
  return extensionToMimeType[extension] || "application/octet-stream";
}
