import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Stack,
  Link,
  Alert,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import Keypad from "./Keypad";
import * as lock from "../lib/lock";

// Shown when the extension is locked. PIN entry with brute-force cooldown and
// a recovery-code escape hatch. onUnlocked(pinWasReset) is called on success.
export default function LockScreen({ onUnlocked }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [cooldownMs, setCooldownMs] = useState(0);
  const [mode, setMode] = useState("pin"); // 'pin' | 'recovery'
  const [recovery, setRecovery] = useState("");

  useEffect(() => {
    (async () => {
      setCooldownMs(await lock.getCooldownRemaining());
      setReady(true);
    })();
  }, []);

  const locked = cooldownMs > 0;

  // Count the cooldown down so the keypad re-enables on its own.
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(
      () => setCooldownMs((ms) => Math.max(0, ms - 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [locked]);

  const handlePin = async (pin, reset) => {
    setError("");
    if ((await lock.getCooldownRemaining()) > 0) {
      setCooldownMs(await lock.getCooldownRemaining());
      reset();
      return;
    }
    if (await lock.verifyPin(pin)) {
      await lock.applyUnlock();
      onUnlocked(false);
      return;
    }
    const { count, lockedUntil } = await lock.registerFailure();
    setError(`Wrong PIN${count >= 4 ? ` (${count} tries)` : ""}`);
    if (lockedUntil) setCooldownMs(lockedUntil - Date.now());
    reset();
  };

  const handleRecovery = async () => {
    setError("");
    if (await lock.verifyRecovery(recovery)) {
      await lock.disablePin();
      onUnlocked(true);
    } else {
      setError("Invalid recovery code");
    }
  };

  if (!ready) return <Box sx={{ height: 160 }} />;

  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={1.5} py={2}>
      <LockIcon color="primary" sx={{ fontSize: 36 }} />
      <Typography fontWeight="bold">
        {mode === "pin" ? "Enter PIN" : "Recovery code"}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ py: 0, width: "100%" }}>
          {error}
        </Alert>
      )}

      {locked && (
        <Typography variant="body2" color="error">
          Too many attempts — wait {Math.ceil(cooldownMs / 1000)}s
        </Typography>
      )}

      {mode === "pin" ? (
        <>
          <Keypad onComplete={handlePin} disabled={locked} />
          <Link
            component="button"
            variant="caption"
            onClick={() => {
              setError("");
              setMode("recovery");
            }}
          >
            Forgot PIN?
          </Link>
        </>
      ) : (
        <Stack spacing={1.5} width="100%" px={1}>
          <TextField
            label="Recovery code"
            placeholder="XXXX-XXXX-XXXX"
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />
          <Button variant="contained" onClick={handleRecovery}>
            Reset PIN
          </Button>
          <Link
            component="button"
            variant="caption"
            onClick={() => {
              setError("");
              setMode("pin");
            }}
          >
            Back to PIN
          </Link>
        </Stack>
      )}
    </Box>
  );
}
