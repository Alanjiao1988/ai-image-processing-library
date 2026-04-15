import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

import type { SaveGeneratedResponse } from "../../types/api";
import { apiClient } from "../../api/client";
import { useFolders } from "../../hooks/useFolders";
import { CreateFolderDialog } from "./CreateFolderDialog";

interface SaveToFolderDialogProps {
  open: boolean;
  jobId: string | null;
  onClose: () => void;
  onSaved: (response: SaveGeneratedResponse) => void;
}

export function SaveToFolderDialog({
  open,
  jobId,
  onClose,
  onSaved,
}: SaveToFolderDialogProps) {
  const { folders, loading, error: foldersError, refresh } = useFolders();
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      return;
    }

    if (!selectedFolderId && folders[0]?.id) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, open, selectedFolderId]);

  const handleSave = async () => {
    if (!jobId) {
      setError("未找到可保存的生成任务。");
      return;
    }

    if (!selectedFolderId) {
      setError("请先选择目标文件夹。");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const response = await apiClient.saveGenerated({
        jobId,
        folderId: selectedFolderId,
      });
      onSaved(response);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存到图片库失败。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>保存到图片库</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {foldersError && <Alert severity="error">{foldersError}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {folders.length === 0 ? (
              <Alert severity="info">
                当前还没有可用文件夹。请先创建一个文件夹，再保存生成结果。
              </Alert>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  请选择要保存到的目标文件夹。保存成功后，图片会立即出现在图片库中。
                </Typography>
                <FormControl fullWidth>
                  <InputLabel id="save-folder-select-label">目标文件夹</InputLabel>
                  <Select
                    labelId="save-folder-select-label"
                    label="目标文件夹"
                    value={selectedFolderId}
                    onChange={(event) => setSelectedFolderId(event.target.value)}
                  >
                    {folders.map((folder) => (
                      <MenuItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(true)}>创建文件夹</Button>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="contained"
            disabled={loading || submitting || folders.length === 0 || !selectedFolderId}
            onClick={() => void handleSave()}
          >
            {submitting ? "保存中..." : "保存"}
          </Button>
        </DialogActions>
      </Dialog>

      <CreateFolderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(folder) => {
          setSelectedFolderId(folder.id);
          void refresh();
        }}
      />
    </>
  );
}
