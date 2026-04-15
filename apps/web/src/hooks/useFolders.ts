import { useCallback, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import type { FolderItem } from "../types/api";

export function useFolders() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.listFolders();
      setFolders(response.items);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : "读取文件夹列表失败。",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    folders,
    loading,
    error,
    refresh,
  };
}
