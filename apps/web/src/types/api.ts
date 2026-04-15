export type HealthStatus = "NORMAL" | "DEGRADED" | "UNAVAILABLE";

export interface HealthSummaryResponse {
  overallStatus: HealthStatus;
  checkedAt: string;
  recentSuccessRate: number | null;
  storageUsagePercent: number | null;
  components: {
    frontend: { status: HealthStatus; message: string };
    backend: { status: HealthStatus; message: string };
    externalAi: { status: HealthStatus; message: string };
    blobStorage: { status: HealthStatus; message: string };
    metadataStore: { status: HealthStatus; message: string };
  };
}

export interface HealthDetailResponse extends HealthSummaryResponse {
  details: {
    deployment: {
      subscriptionId: string | null;
      resourceGroup: string;
      location: string;
    };
    provider: {
      providerName: string;
      modelName: string;
      generatePath: string;
      editPath: string;
      variationPath: string;
    };
    frontendLastPingAt: string | null;
  };
}

export interface FolderItem {
  id: string;
  name: string;
  description: string | null;
  imageCount: number;
  coverImageId: string | null;
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageItem {
  id: string;
  folderId: string;
  fileName: string;
  sourceMode: "TEXT_TO_IMAGE" | "IMAGE_EDIT" | "IMAGE_VARIATION";
  promptText: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  externalRequestId: string | null;
  createdAt: string;
  thumbnailUrl: string;
  originalUrl: string;
}

export interface ImageDetail extends ImageItem {
  folder: {
    id: string;
    name: string;
  };
  sourceImageBlobPath: string | null;
}

export interface JobCreatedResponse {
  jobId: string;
  status: string;
  message: string;
}

export interface JobResponse {
  id: string;
  mode: "TEXT_TO_IMAGE" | "IMAGE_EDIT" | "IMAGE_VARIATION";
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  promptText: string | null;
  inputImageUrl: string | null;
  resultImageUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveGeneratedResponse {
  message: string;
  image: ImageDetail;
}
