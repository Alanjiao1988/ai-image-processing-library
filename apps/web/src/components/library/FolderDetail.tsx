import { Alert, Card, CardContent, Grid, Stack, Typography } from "@mui/material";

import type { FolderItem, ImageItem } from "../../types/api";
import { formatDateTime } from "../../utils/formatters";

interface FolderDetailProps {
  folder: FolderItem | null;
  images: ImageItem[];
  onSelectImage: (image: ImageItem) => void;
}

export function FolderDetail({ folder, images, onSelectImage }: FolderDetailProps) {
  if (!folder) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6">图片库</Typography>
          <Typography variant="body2" color="text.secondary">
            从左侧列表选择一个文件夹，即可查看该目录下的图片资产。
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h6">{folder.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {folder.description || "暂无描述"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            图片数量：{folder.imageCount} | 更新时间：{formatDateTime(folder.updatedAt)}
          </Typography>
        </CardContent>
      </Card>

      {images.length === 0 ? (
        <Alert severity="info">该文件夹当前还没有图片。你可以先回到 AI 图片处理页面生成并保存结果。</Alert>
      ) : (
        <Grid container spacing={2}>
          {images.map((image) => (
            <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={image.id}>
              <Card onClick={() => onSelectImage(image)} sx={{ cursor: "pointer" }}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <img
                      src={image.thumbnailUrl}
                      alt={image.fileName}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        objectFit: "cover",
                        borderRadius: 12,
                      }}
                    />
                    <Typography variant="subtitle2">{image.fileName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      来源模式：{image.sourceMode}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      生成时间：{formatDateTime(image.createdAt)}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
