import { createTheme } from "@mui/material/styles";

// Shared WhatsApp-green theme for the popup and options page.
export const theme = createTheme({
  palette: {
    primary: { main: "#25D366" },
    secondary: { main: "#128C7E" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
});
