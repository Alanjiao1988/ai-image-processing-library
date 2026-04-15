import { Box, Card, CardContent, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";

import { ImageEditTab } from "../components/image-processing/ImageEditTab";
import { ImageVariationTab } from "../components/image-processing/ImageVariationTab";
import { TextToImageTab } from "../components/image-processing/TextToImageTab";

export function AiImageProcessingPage() {
  const [tab, setTab] = useState(0);

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h4">AI 图片处理</Typography>
            <Typography variant="body1" color="text.secondary">
              文生图、图片编辑、以图生图都已接入统一任务轮询链路，并支持把结果保存到图片库指定文件夹。
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ px: 2, pt: 1 }}>
          <Tab label="文生图" />
          <Tab label="图片编辑" />
          <Tab label="以图生图" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {tab === 0 && <TextToImageTab />}
          {tab === 1 && <ImageEditTab />}
          {tab === 2 && <ImageVariationTab />}
        </Box>
      </Card>
    </Stack>
  );
}
