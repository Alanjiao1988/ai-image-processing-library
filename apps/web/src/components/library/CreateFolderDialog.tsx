import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useState } from "react";

import { apiClient } from "../../api/client";
import type { FolderItem } from "../../types/api";

interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (folder: FolderItem) => void;
}

export function CreateFolderDialog({ open, onClose, onCreated }: CreateFolderDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const folder = await apiClient.createFolder({ name, description });
      onCreated(folder);
      setName("");
      setDescription("");
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建文件夹失败。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>创建文件夹</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="文件夹名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <TextField
            label="文件夹描述"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={3}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={submitting || !name.trim()} onClick={() => void handleCreate()}>
          {submitting ? "创建中..." : "创建"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
