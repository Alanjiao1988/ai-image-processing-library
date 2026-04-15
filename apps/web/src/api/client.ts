import type {
  FolderItem,
  HealthDetailResponse,
  HealthSummaryResponse,
  ImageDetail,
  ImageItem,
  JobCreatedResponse,
  JobResponse,
  SaveGeneratedResponse,
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = "请求失败，请稍后重试。";

    try {
      const data = (await response.json()) as {
        error?: { message?: string };
      };
      message = data.error?.message || message;
    } catch {
      // ignore json parse failures
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  pingFrontend: () =>
    request<void>("/api/health/frontend-ping", {
      method: "POST",
    }),
  getHealthSummary: () => request<HealthSummaryResponse>("/api/health/summary"),
  getHealthDetail: () => request<HealthDetailResponse>("/api/health/detail"),
  listFolders: () => request<{ items: FolderItem[] }>("/api/library/folders"),
  createFolder: (payload: { name: string; description?: string }) =>
    request<FolderItem>("/api/library/folders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  getFolder: (folderId: string) => request<FolderItem>(`/api/library/folders/${folderId}`),
  getFolderImages: (folderId: string) =>
    request<{ items: ImageItem[] }>(`/api/library/folders/${folderId}/images`),
  getImage: (imageId: string) => request<ImageDetail>(`/api/library/images/${imageId}`),
  saveGenerated: (payload: { jobId: string; folderId: string }) =>
    request<SaveGeneratedResponse>("/api/library/save-generated", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  createTextToImageJob: (prompt: string) =>
    request<JobCreatedResponse>("/api/image/text-to-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    }),
  createImageEditJob: (prompt: string, image: File) => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("image", image);

    return request<JobCreatedResponse>("/api/image/edit", {
      method: "POST",
      body: formData,
    });
  },
  createImageVariationJob: (prompt: string, image: File) => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("image", image);

    return request<JobCreatedResponse>("/api/image/variation", {
      method: "POST",
      body: formData,
    });
  },
  getJob: (jobId: string) => request<JobResponse>(`/api/jobs/${jobId}`),
};
