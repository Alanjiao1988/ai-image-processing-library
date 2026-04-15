import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

import { apiClient } from "../../api/client";
import { useGenerationJob } from "../../hooks/useGenerationJob";
import { SaveToFolderDialog } from "../library/SaveToFolderDialog";
import { GenerationJobStatusCard } from "./GenerationJobStatusCard";

export function ImageVariationTab() {
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
      setError("请先上传一张参考图片。");
      return;
    }

    setSaveMessage(null);
    await startJob(() => apiClient.createImageVariationJob(prompt, image));
  };

  return (
    <>
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6">以图生图</Typography>
              <Typography variant="body2" color="text.secondary">
                上传参考图并填写提示词。产品层保留独立页签，模型层由 adapter 决定是调用独立
                variation 接口，还是回退复用编辑接口。
              </Typography>
            </Box>

            {saveMessage && <Alert severity="success">{saveMessage}</Alert>}

            <Stack spacing={1}>
              <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                {image ? "更换参考图" : "上传参考图"}
                <input
                  hidden
                  accept="image/*"
                  type="file"
                  onChange={(event) => setImage(event.target.files?.[0] ?? null)}
                />
              </Button>
              <Typography variant="body2" color="text.secondary">
                {image ? `已选择：${image.name}` : "后端会统一做文件类型和大小校验。"}
              </Typography>
            </Stack>

            <TextField
              label="参考生成提示词"
              placeholder="例如：延续参考图的视觉语言，改为城市夜景广告画面，保留高级感"
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
