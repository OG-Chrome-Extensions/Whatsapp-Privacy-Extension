import { ThemeProvider } from "@mui/material/styles";
import { Box, Paper, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { theme } from "./lib/theme";
import LockScreen from "./components/LockScreen";

// Rendered inside an extension iframe injected over WhatsApp Web. Hosts the
// PIN keypad so the user can unlock without opening the popup.
export default function UnlockOverlay() {
  const cancel = () => window.parent.postMessage({ type: "wpe-cancel" }, "*");
  const done = () => window.parent.postMessage({ type: "wpe-unlocked" }, "*");

  return (
    <ThemeProvider theme={theme}>
      <Box
        onClick={cancel}
        sx={{
          position: "fixed",
          inset: 0,
          bgcolor: "rgba(0,0,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Paper
          onClick={(e) => e.stopPropagation()}
          sx={{ width: 300, p: 2, position: "relative" }}
        >
          <IconButton
            size="small"
            onClick={cancel}
            sx={{ position: "absolute", right: 4, top: 4 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
          <LockScreen onUnlocked={done} />
        </Paper>
      </Box>
    </ThemeProvider>
  );
}
