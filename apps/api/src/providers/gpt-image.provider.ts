import { env } from "../config/env";
import { logger } from "../lib/logger";
import { blobStorageService } from "../services/storage/blob-storage.service";
import { HttpError } from "../utils/http-error";
import type {
  ImageEditRequest,
  ImageProvider,
  ImageVariationRequest,
  NormalizedGeneratedImage,
  ProviderHealthCheckResult,
  TextToImageRequest,
} from "./image-provider";

interface OpenAiCompatibleImageData {
  b64_json?: string;
  mime_type?: string;
  url?: string;
  width?: number;
  height?: number;
}

interface OpenAiCompatibleImageResponse {
  created?: number;
  data?: OpenAiCompatibleImageData[];
  images?: OpenAiCompatibleImageData[];
  request_id?: string;
}

interface GenerateRequestPayload {
  prompt: string;
  n: number;
  size?: string;
  model?: string;
  response_format?: string;
}

interface MultipartRequestInput {
  endpointPath: string;
  prompt?: string;
  imageBlobPath: string;
  size?: string;
  count?: number;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function shouldRetry(statusCode: number) {
  return statusCode === 429 || statusCode >= 500;
}

function parseRetryDelayFromMessage(message: string) {
  const matchedSeconds = message.match(/retry after\s+(\d+)\s+seconds/i);
  if (matchedSeconds) {
    return Number(matchedSeconds[1]) * 1000;
  }

  const matchedMilliseconds = message.match(/retry after\s+(\d+)\s+milliseconds/i);
  if (matchedMilliseconds) {
    return Number(matchedMilliseconds[1]);
  }

  return null;
}

export class GptImageProvider implements ImageProvider {
  readonly providerName = "gpt-image";

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    if (!env.IMAGE_API_BASE_URL || !env.IMAGE_API_KEY) {
      return {
        status: "DEGRADED",
        message: "外部 GPT-image Provider 或 APIM 网关地址尚未完整配置。",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(env.IMAGE_TIMEOUT_MS, 10000));

    try {
      const response = await fetch(this.buildEndpoint(this.deriveHealthPath()), {
        method: "GET",
        headers: this.buildAuthHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          status: "UNAVAILABLE",
          message: `外部 GPT-image 健康检查返回 HTTP ${response.status}。`,
        };
      }

      return {
        status: "NORMAL",
        message: `Provider 已配置为 ${env.IMAGE_MODEL_NAME}，文生图将通过 ${env.IMAGE_GENERATE_PATH} 调用。`,
      };
    } catch (error) {
      clearTimeout(timeout);

      return {
        status: "UNAVAILABLE",
        message:
          error instanceof Error
            ? `外部 GPT-image 健康检查失败：${error.message}`
            : "外部 GPT-image 健康检查失败。",
      };
    }
  }

  async generate(request: TextToImageRequest): Promise<NormalizedGeneratedImage[]> {
    if (!env.IMAGE_API_BASE_URL || !env.IMAGE_API_KEY) {
      throw new HttpError(
        503,
        "IMAGE_PROVIDER_NOT_CONFIGURED",
        "外部图片模型未配置完成，请检查 IMAGE_API_BASE_URL 和 IMAGE_API_KEY。",
      );
    }

    const endpoint = this.buildEndpoint(env.IMAGE_GENERATE_PATH);
    let requestPayload = this.buildGeneratePayload(request);

    for (let attempt = 0; attempt <= env.IMAGE_MAX_RETRY; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.IMAGE_TIMEOUT_MS);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            ...this.buildAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const responseText = await response.text();
          const message = responseText || `Provider returned HTTP ${response.status}.`;
          const trimmedPayload = this.tryTrimUnsupportedFields(requestPayload, message);

          if (trimmedPayload) {
            logger.warn(
              { endpoint, unsupportedFields: this.findUnsupportedFields(message) },
              "Provider rejected optional request fields; retrying with a narrower payload.",
            );
            requestPayload = trimmedPayload;
            attempt -= 1;
            continue;
          }

          if (attempt < env.IMAGE_MAX_RETRY && shouldRetry(response.status)) {
            const retryDelayMs = this.resolveRetryDelayMs(response, message, attempt);
            logger.warn(
              { attempt: attempt + 1, retryDelayMs, status: response.status, endpoint },
              "Retrying text-to-image request after transient provider error.",
            );
            await sleep(retryDelayMs);
            continue;
          }

          throw new HttpError(
            response.status,
            "IMAGE_PROVIDER_HTTP_ERROR",
            `外部图片接口调用失败：${message}`,
          );
        }

        const payload = (await response.json()) as OpenAiCompatibleImageResponse;
        return this.normalizeImageResponse(
          payload,
          response.headers.get("x-request-id") ?? payload.request_id ?? null,
        );
      } catch (error) {
        clearTimeout(timeout);

        if (error instanceof HttpError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < env.IMAGE_MAX_RETRY) {
            logger.warn(
              { attempt: attempt + 1, endpoint, timeoutMs: env.IMAGE_TIMEOUT_MS },
              "Retrying text-to-image request after timeout.",
            );
            await sleep((attempt + 1) * 1000);
            continue;
          }

          throw new HttpError(
            504,
            "IMAGE_PROVIDER_TIMEOUT",
            `外部图片接口调用超时，超过 ${env.IMAGE_TIMEOUT_MS}ms。`,
          );
        }

        if (attempt < env.IMAGE_MAX_RETRY) {
          logger.warn(
            { attempt: attempt + 1, endpoint, error },
            "Retrying text-to-image request after unexpected provider error.",
          );
          await sleep((attempt + 1) * 1000);
          continue;
        }

        throw new HttpError(
          502,
          "IMAGE_PROVIDER_REQUEST_FAILED",
          error instanceof Error
            ? `调用外部图片接口失败：${error.message}`
            : "调用外部图片接口失败。",
        );
      }
    }

    throw new HttpError(502, "IMAGE_PROVIDER_REQUEST_FAILED", "外部图片接口调用失败。");
  }

  async edit(_request: ImageEditRequest): Promise<NormalizedGeneratedImage[]> {
    return this.sendMultipartImageRequest({
      endpointPath: env.IMAGE_EDIT_PATH,
      imageBlobPath: _request.inputImageBlobPath,
      prompt: _request.prompt,
      size: _request.size,
      count: _request.count,
    });
  }

  async variation(_request: ImageVariationRequest): Promise<NormalizedGeneratedImage[]> {
    return this.sendMultipartImageRequest({
      endpointPath: this.resolveVariationPath(),
      imageBlobPath: _request.referenceImageBlobPath,
      prompt: _request.prompt,
      size: _request.size,
      count: _request.count,
    });
  }

  resolveVariationPath() {
    return env.IMAGE_VARIATION_PATH || env.IMAGE_EDIT_PATH;
  }

  private buildGeneratePayload(request: TextToImageRequest): GenerateRequestPayload {
    const payload: GenerateRequestPayload = {
      prompt: request.prompt,
      n: request.count ?? 1,
    };

    if (request.size) {
      payload.size = request.size;
    }

    if (env.IMAGE_MODEL_NAME) {
      payload.model = env.IMAGE_MODEL_NAME;
    }

    if (env.IMAGE_RESPONSE_FORMAT) {
      payload.response_format = env.IMAGE_RESPONSE_FORMAT;
    }

    return payload;
  }

  private buildAuthHeaders() {
    return {
      Authorization: `Bearer ${env.IMAGE_API_KEY}`,
      "api-key": env.IMAGE_API_KEY ?? "",
    };
  }

  private async sendMultipartImageRequest(input: MultipartRequestInput) {
    if (!env.IMAGE_API_BASE_URL || !env.IMAGE_API_KEY) {
      throw new HttpError(
        503,
        "IMAGE_PROVIDER_NOT_CONFIGURED",
        "外部图片模型未配置完成，请检查 IMAGE_API_BASE_URL 和 IMAGE_API_KEY。",
      );
    }

    const sourceImage = await blobStorageService.downloadBlobBuffer(
      env.blobContainers.uploadsTemp,
      input.imageBlobPath,
    );
    const endpoint = this.buildEndpoint(input.endpointPath);

    for (let attempt = 0; attempt <= env.IMAGE_MAX_RETRY; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.IMAGE_TIMEOUT_MS);

      try {
        const formData = new FormData();
        formData.append(
          "image",
          new Blob([Uint8Array.from(sourceImage.buffer)], { type: sourceImage.contentType }),
          sourceImage.fileName,
        );

        if (input.prompt) {
          formData.append("prompt", input.prompt);
        }

        if (input.size) {
          formData.append("size", input.size);
        }

        formData.append("n", String(input.count ?? 1));

        const response = await fetch(endpoint, {
          method: "POST",
          headers: this.buildAuthHeaders(),
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const message = (await response.text()) || `Provider returned HTTP ${response.status}.`;

          if (attempt < env.IMAGE_MAX_RETRY && shouldRetry(response.status)) {
            const retryDelayMs = this.resolveRetryDelayMs(response, message, attempt);
            logger.warn(
              { attempt: attempt + 1, endpoint, retryDelayMs, status: response.status },
              "Retrying multipart image request after transient provider error.",
            );
            await sleep(retryDelayMs);
            continue;
          }

          throw new HttpError(
            response.status,
            "IMAGE_PROVIDER_HTTP_ERROR",
            `外部图片接口调用失败：${message}`,
          );
        }

        const payload = (await response.json()) as OpenAiCompatibleImageResponse;
        return this.normalizeImageResponse(
          payload,
          response.headers.get("x-request-id") ?? payload.request_id ?? null,
        );
      } catch (error) {
        clearTimeout(timeout);

        if (error instanceof HttpError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < env.IMAGE_MAX_RETRY) {
            logger.warn(
              { attempt: attempt + 1, endpoint, timeoutMs: env.IMAGE_TIMEOUT_MS },
              "Retrying multipart image request after timeout.",
            );
            await sleep((attempt + 1) * 1000);
            continue;
          }

          throw new HttpError(
            504,
            "IMAGE_PROVIDER_TIMEOUT",
            `外部图片接口调用超时，超过 ${env.IMAGE_TIMEOUT_MS}ms。`,
          );
        }

        if (attempt < env.IMAGE_MAX_RETRY) {
          logger.warn(
            { attempt: attempt + 1, endpoint, error },
            "Retrying multipart image request after unexpected provider error.",
          );
          await sleep((attempt + 1) * 1000);
          continue;
        }

        throw new HttpError(
          502,
          "IMAGE_PROVIDER_REQUEST_FAILED",
          error instanceof Error
            ? `调用外部图片接口失败：${error.message}`
            : "调用外部图片接口失败。",
        );
      }
    }

    throw new HttpError(502, "IMAGE_PROVIDER_REQUEST_FAILED", "外部图片接口调用失败。");
  }

  private deriveHealthPath() {
    const generatePath = env.IMAGE_GENERATE_PATH || "/v1/images/generations";
    if (generatePath.includes("/images/")) {
      return generatePath.replace(/\/images\/[^/]+$/, "/health");
    }

    return "/health";
  }

  private buildEndpoint(apiPath: string) {
    const normalizedBaseUrl = env.IMAGE_API_BASE_URL?.replace(/\/+$/, "") ?? "";
    const normalizedPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;

    if (
      normalizedBaseUrl.endsWith("/v1") &&
      (normalizedPath === "/v1" || normalizedPath.startsWith("/v1/"))
    ) {
      const deduplicatedPath = normalizedPath === "/v1" ? "" : normalizedPath.slice(3);
      return `${normalizedBaseUrl}${deduplicatedPath}`;
    }

    return `${normalizedBaseUrl}${normalizedPath}`;
  }

  private resolveRetryDelayMs(response: Response, message: string, attempt: number) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMsHeader = response.headers.get("retry-after-ms");

    if (retryAfterMsHeader) {
      const retryAfterMs = Number(retryAfterMsHeader);
      if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        return retryAfterMs;
      }
    }

    if (retryAfterHeader) {
      const retryAfterSeconds = Number(retryAfterHeader);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000;
      }
    }

    const parsedDelay = parseRetryDelayFromMessage(message);
    if (parsedDelay && parsedDelay > 0) {
      return parsedDelay;
    }

    return (attempt + 1) * 1000;
  }

  private findUnsupportedFields(message: string) {
    const unsupportedFields = Array.from(
      message.matchAll(/Unknown parameter:\s*'([^']+)'/g),
      (match) => match[1],
    );

    return unsupportedFields.filter((field): field is keyof GenerateRequestPayload =>
      field === "model" || field === "response_format",
    );
  }

  private tryTrimUnsupportedFields(payload: GenerateRequestPayload, message: string) {
    const unsupportedFields = this.findUnsupportedFields(message);

    if (unsupportedFields.length === 0) {
      return null;
    }

    const nextPayload = { ...payload };

    unsupportedFields.forEach((field) => {
      delete nextPayload[field];
    });

    const payloadChanged = unsupportedFields.some((field) => field in payload);
    return payloadChanged ? nextPayload : null;
  }

  private async normalizeImageResponse(
    payload: OpenAiCompatibleImageResponse,
    requestIdHeader: string | null,
  ) {
    const images = payload.data ?? payload.images ?? [];

    if (images.length === 0) {
      throw new HttpError(
        502,
        "IMAGE_PROVIDER_EMPTY_RESPONSE",
        "外部图片接口未返回任何图片数据。",
      );
    }

    return Promise.all(
      images.map(async (image, index) => {
        const normalizedImage =
          image.b64_json ? this.normalizeBase64Image(image, index) : await this.downloadImage(image, index);

        return {
          ...normalizedImage,
          width: image.width,
          height: image.height,
          externalRequestId: requestIdHeader ?? undefined,
        };
      }),
    );
  }

  private normalizeBase64Image(image: OpenAiCompatibleImageData, index: number) {
    if (!image.b64_json) {
      throw new HttpError(
        502,
        "IMAGE_PROVIDER_INVALID_RESPONSE",
        "外部图片接口返回的图片缺少 b64_json 数据。",
      );
    }

    const mimeType = image.mime_type || "image/png";
    const subtype = mimeType.split("/")[1]?.split("+")[0] || "png";

    return {
      mimeType,
      fileName: `generated-${Date.now()}-${index + 1}.${subtype}`,
      dataBase64: image.b64_json,
    };
  }

  private async downloadImage(image: OpenAiCompatibleImageData, index: number) {
    if (!image.url) {
      throw new HttpError(
        502,
        "IMAGE_PROVIDER_INVALID_RESPONSE",
        "外部图片接口既没有返回 b64_json，也没有返回 url。",
      );
    }

    const response = await fetch(image.url);

    if (!response.ok) {
      throw new HttpError(
        502,
        "IMAGE_PROVIDER_DOWNLOAD_FAILED",
        `外部图片接口返回的 url 无法下载，HTTP ${response.status}。`,
      );
    }

    const mimeType = response.headers.get("content-type") || image.mime_type || "image/png";
    const subtype = mimeType.split("/")[1]?.split("+")[0] || "png";
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      mimeType,
      fileName: `generated-${Date.now()}-${index + 1}.${subtype}`,
      dataBase64: buffer.toString("base64"),
    };
  }
}
