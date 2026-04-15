import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Grid,
  Stack,
  Typography,
} from "@mui/material";

import type { FolderItem } from "../../types/api";
import { formatDateTime } from "../../utils/formatters";

interface FolderListProps {
  folders: FolderItem[];
  selectedFolderId: string | null;
  onSelect: (folder: FolderItem) => void;
}

export function FolderList({ folders, selectedFolderId, onSelect }: FolderListProps) {
  if (folders.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="body1">当前还没有文件夹。</Typography>
          <Typography variant="body2" color="text.secondary">
            先创建一个文件夹，为下一轮的图片保存功能预留目标位置。
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Grid container spacing={2}>
      {folders.map((folder) => (
        <Grid size={{ xs: 12, md: 6, xl: 4 }} key={folder.id}>
          <Card
            sx={{
              border:
                folder.id === selectedFolderId
                  ? "1px solid rgba(15, 98, 254, 0.4)"
                  : "1px solid transparent",
            }}
          >
            <CardActionArea onClick={() => onSelect(folder)}>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 52,
                      height: 52,
                      borderRadius: 2,
                      backgroundColor: "rgba(15, 98, 254, 0.1)",
                      display: "grid",
                      placeItems: "center",
                      color: "primary.main",
                    }}
                  >
                    <FolderOpenIcon />
                  </Box>
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle1">{folder.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {folder.description || "暂无描述"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      图片数量：{folder.imageCount}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      创建时间：{formatDateTime(folder.createdAt)}
                    </Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
