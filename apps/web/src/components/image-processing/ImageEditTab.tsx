import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

import { apiClient } from "../../api/client";
import { useGenerationJob } from "../../hooks/useGenerationJob";
import { SaveToFolderDialog } from "../library/SaveToFolderDialog";
import { GenerationJobStatusCard } from "./GenerationJobStatusCard";

export function ImageEditTab() {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const {
    submitting,
    jobMessage,
    job,
    error,
    pollIntervalMs,
    isPolling,
    isBusy,
    startJob,
    setError,
  } = useGenerationJob();

  const handleSubmit = async () => {
    if (!image) {
      setError("请先选择一张待编辑图片。");
      return;
    }

    setSaveMessage(null);
    await startJob(() => apiClient.createImageEditJob(prompt, image));
  };

  return (
    <>
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6">图片编辑</Typography>
              <Typography variant="body2" color="text.secondary">
                上传一张原图并填写编辑提示词。上传文件会先进入 `uploads-temp`，生成结果会进入
                `generated-temp` 供你确认。
              </Typography>
            </Box>

            {saveMessage && <Alert severity="success">{saveMessage}</Alert>}

            <Stack spacing={1}>
              <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                {image ? "更换图片" : "选择图片"}
                <input
                  hidden
                  accept="image/*"
                  type="file"
                  onChange={(event) => setImage(event.target.files?.[0] ?? null)}
                />
              </Button>
              <Typography variant="body2" color="text.secondary">
                {image ? `已选择：${image.name}` : "支持常见图片格式，实际大小校验由后端统一控制。"}
              </Typography>
            </Stack>

            <TextField
              label="编辑提示词"
              placeholder="例如：保留主体构图，将背景改为现代办公空间，提升光线层次"
              multiline
              minRows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />

            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="contained"
                disabled={isBusy || !prompt.trim() || !image}
                onClick={() => void handleSubmit()}
              >
                {submitting ? "创建中..." : isPolling ? "处理中..." : "生成"}
              </Button>
            </Stack>

            <GenerationJobStatusCard
              error={error}
              jobMessage={jobMessage}
              job={job}
              isPolling={isPolling}
              pollIntervalMs={pollIntervalMs}
              onSave={() => setSaveDialogOpen(true)}
            />
          </Stack>
        </CardContent>
      </Card>

      <SaveToFolderDialog
        open={saveDialogOpen}
        jobId={job?.status === "SUCCEEDED" ? job.id : null}
        onClose={() => setSaveDialogOpen(false)}
        onSaved={(response) => {
          setSaveMessage(response.message);
        }}
      />
    </>
  );
}
