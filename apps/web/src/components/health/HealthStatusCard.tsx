import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import type { HealthStatus } from "../../types/api";
import { formatDateTime, formatPercent } from "../../utils/formatters";
import { useHealth } from "../../hooks/useHealth";

const componentLabels: Record<string, string> = {
  frontend: "Web 前端",
  backend: "后端 API",
  externalAi: "外部 AI 接口",
  blobStorage: "Blob Storage",
  metadataStore: "数据库",
};

function getStatusColor(status: HealthStatus) {
  switch (status) {
    case "NORMAL":
      return "success";
    case "DEGRADED":
      return "warning";
    case "UNAVAILABLE":
    default:
      return "error";
  }
}

export function HealthStatusCard() {
  const { summary, detail, loading, error, refresh } = useHealth();

  return (
    <Accordion
      disableGutters
      sx={{
        width: { xs: "100%", lg: "auto" },
        minWidth: { xs: "auto", lg: 360 },
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.96)",
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack spacing={0.5} sx={{ width: "100%" }}>
          <Typography variant="subtitle2" color="text.secondary">
            应用健康状态
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              label={summary?.overallStatus || "加载中"}
              color={summary ? getStatusColor(summary.overallStatus) : "default"}
              size="small"
            />
            {loading && <CircularProgress size={16} />}
            {summary && (
              <Typography variant="body2" color="text.secondary">
                成功率 {formatPercent(summary.recentSuccessRate)} / 存储使用率{" "}
                {formatPercent(summary.storageUsagePercent)}
              </Typography>
            )}
          </Stack>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => void refresh()}
            sx={{ alignSelf: "flex-start" }}
          >
            立即刷新
          </Button>
          {detail && (
            <Stack spacing={1.5}>
              {Object.entries(detail.components).map(([key, component]) => (
                <Box key={key}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2">{componentLabels[key] || key}</Typography>
                    <Chip
                      size="small"
                      label={component.status}
                      color={getStatusColor(component.status)}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {component.message}
                  </Typography>
                </Box>
              ))}
              <Divider />
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary">
                  最近检查时间：{formatDateTime(detail.checkedAt)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Azure China 资源组：{detail.details.deployment.resourceGroup}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  部署区域：{detail.details.deployment.location}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Provider：{detail.details.provider.providerName} / {detail.details.provider.modelName}
                </Typography>
              </Stack>
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
