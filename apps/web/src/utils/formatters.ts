export function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatPercent(value?: number | null) {
  if (value === null || value === undefined) {
    return "--";
  }

  return `${value.toFixed(2)}%`;
}

export function formatFileSize(value?: number | null) {
  if (!value) {
    return "--";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
