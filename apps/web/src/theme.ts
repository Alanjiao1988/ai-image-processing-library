import { createTheme } from "@mui/material";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0f62fe",
    },
    secondary: {
      main: "#0f3d91",
    },
    background: {
      default: "#eef3f8",
      paper: "#ffffff",
    },
    success: {
      main: "#1f9d55",
    },
    warning: {
      main: "#d97706",
    },
    error: {
      main: "#d14343",
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: "\"IBM Plex Sans\", \"Segoe UI\", sans-serif",
    h4: {
      fontWeight: 700,
    },
    h5: {
      fontWeight: 700,
    },
    h6: {
      fontWeight: 700,
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 20px 60px rgba(10, 37, 64, 0.08)",
          border: "1px solid rgba(15, 98, 254, 0.08)",
        },
      },
    },
  },
});
