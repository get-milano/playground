// Dispatched custom actions, surfaced the way a host app surfaces work it
// has been asked to do. Its own module so it can be mounted in a test
// without dragging the editors (and Monaco) along.
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import type { PendingAction } from "./engine";

export type Settle = (
  pending: PendingAction,
  outcome: "success" | "failure",
  value: string,
) => void;

/**
 * Dispatched actions arrive as snackbars, one at a time, the way a host
 * app surfaces work it has been asked to do. They do not auto-hide: the
 * document is waiting on an outcome, and dismissing it on a timer would
 * leave the completion pending forever.
 */
export function ActionSnackbar({
  queue,
  settle,
}: {
  readonly queue: readonly PendingAction[];
  readonly settle: Settle;
}) {
  const pending = queue[0];
  if (pending === undefined) return null;
  return (
    <Snackbar key={pending.id} open anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      {/*
        The Box is load-bearing: Snackbar hands its child a ref for the
        transition, and a plain function component would drop it, leaving
        the transition to dereference null.
      */}
      <Box>
        <PendingActionCard pending={pending} settle={settle} waiting={queue.length - 1} />
      </Box>
    </Snackbar>
  );
}

function PendingActionCard({
  pending,
  settle,
  waiting,
}: {
  readonly pending: PendingAction;
  readonly settle: Settle;
  readonly waiting: number;
}) {
  const [value, setValue] = useState("");
  const parameters = Object.entries(pending.action.parameters)
    .map(([name, parameter]) => `${name}: ${String(parameter)}`)
    .join(", ");
  // One field serves both outcomes: what it holds becomes the result on
  // Succeed and the failure payload on Fail, each against its own type.
  const expected = [
    pending.resultType === null ? null : `result: ${pending.resultType}`,
    pending.failureType === null ? null : `failure: ${pending.failureType}`,
  ].filter((part) => part !== null);
  return (
    // A Paper, not a filled Alert: this thing holds a text field and two
    // buttons, and they need ordinary surface contrast to stay legible.
    <Paper elevation={8} sx={{ p: 2, minWidth: 380, maxWidth: 560 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <Typography variant="subtitle2">
          dispatched <code>{pending.action.name}</code>
        </Typography>
        {waiting > 0 ? <Chip size="small" label={`+${waiting} waiting`} /> : null}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
        {parameters.length === 0 ? "no parameters" : parameters}
        {` · dispatch ${pending.action.dispatch} (${pending.action.dispatchId})`}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center" }}>
        {expected.length === 0 ? null : (
          <TextField
            size="small"
            fullWidth
            label={expected.join(" · ")}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <Button size="small" variant="contained" onClick={() => settle(pending, "success", value)}>
          Succeed
        </Button>
        <Button size="small" color="error" onClick={() => settle(pending, "failure", value)}>
          Fail
        </Button>
      </Stack>
    </Paper>
  );
}
