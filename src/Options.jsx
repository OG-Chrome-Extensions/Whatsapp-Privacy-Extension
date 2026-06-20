import { useEffect, useState } from "react";
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Paper,
  Link,
  Stack,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { theme } from "./lib/theme";
import { loadState, updateSettings, updateBlurValues } from "./lib/settings";
import * as lock from "./lib/lock";
import PrivacyToggles from "./components/PrivacyToggles";
import AppearancePanel from "./components/AppearancePanel";
import SecurityPanel from "./components/SecurityPanel";
import LockScreen from "./components/LockScreen";

export default function Options() {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState(null);
  const [blurValues, setBlurValues] = useState(null);

  const init = async () => {
    const st = await loadState();
    setSettings(st.settings);
    setBlurValues(st.blurValues);
    const sec = await lock.getSecurity();
    const lk = await lock.getLock();
    setLocked(sec.pinEnabled && lk.locked);
    setReady(true);
  };

  useEffect(() => {
    init();
    // React live to lock/security changes (e.g. "Lock now", re-lock timers,
    // changes made from the popup) so the page re-gates immediately.
    const handler = async (changes, area) => {
      if (area !== "local") return;
      if (!changes.wpeLock && !changes.wpeSecurity) return;
      const sec = await lock.getSecurity();
      const lk = await lock.getLock();
      setLocked(sec.pinEnabled && lk.locked);
    };
    chrome.storage.onChanged.addListener(handler);

    // Heartbeat so the WhatsApp tab doesn't idle-relock while settings are open.
    const ping = () => {
      if (document.visibilityState === "visible") {
        chrome.storage.local.set({ wpeKeepAlive: Date.now() });
      }
    };
    ping();
    const interval = setInterval(ping, 4000);
    window.addEventListener("pointerdown", ping);
    window.addEventListener("keydown", ping);
    document.addEventListener("visibilitychange", ping);

    return () => {
      chrome.storage.onChanged.removeListener(handler);
      clearInterval(interval);
      window.removeEventListener("pointerdown", ping);
      window.removeEventListener("keydown", ping);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  const onToggle = async (key, val) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    await updateSettings(next);
  };

  const onBlurLive = (key, val) =>
    setBlurValues((b) => ({ ...b, [key]: val }));

  const onBlurCommit = async (key, val) => {
    const next = { ...blurValues, [key]: val };
    setBlurValues(next);
    await updateBlurValues(next);
  };

  const shell = (children) => (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ maxWidth: 640, mx: "auto", p: { xs: 2, sm: 4 } }}>
        <Stack direction="row" spacing={1} alignItems="center" mb={2}>
          <VisibilityOffIcon color="primary" />
          <Typography variant="h5" fontWeight="bold">
            WhatsApp Privacy — Settings
          </Typography>
        </Stack>
        {children}
      </Box>
    </ThemeProvider>
  );

  if (!ready || !settings) return shell(null);

  if (locked) {
    return shell(
      <Paper variant="outlined" sx={{ p: 2, maxWidth: 360, mx: "auto" }}>
        <LockScreen onUnlocked={() => init()} />
      </Paper>
    );
  }

  return shell(
    <Paper variant="outlined">
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Privacy" />
        <Tab label="Appearance" />
        <Tab label="Security" />
        <Tab label="About" />
      </Tabs>
      <Box sx={{ p: 3 }}>
        {tab === 0 && <PrivacyToggles settings={settings} onChange={onToggle} />}
        {tab === 1 && (
          <AppearancePanel
            blurValues={blurValues}
            onChange={onBlurLive}
            onCommit={onBlurCommit}
          />
        )}
        {tab === 2 && <SecurityPanel onChanged={init} />}
        {tab === 3 && <About />}
      </Box>
    </Paper>
  );
}

function About() {
  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        WhatsApp Privacy Extension blurs sensitive content on WhatsApp Web and
        can lock reveal/settings behind a PIN.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        No tracking, no cloud sync, no logins. Your PIN is hashed and stored
        only on this device.
      </Typography>
      <Link href="https://www.optimageeks.com" target="_blank" rel="noreferrer">
        www.optimageeks.com
      </Link>
      <Typography variant="caption" color="text.secondary">
        Developed by OptimaGeeks · Powered by OptimaGeeks
      </Typography>
    </Stack>
  );
}
