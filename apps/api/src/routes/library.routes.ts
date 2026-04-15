import { Router } from "express";
import { z } from "zod";

import { libraryService } from "../services/library/library.service";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";

const createFolderSchema = z.object({
  name: z.string().trim().min(1, "文件夹名称不能为空。").max(80, "文件夹名称不能超过 80 个字符。"),
  description: z.string().trim().max(240, "文件夹描述不能超过 240 个字符。").optional(),
});

const saveGeneratedSchema = z.object({
  jobId: z.string().trim().min(1, "jobId 不能为空。"),
  folderId: z.string().trim().min(1, "folderId 不能为空。"),
});

export const libraryRouter = Router();

libraryRouter.get(
  "/folders",
  asyncHandler(async (_request, response) => {
    response.json({
      items: await libraryService.listFolders(),
    });
  }),
);

libraryRouter.post(
  "/folders",
  asyncHandler(async (request, response) => {
    const parsed = createFolderSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new HttpError(400, "INVALID_FOLDER_INPUT", "文件夹参数不合法。", parsed.error.flatten());
    }

    response.status(201).json(await libraryService.createFolder(parsed.data));
  }),
);

libraryRouter.get(
  "/folders/:folderId",
  asyncHandler(async (request, response) => {
    response.json(await libraryService.getFolder(request.params.folderId));
  }),
);

libraryRouter.get(
  "/folders/:folderId/images",
  asyncHandler(async (request, response) => {
    response.json({
      items: await libraryService.getFolderImages(request.params.folderId),
    });
  }),
);

libraryRouter.get(
  "/images/:imageId",
  asyncHandler(async (request, response) => {
    response.json(await libraryService.getImage(request.params.imageId));
  }),
);

libraryRouter.post(
  "/save-generated",
  asyncHandler(async (request, response) => {
    const parsed = saveGeneratedSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "INVALID_SAVE_GENERATED_INPUT",
        "保存生成结果的参数不合法。",
        parsed.error.flatten(),
      );
    }

    response.status(201).json(await libraryService.saveGeneratedToFolder(parsed.data));
  }),
);
