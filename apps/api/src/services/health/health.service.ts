import {
  GenerationJobStatus,
  HealthComponentStatus,
} from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { imageProvider } from "../../providers/provider-factory";
import type { HealthDetailResponse, HealthSummaryResponse } from "../../types/api";
import { blobStorageService } from "../storage/blob-storage.service";
import { getFrontendHeartbeatTimestamp } from "./frontend-heartbeat.store";

function rankStatus(status: HealthComponentStatus) {
  switch (status) {
    case HealthComponentStatus.UNAVAILABLE:
      return 3;
    case HealthComponentStatus.DEGRADED:
      return 2;
    case HealthComponentStatus.NORMAL:
    default:
      return 1;
  }
}

function getOverallStatus(statuses: HealthComponentStatus[]) {
  return statuses.reduce((worst, current) => {
    if (rankStatus(current) > rankStatus(worst)) {
      return current;
    }

    return worst;
  }, HealthComponentStatus.NORMAL);
}

async function getMetadataStoreComponent() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");

    return {
      status: HealthComponentStatus.NORMAL,
      message: "PostgreSQL / Prisma 连接正常。",
    };
  } catch {
    return {
      status: HealthComponentStatus.UNAVAILABLE,
      message: "数据库连接失败，请检查 DATABASE_URL 与 PostgreSQL 服务。",
    };
  }
}

async function getRecentSuccessRate() {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const [succeededCount, failedCount] = await Promise.all([
      prisma.generationJob.count({
        where: {
          createdAt: {
            gte: fifteenMinutesAgo,
          },
          status: GenerationJobStatus.SUCCEEDED,
        },
      }),
      prisma.generationJob.count({
        where: {
          createdAt: {
            gte: fifteenMinutesAgo,
          },
          status: GenerationJobStatus.FAILED,
        },
      }),
    ]);

    const totalFinished = succeededCount + failedCount;

    if (totalFinished === 0) {
      return null;
    }

    return Number(((succeededCount / totalFinished) * 100).toFixed(2));
  } catch {
    return null;
  }
}

function getFrontendComponent() {
  const lastPingAt = getFrontendHeartbeatTimestamp();

  if (!lastPingAt) {
    return {
      status: HealthComponentStatus.DEGRADED,
      message: "前端心跳暂未上报。",
      lastPingAt: null,
    };
  }

  const ageMs = Date.now() - lastPingAt.getTime();
  const status =
    ageMs <= env.HEALTH_FRONTEND_STALE_MS
      ? HealthComponentStatus.NORMAL
      : HealthComponentStatus.DEGRADED;

  return {
    status,
    message: status === HealthComponentStatus.NORMAL ? "前端心跳正常。" : "前端心跳已过期。",
    lastPingAt: lastPingAt.toISOString(),
  };
}

export class HealthService {
  async getSummary(): Promise<HealthSummaryResponse> {
    const frontend = getFrontendComponent();
    const metadataStore = await getMetadataStoreComponent();
    const blobStorage = await blobStorageService.getHealth();
    const externalAi = await imageProvider.checkHealth();
    const recentSuccessRate = await getRecentSuccessRate();
    const storageUsagePercent = await blobStorageService.getStorageUsagePercent();
    const checkedAt = new Date().toISOString();

    const summary: HealthSummaryResponse = {
      overallStatus: getOverallStatus([
        frontend.status,
        HealthComponentStatus.NORMAL,
        externalAi.status as HealthComponentStatus,
        blobStorage.status as HealthComponentStatus,
        metadataStore.status,
      ]),
      checkedAt,
      recentSuccessRate,
      storageUsagePercent,
      components: {
        frontend: {
          status: frontend.status,
          message: frontend.message,
        },
        backend: {
          status: HealthComponentStatus.NORMAL,
          message: "后端 API 运行中。",
        },
        externalAi: {
          status: externalAi.status as HealthComponentStatus,
          message: externalAi.message,
        },
        blobStorage: {
          status: blobStorage.status as HealthComponentStatus,
          message: blobStorage.message,
        },
        metadataStore: {
          status: metadataStore.status,
          message: metadataStore.message,
        },
      },
    };

    await this.recordSnapshot(summary, {
      frontendLastPingAt: frontend.lastPingAt,
    });

    return summary;
  }

  async getDetail(): Promise<HealthDetailResponse> {
    const summary = await this.getSummary();

    return {
      ...summary,
      details: {
        deployment: {
          subscriptionId: env.AZURE_CHINA_SUBSCRIPTION_ID ?? null,
          resourceGroup: env.AZURE_RESOURCE_GROUP,
          location: env.AZURE_LOCATION,
        },
        provider: {
          providerName: env.IMAGE_PROVIDER,
          modelName: env.IMAGE_MODEL_NAME,
          generatePath: env.IMAGE_GENERATE_PATH,
          editPath: env.IMAGE_EDIT_PATH,
          variationPath: env.IMAGE_VARIATION_PATH || env.IMAGE_EDIT_PATH,
        },
        frontendLastPingAt: getFrontendHeartbeatTimestamp()?.toISOString() ?? null,
      },
    };
  }

  private async recordSnapshot(
    summary: HealthSummaryResponse,
    details: Record<string, string | null>,
  ) {
    try {
      await prisma.healthSnapshot.create({
        data: {
          frontendStatus: summary.components.frontend.status,
          backendStatus: summary.components.backend.status,
          externalAiStatus: summary.components.externalAi.status,
          blobStorageStatus: summary.components.blobStorage.status,
          metadataStoreStatus: summary.components.metadataStore.status,
          recentSuccessRate: summary.recentSuccessRate,
          storageUsagePercent: summary.storageUsagePercent,
          checkedAt: new Date(summary.checkedAt),
          details,
        },
      });
    } catch {
      // 健康快照写入失败不应影响健康接口本身。
    }
  }
}

export const healthService = new HealthService();
