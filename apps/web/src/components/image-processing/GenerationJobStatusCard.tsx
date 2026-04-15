import ImageIcon from "@mui/icons-material/Image";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";

import type { JobResponse } from "../../types/api";
import { formatDateTime } from "../../utils/formatters";

interface GenerationJobStatusCardProps {
  error: string | null;
  jobMessage: string | null;
  job: JobResponse | null;
  isPolling: boolean;
  pollIntervalMs: number;
  onSave: () => void;
}

export function GenerationJobStatusCard({
  error,
  jobMessage,
  job,
  isPolling,
  pollIntervalMs,
  onSave,
}: GenerationJobStatusCardProps) {
  if (!error && !jobMessage && !job && !isPolling) {
    return null;
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {jobMessage && job?.status !== "FAILED" && <Alert severity="info">{jobMessage}</Alert>}
      {job?.status === "FAILED" && (
        <Alert severity="error">{job.errorMessage || "生成任务执行失败。"}</Alert>
      )}
      {isPolling && (
        <Alert
          icon={<CircularProgress size={18} />}
          severity="info"
        >
          任务正在处理中，请稍候。当前轮询间隔为 {pollIntervalMs}ms。
        </Alert>
      )}

      {(job || isPolling) && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle1">任务状态</Typography>
                <Chip
                  label={job?.status || "PENDING"}
                  color={
                    job?.status === "SUCCEEDED"
                      ? "success"
                      : job?.status === "FAILED"
                        ? "error"
                        : "warning"
                  }
                  size="small"
                />
              </Stack>

              {job && (
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Job ID：{job.id}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    更新时间：{formatDateTime(job.updatedAt)}
                  </Typography>
                </Stack>
              )}

              {job?.inputImageUrl && (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    输入图片
                  </Typography>
                  <Box
                    component="img"
                    src={job.inputImageUrl}
                    alt="输入图片预览"
                    sx={{
                      width: "100%",
                      maxWidth: 280,
                      borderRadius: 3,
                      border: "1px solid rgba(15, 98, 254, 0.12)",
                      backgroundColor: "#f5f8fb",
                      objectFit: "cover",
                    }}
                  />
                </Stack>
              )}

              {job?.status === "SUCCEEDED" && job.resultImageUrl && (
                <Stack spacing={2}>
                  <Box
                    component="img"
                    src={job.resultImageUrl}
                    alt="AI 生成结果预览"
                    sx={{
                      width: "100%",
                      maxWidth: 720,
                      borderRadius: 3,
                      border: "1px solid rgba(15, 98, 254, 0.12)",
                      backgroundColor: "#f5f8fb",
                      objectFit: "contain",
                    }}
                  />
                  <Stack direction="row" spacing={1.5} flexWrap="wrap">
                    <Button
                      variant="outlined"
                      startIcon={<ImageIcon />}
                      href={job.resultImageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      新窗口查看
                    </Button>
                    <Button variant="contained" startIcon={<SaveAltIcon />} onClick={onSave}>
                      保存到图片库
                    </Button>
                  </Stack>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
