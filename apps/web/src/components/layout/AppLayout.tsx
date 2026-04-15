import CollectionsIcon from "@mui/icons-material/Collections";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from "@mui/material";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { HealthStatusCard } from "../health/HealthStatusCard";

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isLibraryPage = location.pathname.startsWith("/library");

  return (
    <Box sx={{ minHeight: "100vh", pb: 6 }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          background: "rgba(238, 243, 248, 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(15, 98, 254, 0.08)",
        }}
      >
        <Toolbar sx={{ py: 1.5 }}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", lg: "center" }}
            justifyContent="space-between"
            sx={{ width: "100%" }}
          >
            <HealthStatusCard />
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
              <Typography variant="h6" color="text.primary" sx={{ display: { xs: "none", md: "block" } }}>
                AI 图片处理与图片库
              </Typography>
              <Button
                variant={isLibraryPage ? "outlined" : "contained"}
                startIcon={<ImageSearchIcon />}
                onClick={() => navigate("/")}
              >
                AI 图片处理
              </Button>
              <Button
                variant={isLibraryPage ? "contained" : "outlined"}
                startIcon={<CollectionsIcon />}
                onClick={() => navigate("/library")}
              >
                图片库
              </Button>
            </Stack>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ pt: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
