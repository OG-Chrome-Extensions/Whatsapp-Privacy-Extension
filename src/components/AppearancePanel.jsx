import { Box, Typography, Slider, Stack } from "@mui/material";

// Controlled sliders for blur amount and idle timeout. onChange(key, value)
// where key matches the storage shape ("blur amount" / "idle timeout").
export default function AppearancePanel({ blurValues, onChange, onCommit }) {
  const blur = Number(blurValues["blur amount"]) || 8;
  const idle = Number(blurValues["idle timeout"]) || 10;

  return (
    <Stack spacing={4} sx={{ px: 1, pt: 1 }}>
      <Box>
        <Typography gutterBottom>Blur amount — {blur}px</Typography>
        <Slider
          min={1}
          max={30}
          value={blur}
          valueLabelDisplay="auto"
          onChange={(_, v) => onChange("blur amount", v)}
          onChangeCommitted={(_, v) => onCommit("blur amount", v)}
        />
        <Typography variant="caption" color="text.secondary">
          How strongly hidden content is blurred.
        </Typography>
      </Box>

      <Box>
        <Typography gutterBottom>Idle timeout — {idle}s</Typography>
        <Slider
          min={3}
          max={120}
          value={idle}
          valueLabelDisplay="auto"
          onChange={(_, v) => onChange("idle timeout", v)}
          onChangeCommitted={(_, v) => onCommit("idle timeout", v)}
        />
        <Typography variant="caption" color="text.secondary">
          Inactivity before "Blur on idle" (and idle re-lock) kicks in.
        </Typography>
      </Box>
    </Stack>
  );
}
