import { randomUUID } from "node:crypto";
import path from "node:path";

import type { Express } from "express";
import { ImageMode } from "@prisma/client";
import { BlobServiceClient } from "@azure/storage-blob";
import { extension as getExtension } from "mime-types";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { HttpError } from "../../utils/http-error";
import type { NormalizedGeneratedImage } from "../../providers/image-provider";

const requiredContainers = [
  "uploads-temp",
  "generated-temp",
  "library-original",
  "library-thumb",
] as const;

type RequiredContainer = (typeof requiredContainers)[number];
type UploadImageMode = ImageMode | "edit" | "variation";

function resolveModePath(mode: UploadImageMode) {
  switch (mode) {
    case ImageMode.IMAGE_EDIT:
    case "edit":
      return "image-edit";
    case ImageMode.IMAGE_VARIATION:
    case "variation":
      return "image-variation";
    case ImageMode.TEXT_TO_IMAGE:
    default:
      return "text-to-image";
  }
}

export class BlobStorageService {
  private readonly client: BlobServiceClient | null;

  constructor() {
    this.client = env.AZURE_STORAGE_CONNECTION_STRING
      ? BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING)
      : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async ensureRequiredContainers() {
    if (!this.client) {
      logger.warn("Azure Blob Storage is not configured. Container creation skipped.");
      return;
    }

    for (const containerName of requiredContainers) {
      await this.client.getContainerClient(containerName).createIfNotExists();
    }
  }

  async getHealth() {
    if (!this.client) {
      return {
        status: "DEGRADED" as const,
        message: "Azure Blob Storage connection string is not configured yet.",
      };
    }

    try {
      await this.client.getProperties();

      return {
        status: "NORMAL" as const,
        message: "Blob Storage connection is available.",
      };
    } catch (error) {
      logger.error({ error }, "Blob Storage health check failed.");

      return {
        status: "UNAVAILABLE" as const,
        message: "Blob Storage connection failed. Check the connection string and network access.",
      };
    }
  }

  async getStorageUsagePercent() {
    if (!this.client) {
      return null;
    }

    let totalBytes = 0;

    try {
      for (const containerName of requiredContainers) {
        const containerClient = this.client.getContainerClient(containerName);

        for await (const blob of containerClient.listBlobsFlat()) {
          totalBytes += blob.properties.contentLength ?? 0;
        }
      }

      return Number(((totalBytes / env.STORAGE_CAPACITY_BYTES) * 100).toFixed(2));
    } catch (error) {
      logger.warn({ error }, "Failed to estimate storage usage percent.");
      return null;
    }
  }

  async uploadTempInput(file: Express.Multer.File, mode: "edit" | "variation") {
    if (!this.client) {
      throw new HttpError(
        503,
        "BLOB_NOT_CONFIGURED",
        "Azure Blob Storage is not configured. Please provide AZURE_STORAGE_CONNECTION_STRING.",
      );
    }

    const extension = path.extname(file.originalname || "") || ".bin";
    const blobPath = `${new Date().toISOString().slice(0, 10)}/${mode}/${randomUUID()}${extension}`;
    const containerName = env.blobContainers.uploadsTemp;
    const blockBlobClient = this.client
      .getContainerClient(containerName)
      .getBlockBlobClient(blobPath);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: {
        blobContentType: file.mimetype,
      },
    });

    return {
      containerName,
      blobPath,
      contentType: file.mimetype,
      size: file.size,
    };
  }

  async uploadGeneratedResult(
    image: NormalizedGeneratedImage,
    mode: UploadImageMode = ImageMode.TEXT_TO_IMAGE,
  ) {
    if (!this.client) {
      throw new HttpError(
        503,
        "BLOB_NOT_CONFIGURED",
        "Azure Blob Storage is not configured. Please provide AZURE_STORAGE_CONNECTION_STRING.",
      );
    }

    const containerName = env.blobContainers.generatedTemp;
    const fileExtension = getExtension(image.mimeType) || "png";
    const buffer = Buffer.from(image.dataBase64, "base64");
    const blobPath = `${new Date().toISOString().slice(0, 10)}/${resolveModePath(mode)}/${randomUUID()}.${fileExtension}`;

    await this.uploadBufferToContainer(containerName, blobPath, buffer, image.mimeType);

    return {
      containerName,
      blobPath,
      contentType: image.mimeType,
      size: buffer.length,
    };
  }

  async downloadBlobBuffer(containerName: string, blobPath: string) {
    const blobClient = this.getBlobClient(containerName, blobPath);
    const download = await blobClient.download();
    const buffer = await blobClient.downloadToBuffer();

    return {
      buffer,
      contentType: download.contentType ?? "application/octet-stream",
      contentLength: buffer.length,
      fileName: path.basename(blobPath),
    };
  }

  async uploadLibraryAsset(input: {
    buffer: Buffer;
    mimeType: string;
    mode: ImageMode;
    fileName?: string;
  }) {
    if (!this.client) {
      throw new HttpError(
        503,
        "BLOB_NOT_CONFIGURED",
        "Azure Blob Storage is not configured. Please provide AZURE_STORAGE_CONNECTION_STRING.",
      );
    }

    const extension = getExtension(input.mimeType) || path.extname(input.fileName ?? "") || "png";
    const normalizedExtension = String(extension).replace(/^\./, "");
    const blobPath = `${new Date().toISOString().slice(0, 10)}/${resolveModePath(input.mode)}/${randomUUID()}.${normalizedExtension}`;

    await this.uploadBufferToContainer(
      env.blobContainers.libraryOriginal,
      blobPath,
      input.buffer,
      input.mimeType,
    );

    return {
      containerName: env.blobContainers.libraryOriginal,
      blobPath,
      fileName: input.fileName || path.basename(blobPath),
      contentType: input.mimeType,
      size: input.buffer.length,
    };
  }

  async getBlobDownload(containerName: string, blobPath: string) {
    const blobClient = this.getBlobClient(containerName, blobPath);
    return blobClient.download();
  }

  getProxyUrl(containerName: string, blobPath: string) {
    return `/api/files/${encodeURIComponent(containerName)}?path=${encodeURIComponent(blobPath)}`;
  }

  private getBlobClient(containerName: string, blobPath: string) {
    if (!this.client) {
      throw new HttpError(
        503,
        "BLOB_NOT_CONFIGURED",
        "Azure Blob Storage is not configured. Please provide AZURE_STORAGE_CONNECTION_STRING.",
      );
    }

    if (!requiredContainers.includes(containerName as RequiredContainer)) {
      throw new HttpError(400, "INVALID_CONTAINER", "The requested blob container is not allowed.");
    }

    return this.client.getContainerClient(containerName).getBlobClient(blobPath);
  }

  private async uploadBufferToContainer(
    containerName: string,
    blobPath: string,
    buffer: Buffer,
    contentType: string,
  ) {
    const blockBlobClient = this.client
      ?.getContainerClient(containerName)
      .getBlockBlobClient(blobPath);

    if (!blockBlobClient) {
      throw new HttpError(
        503,
        "BLOB_NOT_CONFIGURED",
        "Azure Blob Storage is not configured. Please provide AZURE_STORAGE_CONNECTION_STRING.",
      );
    }

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
    });
  }
}

export const blobStorageService = new BlobStorageService();
