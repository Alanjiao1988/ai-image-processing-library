import type { GenerationJobStatus, HealthComponentStatus, ImageMode } from "@prisma/client";

export interface HealthComponentSummary {
  status: HealthComponentStatus;
  message: string;
}

export interface HealthSummaryResponse {
  overallStatus: HealthComponentStatus;
  checkedAt: string;
  recentSuccessRate: number | null;
  storageUsagePercent: number | null;
  components: {
    frontend: HealthComponentSummary;
    backend: HealthComponentSummary;
    externalAi: HealthComponentSummary;
    blobStorage: HealthComponentSummary;
    metadataStore: HealthComponentSummary;
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

export interface JobCreatedResponse {
  jobId: string;
  status: GenerationJobStatus;
  message: string;
}

export interface JobResponse {
  id: string;
  mode: ImageMode;
  status: GenerationJobStatus;
  promptText: string | null;
  inputImageUrl: string | null;
  resultImageUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
