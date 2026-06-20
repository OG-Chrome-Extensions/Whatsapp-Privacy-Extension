import { Grid, Typography, Switch, Divider, Box } from "@mui/material";

const BLUR_ROWS = [
  ["All messages in chat", "allMessages"],
  ["Last messages preview", "lastPreview"],
  ["Media preview", "mediaPreview"],
  ["Media gallery", "mediaGallery"],
  ["Text input", "textInput"],
  ["Profile pictures", "profilePictures"],
  ["Group / user names", "groupNames"],
];

const BEHAVIOR_ROWS = [
  ["No transition delay", "noTransition"],
  ["Unblur all on app hover", "unblurOnHover"],
  ["Blur WhatsApp on idle", "blurOnIdle"],
];

function Row({ label, value, onChange }) {
  return (
    <Grid
      container
      alignItems="center"
      justifyContent="space-between"
      sx={{ py: 0.5 }}
    >
      <Typography>{label}</Typography>
      <Switch checked={!!value} onChange={(e) => onChange(e.target.checked)} />
    </Grid>
  );
}

export default function PrivacyToggles({ settings, onChange }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        What to blur
      </Typography>
      {BLUR_ROWS.map(([label, key]) => (
        <Row
          key={key}
          label={label}
          value={settings[key]}
          onChange={(v) => onChange(key, v)}
        />
      ))}

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="overline" color="text.secondary">
        Behavior
      </Typography>
      {BEHAVIOR_ROWS.map(([label, key]) => (
        <Row
          key={key}
          label={label}
          value={settings[key]}
          onChange={(v) => onChange(key, v)}
        />
      ))}
    </Box>
  );
}
