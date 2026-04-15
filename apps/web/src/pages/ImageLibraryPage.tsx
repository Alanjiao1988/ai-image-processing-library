import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { FolderDetail } from "../components/library/FolderDetail";
import { FolderList } from "../components/library/FolderList";
import { CreateFolderDialog } from "../components/library/CreateFolderDialog";
import { ImagePreviewModal } from "../components/library/ImagePreviewModal";
import { useFolders } from "../hooks/useFolders";
import type { FolderItem, ImageItem } from "../types/api";

export function ImageLibraryPage() {
  const { folders, loading, error, refresh } = useFolders();
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);

  useEffect(() => {
    if (!selectedFolder && folders.length > 0) {
      setSelectedFolder(folders[0]);
    }
  }, [folders, selectedFolder]);

  useEffect(() => {
    const loadImages = async () => {
      if (!selectedFolder) {
        setImages([]);
        return;
      }

      try {
        setImagesError(null);
        const response = await apiClient.getFolderImages(selectedFolder.id);
        setImages(response.items);
      } catch (loadError) {
        setImagesError(loadError instanceof Error ? loadError.message : "读取图片列表失败。");
      }
    };

    void loadImages();
  }, [selectedFolder]);

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Stack spacing={1}>
              <Typography variant="h4">图片库</Typography>
              <Typography variant="body1" color="text.secondary">
                查看文件夹、预览图片，并验证生成结果是否已按预期进入正式图片库。
              </Typography>
            </Stack>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              创建文件夹
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}
      {imagesError && <Alert severity="error">{imagesError}</Alert>}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 4 }}>
          {loading ? (
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  文件夹加载中...
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <FolderList
              folders={folders}
              selectedFolderId={selectedFolder?.id ?? null}
              onSelect={setSelectedFolder}
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <FolderDetail folder={selectedFolder} images={images} onSelectImage={setPreviewImage} />
        </Grid>
      </Grid>

      <CreateFolderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(folder) => {
          setSelectedFolder(folder);
          void refresh();
        }}
      />
      <ImagePreviewModal
        open={Boolean(previewImage)}
        image={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </Stack>
  );
}
