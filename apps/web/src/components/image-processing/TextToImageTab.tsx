import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

import { apiClient } from "../../api/client";
import { useGenerationJob } from "../../hooks/useGenerationJob";
import { GenerationJobStatusCard } from "./GenerationJobStatusCard";
import { SaveToFolderDialog } from "../library/SaveToFolderDialog";

export function TextToImageTab() {
  const [prompt, setPrompt] = useState("");
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
  } = useGenerationJob();

  const handleSubmit = async () => {
    setSaveMessage(null);
    await startJob(() => apiClient.createTextToImageJob(prompt));
  };

  return (
    <>
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6">文生图</Typography>
              <Typography variant="body2" color="text.secondary">
                输入提示词后创建任务。结果先落到 `generated-temp`，确认满意后再手动保存到图片库。
              </Typography>
            </Box>

            {saveMessage && <Alert severity="success">{saveMessage}</Alert>}

            <TextField
              label="提示词"
              placeholder="例如：现代企业展厅中的数字大屏，冷静蓝色光效，写实风格"
              multiline
              minRows={5}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />

            <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                默认一次生成 1 张，成功后可直接保存到图片库指定文件夹。
              </Typography>
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                disabled={isBusy || !prompt.trim()}
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
