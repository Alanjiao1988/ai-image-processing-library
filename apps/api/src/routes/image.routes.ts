import { ImageMode } from "@prisma/client";
import multer from "multer";
import { Router } from "express";
import { z } from "zod";

import { env } from "../config/env";
import { jobService } from "../services/jobs/job.service";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { isSupportedImageUpload, resolveUploadMimeType } from "../utils/image-upload";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    if (!isSupportedImageUpload(file)) {
      callback(new HttpError(400, "INVALID_FILE_TYPE", "仅支持上传图片格式文件。"));
      return;
    }

    callback(null, true);
  },
});

const promptSchema = z.object({
  prompt: z.string().trim().min(1, "提示词不能为空。").max(4000, "提示词长度不能超过 4000 字符。"),
});

function parsePrompt(input: unknown) {
  const parsed = promptSchema.safeParse(input);

  if (!parsed.success) {
    throw new HttpError(400, "INVALID_PROMPT", "提示词参数不合法。", parsed.error.flatten());
  }

  return parsed.data.prompt;
}

export const imageRouter = Router();

imageRouter.post(
  "/text-to-image",
  asyncHandler(async (request, response) => {
    const prompt = parsePrompt(request.body);
    response.status(202).json(await jobService.createTextToImageJob(prompt));
  }),
);

imageRouter.post(
  "/edit",
  upload.single("image"),
  asyncHandler(async (request, response) => {
    const prompt = parsePrompt(request.body);

    if (!request.file) {
      throw new HttpError(400, "MISSING_IMAGE_FILE", "图片编辑模式必须上传一张原始图片。");
    }

    request.file.mimetype = resolveUploadMimeType(request.file);

    response
      .status(202)
      .json(await jobService.createImageBasedJob(ImageMode.IMAGE_EDIT, prompt, request.file));
  }),
);

imageRouter.post(
  "/variation",
  upload.single("image"),
  asyncHandler(async (request, response) => {
    const prompt = parsePrompt(request.body);

    if (!request.file) {
      throw new HttpError(400, "MISSING_IMAGE_FILE", "以图生图模式必须上传一张参考图片。");
    }

    request.file.mimetype = resolveUploadMimeType(request.file);

    response
      .status(202)
      .json(await jobService.createImageBasedJob(ImageMode.IMAGE_VARIATION, prompt, request.file));
  }),
);
