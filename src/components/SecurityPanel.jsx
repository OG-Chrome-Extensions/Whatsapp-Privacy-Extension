import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Switch,
  Stack,
  Select,
  MenuItem,
  TextField,
  Divider,
  Alert,
  FormControlLabel,
} from "@mui/material";
import Keypad from "./Keypad";
import * as lock from "../lib/lock";

const RELOCK_LABELS = {
  idle: "After inactivity (idle timeout)",
  session: "When the tab / browser closes",
  timer: "After a set time",
  immediate: "Shortly after each reveal",
};

export default function SecurityPanel({ onChanged }) {
  const [security, setSecurity] = useState(null);
  const [step, setStep] = useState("overview"); // overview | enter | confirm | recovery
  const [purpose, setPurpose] = useState("enable"); // enable | change
  const [firstPin, setFirstPin] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const refresh = async () => {
    setSecurity(await lock.getSecurity());
    onChanged?.();
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!security) return null;

  // --- set / confirm PIN flow ---
  const startSet = (p) => {
    setPurpose(p);
    setFirstPin("");
    setError("");
    setInfo("");
    setStep("enter");
  };

  const onEnter = (pin, reset) => {
    setFirstPin(pin);
    reset();
    setError("");
    setStep("confirm");
  };

  const onConfirm = async (pin, reset) => {
    if (pin !== firstPin) {
      setError("PINs did not match — try again");
      reset();
      setStep("enter");
      return;
    }
    if (purpose === "enable") {
      const code = await lock.enablePin(pin);
      setRecoveryCode(code);
      setStep("recovery");
    } else {
      await lock.changePin(pin);
      setInfo("PIN changed");
      setStep("overview");
    }
    await refresh();
  };

  if (step === "enter" || step === "confirm") {
    return (
      <Box textAlign="center" py={2}>
        <Typography fontWeight="bold" mb={1}>
          {step === "enter" ? "Enter a new 4-digit PIN" : "Confirm your PIN"}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Keypad onComplete={step === "enter" ? onEnter : onConfirm} />
        <Button sx={{ mt: 1 }} onClick={() => { setStep("overview"); setError(""); }}>
          Cancel
        </Button>
      </Box>
    );
  }

  if (step === "recovery") {
    return (
      <Box textAlign="center" py={2}>
        <Typography fontWeight="bold" mb={1}>
          Save your recovery code
        </Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Shown only once. If you forget your PIN, this code resets it.
        </Alert>
        <Typography
          sx={{ my: 2, fontFamily: "monospace", fontSize: 22, letterSpacing: 2 }}
        >
          {recoveryCode}
        </Typography>
        <Button variant="contained" onClick={() => { setRecoveryCode(""); setStep("overview"); }}>
          I've saved it
        </Button>
      </Box>
    );
  }

  // --- overview ---
  const removePin = async () => {
    if (!confirm("Remove the PIN lock? Content will no longer require a PIN.")) return;
    await lock.disablePin();
    setInfo("PIN removed");
    await refresh();
  };

  const regenRecovery = async () => {
    const code = await lock.regenerateRecoveryCode();
    setRecoveryCode(code);
    setStep("recovery");
    await refresh();
  };

  const hardReset = async () => {
    if (!confirm("Reset all security settings (PIN and recovery code)? This cannot be undone.")) return;
    await lock.resetSecurity();
    setInfo("Security settings reset");
    await refresh();
  };

  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {info && <Alert severity="success" onClose={() => setInfo("")}>{info}</Alert>}

      {!security.pinEnabled ? (
        <>
          <Alert severity="info">
            A 4-digit PIN protects revealing content, changing settings, and
            disabling the extension. Stored hashed on this device only.
          </Alert>
          <Button variant="contained" onClick={() => startSet("enable")}>
            Enable PIN lock
          </Button>
        </>
      ) : (
        <>
          <Alert severity="success">PIN lock is ON.</Alert>

          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => startSet("change")}>
              Change PIN
            </Button>
            <Button variant="outlined" color="error" onClick={removePin}>
              Remove PIN
            </Button>
            <Button variant="outlined" onClick={() => lock.lockNow()}>
              Lock now
            </Button>
          </Stack>

          <Divider />

          <Box>
            <Typography variant="overline" color="text.secondary">
              Re-lock
            </Typography>
            <Select
              fullWidth
              size="small"
              value={security.relockMode}
              onChange={async (e) => {
                await lock.setRelockMode(e.target.value);
                await refresh();
              }}
            >
              {Object.entries(RELOCK_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
            {security.relockMode === "timer" && (
              <TextField
                sx={{ mt: 1 }}
                size="small"
                type="number"
                label="Minutes until re-lock"
                value={security.relockTimerMinutes}
                onChange={async (e) => {
                  await lock.setRelockTimerMinutes(e.target.value);
                  await refresh();
                }}
                inputProps={{ min: 1 }}
              />
            )}
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={security.blurAllWhenLocked}
                onChange={async (e) => {
                  await lock.setBlurAllWhenLocked(e.target.checked);
                  await refresh();
                }}
              />
            }
            label="Blur everything while locked (full curtain)"
          />

          <Divider />

          <Button variant="text" onClick={regenRecovery}>
            Regenerate recovery code
          </Button>
        </>
      )}

      <Divider />
      <Button variant="text" color="error" onClick={hardReset}>
        Reset all security settings
      </Button>
    </Stack>
  );
}
