export interface ProviderHealthCheckResult {
  status: "NORMAL" | "DEGRADED" | "UNAVAILABLE";
  message: string;
}

export interface TextToImageRequest {
  prompt: string;
  count?: number;
  size?: string;
  aspectRatio?: string;
  quality?: string;
}

export interface ImageEditRequest extends TextToImageRequest {
  inputImageBlobPath: string;
}

export interface ImageVariationRequest extends TextToImageRequest {
  referenceImageBlobPath: string;
}

export interface NormalizedGeneratedImage {
  mimeType: string;
  fileName: string;
  dataBase64: string;
  width?: number;
  height?: number;
  externalRequestId?: string;
}

export interface ImageProvider {
  readonly providerName: string;
  checkHealth(): Promise<ProviderHealthCheckResult>;
  generate(request: TextToImageRequest): Promise<NormalizedGeneratedImage[]>;
  edit(request: ImageEditRequest): Promise<NormalizedGeneratedImage[]>;
  variation(request: ImageVariationRequest): Promise<NormalizedGeneratedImage[]>;
}
