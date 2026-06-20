import { useState } from "react";
import { Box, IconButton } from "@mui/material";
import BackspaceIcon from "@mui/icons-material/Backspace";

// A simple numeric PIN pad. Calls onComplete(pin, reset) once `length` digits
// are entered; the parent calls reset() to clear the pad (e.g. on a wrong PIN).
export default function Keypad({ length = 4, onComplete, disabled = false }) {
  const [entry, setEntry] = useState("");

  const reset = () => setEntry("");

  const press = (digit) => {
    if (disabled) return;
    const next = (entry + digit).slice(0, length);
    setEntry(next);
    if (next.length === length) onComplete(next, reset);
  };

  const backspace = () => setEntry((e) => e.slice(0, -1));

  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
      <Box display="flex" gap={1.5} my={1}>
        {Array.from({ length }).map((_, i) => (
          <Box
            key={i}
            sx={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "2px solid",
              borderColor: "primary.main",
              backgroundColor: i < entry.length ? "primary.main" : "transparent",
              transition: "background-color 0.1s",
            }}
          />
        ))}
      </Box>

      <Box
        display="grid"
        gridTemplateColumns="repeat(3, 56px)"
        gap={1}
        justifyContent="center"
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <KeyButton key={n} onClick={() => press(String(n))} disabled={disabled}>
            {n}
          </KeyButton>
        ))}
        <Box />
        <KeyButton onClick={() => press("0")} disabled={disabled}>
          0
        </KeyButton>
        <IconButton
          onClick={backspace}
          disabled={disabled || entry.length === 0}
          sx={{ width: 56, height: 56 }}
        >
          <BackspaceIcon />
        </IconButton>
      </Box>
    </Box>
  );
}

function KeyButton({ children, onClick, disabled }) {
  return (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: 56,
        height: 56,
        fontSize: 22,
        fontWeight: 500,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "50%",
      }}
    >
      {children}
    </IconButton>
  );
}
