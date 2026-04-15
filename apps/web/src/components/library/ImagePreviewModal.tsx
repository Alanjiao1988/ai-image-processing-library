import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

import type { ImageItem } from "../../types/api";
import { formatDateTime, formatFileSize } from "../../utils/formatters";

interface ImagePreviewModalProps {
  open: boolean;
  image: ImageItem | null;
  onClose: () => void;
}

export function ImagePreviewModal({ open, image, onClose }: ImagePreviewModalProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{image?.fileName || "图片预览"}</DialogTitle>
      <DialogContent>
        {image && (
          <Stack spacing={2}>
            <img
              src={image.originalUrl}
              alt={image.fileName}
              style={{
                width: "100%",
                maxHeight: 520,
                objectFit: "contain",
                borderRadius: 16,
                background: "#f5f8fb",
              }}
            />
            <Typography variant="body2" color="text.secondary">
              来源模式：{image.sourceMode}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              生成时间：{formatDateTime(image.createdAt)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              尺寸：{image.width || "--"} × {image.height || "--"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              文件大小：{formatFileSize(image.fileSizeBytes)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              提示词：{image.promptText || "--"}
            </Typography>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
