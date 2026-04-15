import { useCallback, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import type { HealthDetailResponse, HealthSummaryResponse } from "../types/api";

const REFRESH_MS = Number(import.meta.env.VITE_HEALTH_REFRESH_MS || 60000);

export function useHealth() {
  const [summary, setSummary] = useState<HealthSummaryResponse | null>(null);
  const [detail, setDetail] = useState<HealthDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      await apiClient.pingFrontend();
      const [summaryResponse, detailResponse] = await Promise.all([
        apiClient.getHealthSummary(),
        apiClient.getHealthDetail(),
      ]);
      setSummary(summaryResponse);
      setDetail(detailResponse);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "健康状态读取失败，请检查后端服务。",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [refresh]);

  return {
    summary,
    detail,
    loading,
    error,
    refresh,
  };
}
