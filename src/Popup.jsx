import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Switch,
  Divider,
  Button,
  Stack,
  Chip,
  Alert,
  Grid,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import SettingsIcon from "@mui/icons-material/Settings";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { theme } from "./lib/theme";
import { loadState, toggleGlobal } from "./lib/settings";
import * as lock from "./lib/lock";
import LockScreen from "./components/LockScreen";

export default function Popup() {
  const [ready, setReady] = useState(false);
  const [globalToggle, setGlobalToggle] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const init = async () => {
    const st = await loadState();
    setGlobalToggle(st.globalToggle);
    const sec = await lock.getSecurity();
    const lk = await lock.getLock();
    setPinEnabled(sec.pinEnabled);
    setLocked(sec.pinEnabled && lk.locked);
    const { wpeHintDismissed } = await chrome.storage.local.get("wpeHintDismissed");
    setShowHint(!sec.pinEnabled && !wpeHintDismissed);
    setReady(true);
  };

  useEffect(() => {
    init();
    const handler = (changes, area) => {
      if (area === "local" && (changes.wpeLock || changes.wpeSecurity)) init();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const openOptions = () => chrome.runtime.openOptionsPage();

  const dismissHint = async () => {
    await chrome.storage.local.set({ wpeHintDismissed: true });
    setShowHint(false);
  };

  const handleGlobal = async (e) => {
    const value = e.target.checked;
    setGlobalToggle(value);
    try {
      await toggleGlobal(value);
    } catch {
      setGlobalToggle(!value);
    }
  };

  const handleLockNow = async () => {
    await lock.lockNow();
    setLocked(true);
  };

  let body = null;
  if (!ready) {
    body = <Box sx={{ height: 160 }} />;
  } else if (locked) {
    body = <LockScreen onUnlocked={() => init()} />;
  } else {
    body = (
      <>
        <Grid container alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
          <Typography fontWeight="bold">Protection</Typography>
          <Switch checked={globalToggle} onChange={handleGlobal} />
        </Grid>

        {pinEnabled && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Chip
              size="small"
              color="success"
              icon={<LockOpenIcon />}
              label="Unlocked"
            />
            <Button size="small" startIcon={<LockIcon />} onClick={handleLockNow}>
              Lock now
            </Button>
          </Stack>
        )}

        {showHint && (
          <Alert
            severity="info"
            icon={<LockIcon fontSize="inherit" />}
            onClose={dismissHint}
            sx={{ mt: 2 }}
            action={
              <Button color="inherit" size="small" onClick={openOptions}>
                Add
              </Button>
            }
          >
            Add a PIN lock for extra privacy.
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        <Button
          fullWidth
          variant="contained"
          startIcon={<SettingsIcon />}
          onClick={openOptions}
        >
          Open settings
        </Button>
      </>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ width: 300, p: 2 }}>
        <Box display="flex" alignItems="center" gap={1}>
          <VisibilityOffIcon color="primary" />
          <Box>
            <Typography fontWeight="bold">Privacy Extension</Typography>
            <Typography variant="body2" color="text.secondary">
              For WhatsApp Web
            </Typography>
          </Box>
        </Box>
        <Divider sx={{ my: 1 }} />
        {body}
      </Box>
    </ThemeProvider>
  );
}
