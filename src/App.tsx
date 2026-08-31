// The playground, as a Milano host. It builds a real view with the
// published engine, renders it through Material renderers, and shows every
// stream the runtime produces: state, occurrences, analytics, and the
// custom actions waiting for an outcome.
import { MilanoRenderedView } from "@get-milano/react";
import type { MilanoOccurrence, MilanoUserInteraction, MilanoView } from "@get-milano/core";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CssBaseline from "@mui/material/CssBaseline";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { build, ENGINE_VERSION, type BuildInputs, type Failure, type PendingAction } from "./engine";
import { ActionSnackbar } from "./ActionSnackbar";
import { ErrorBoundary } from "./ErrorBoundary";
import { JsonEditor } from "./JsonEditor";
import { EXAMPLES } from "./samples";
import { describe } from "./engine";
import { installExpressionCompletion, setExpressionScope } from "./expressions";
import { applyEditorSchemas, loadEditorSchemas } from "./schemas";
import { decodeState, encodeState } from "./share";

type Tab = "preview" | "state" | "occurrences" | "analytics" | "tree";

interface Streamed {
  readonly occurrences: MilanoOccurrence[];
  readonly interactions: MilanoUserInteraction[];
  readonly pending: PendingAction[];
}

const EMPTY: Streamed = { occurrences: [], interactions: [], pending: [] };

export function App() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(
    () => createTheme({ palette: { mode: prefersDark ? "dark" : "light" } }),
    [prefersDark],
  );

  const first = EXAMPLES[0] as (typeof EXAMPLES)[number];
  const [inputs, setInputs] = useState<BuildInputs>({
    vocabulary: first.vocabulary,
    document: first.document,
    context: first.context,
    state: first.state,
    actions: first.actions,
    policy: "fail",
  });
  const [view, setView] = useState<MilanoView | null>(null);
  const [registry, setRegistry] = useState<Parameters<typeof MilanoRenderedView>[0]["registry"] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [streamed, setStreamed] = useState<Streamed>(EMPTY);
  const [tab, setTab] = useState<Tab>("preview");
  const [status, setStatus] = useState(`engine ${ENGINE_VERSION}`);

  const patch = useCallback(
    (part: Partial<BuildInputs>) => setInputs((current) => ({ ...current, ...part })),
    [],
  );

  // The bundled examples: picking one replaces every pane, the way a
  // shared link does. Editing afterwards keeps the selection, since the
  // panes still descend from it; a shared link is nobody's example and
  // shows as its own entry.
  const [example, setExample] = useState(first.key);
  const loadExample = useCallback((key: string) => {
    const chosen = EXAMPLES.find((entry) => entry.key === key);
    if (chosen === undefined) return;
    setExample(key);
    setInputs({
      vocabulary: chosen.vocabulary,
      document: chosen.document,
      context: chosen.context,
      state: chosen.state,
      actions: chosen.actions,
      policy: "fail",
    });
  }, []);

  // A shared link replaces every pane at once.
  useEffect(() => {
    if (location.hash.length <= 1) return;
    void decodeState(location.hash.slice(1)).then((restored) => {
      if (restored === null) return;
      setExample("");
      setInputs({ ...restored, actions: restored.actions ?? "" });
    });
  }, []);

  // Editor assistance is best-effort and never blocks: the engine decides
  // what is valid, the schemas only help while typing.
  const [schemas, setSchemas] = useState(false);
  useEffect(() => {
    void loadEditorSchemas().then(setSchemas);
    // Completion inside `$expr` strings, where the JSON schema stops. It
    // needs no schema fetch, so it is installed either way.
    installExpressionCompletion();
  }, []);
  useEffect(() => {
    setExpressionScope(inputs.vocabulary);
    if (schemas) applyEditorSchemas(inputs.vocabulary);
  }, [schemas, inputs.vocabulary]);

  // Debounced so typing does not rebuild on every keystroke, and
  // generation-guarded so a slow build cannot overwrite a newer one.
  const generation = useRef(0);
  const current = useRef<MilanoView | null>(null);
  const built = useRef<BuildInputs | null>(null);
  useEffect(() => {
    const run = ++generation.current;
    const timer = setTimeout(() => {
      // Only the document changed under a live view: replace it in place,
      // the way a host refreshes a document, so the state the author put
      // into the view survives the edit. A replacement that fails leaves
      // the view as it was and shows why; anything else changing (the
      // vocabulary, the data, the grants) is a new engine or surface, and
      // a rebuild.
      const previous = built.current;
      const live = current.current;
      if (
        previous !== null &&
        live !== null &&
        previous.document !== inputs.document &&
        previous.vocabulary === inputs.vocabulary &&
        previous.context === inputs.context &&
        previous.state === inputs.state &&
        previous.actions === inputs.actions &&
        previous.policy === inputs.policy
      ) {
        void live.replace(inputs.document).then(
          () => {
            if (run !== generation.current) return;
            built.current = inputs;
            setFailure(null);
          },
          (error: unknown) => {
            if (run !== generation.current) return;
            setFailure(describe(error));
          },
        );
        return;
      }
      const collected: Streamed = { occurrences: [], interactions: [], pending: [] };
      void build(inputs, {
        onOccurrence: (occurrence) => {
          collected.occurrences.push(occurrence);
          setStreamed((s) => ({ ...s, occurrences: [...s.occurrences, occurrence] }));
        },
        onInteraction: (interaction) => {
          collected.interactions.push(interaction);
          setStreamed((s) => ({ ...s, interactions: [...s.interactions, interaction] }));
        },
        onAction: (pending) => setStreamed((s) => ({ ...s, pending: [...s.pending, pending] })),
      }).then((outcome) => {
        if (run !== generation.current) {
          if (outcome.ok) outcome.view.teardown();
          return;
        }
        // The previous view is torn down explicitly: a playground that
        // leaked one per keystroke would be a poor advertisement for the
        // lifecycle it is demonstrating.
        current.current?.teardown();
        setStreamed({ ...collected, pending: [] });
        built.current = inputs;
        if (!outcome.ok) {
          current.current = null;
          setView(null);
          setFailure(outcome.failure);
          return;
        }
        current.current = outcome.view;
        setView(outcome.view);
        setRegistry(outcome.registry);
        setFailure(null);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [inputs]);

  useEffect(() => () => current.current?.teardown(), []);

  const share = useCallback(async () => {
    const fragment = await encodeState(inputs);
    history.replaceState(null, "", `#${fragment}`);
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${fragment}`);
    setStatus("link copied");
    setTimeout(() => setStatus(`engine ${ENGINE_VERSION}`), 2000);
  }, [inputs]);

  const settle = useCallback((pending: PendingAction, outcome: "success" | "failure", value: string) => {
    pending.settle(outcome, value);
    setStreamed((s) => ({ ...s, pending: s.pending.filter((p) => p.id !== pending.id) }));
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider", alignItems: "center" }}
        >
          <Typography variant="h6">Milano Playground</Typography>
          <Chip size="small" variant="outlined" label={status} />
          <TextField
            select
            size="small"
            label="Example"
            value={example}
            onChange={(event) => loadExample(event.target.value)}
            slotProps={{ select: { native: true } }}
            sx={{ minWidth: 240 }}
          >
            {example === "" ? <option value="">Shared link</option> : null}
            {EXAMPLES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.title}
              </option>
            ))}
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" onClick={() => void share()}>
            Share
          </Button>
          <Button size="small" href="https://get-milano.dev/specs/" target="_blank">
            Specs
          </Button>
          <Button size="small" href="https://get-milano.dev/sdk/" target="_blank">
            SDK
          </Button>
        </Stack>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", flexGrow: 1, minHeight: 0 }}>
          <JsonEditor
            title="Vocabulary"
            path="vocabulary.json"
            value={inputs.vocabulary}
            onChange={(vocabulary) => patch({ vocabulary })}
            dark={prefersDark}
          />
          <JsonEditor
            title="Document"
            path="document.json"
            value={inputs.document}
            onChange={(document) => patch({ document })}
            dark={prefersDark}
          />

          <Stack sx={{ borderLeft: 1, borderColor: "divider", minHeight: 0 }}>
            <Stack spacing={1} sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Context values"
                  multiline
                  minRows={2}
                  fullWidth
                  value={inputs.context}
                  onChange={(event) => patch({ context: event.target.value })}
                  slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 12 } } }}
                />
                <TextField
                  size="small"
                  label="State values"
                  multiline
                  minRows={2}
                  fullWidth
                  value={inputs.state}
                  onChange={(event) => patch({ state: event.target.value })}
                  slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 12 } } }}
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Builder action grants"
                  multiline
                  minRows={2}
                  fullWidth
                  value={inputs.actions}
                  onChange={(event) => patch({ actions: event.target.value })}
                  slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 12 } } }}
                />
                <TextField
                  select
                  size="small"
                  label="Unknown types"
                  value={inputs.policy}
                  onChange={(event) => patch({ policy: event.target.value })}
                  slotProps={{ select: { native: true } }}
                  sx={{ minWidth: 140 }}
                >
                  <option value="fail">fail</option>
                  <option value="skip">skip</option>
                  <option value="placeholder">placeholder</option>
                </TextField>
              </Stack>
            </Stack>

            <Box sx={{ px: 1.5 }}>
              {failure === null ? (
                <Alert severity="success" variant="outlined">
                  <AlertTitle sx={{ mb: 0 }}>Build succeeds</AlertTitle>
                  <Typography variant="caption">
                    {streamed.occurrences.length === 0
                      ? "no occurrences"
                      : `${streamed.occurrences.length} occurrence(s)`}
                  </Typography>
                </Alert>
              ) : (
                <Alert severity="error" variant="outlined">
                  <AlertTitle sx={{ mb: 0 }}>{failure.headline}</AlertTitle>
                  <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                    {failure.detail}
                  </Typography>
                </Alert>
              )}
            </Box>

            <Tabs
              value={tab}
              onChange={(_, next: Tab) => setTab(next)}
              variant="scrollable"
              sx={{ borderBottom: 1, borderColor: "divider", minHeight: 36, mt: 1 }}
            >
              <Tab value="preview" label="Preview" sx={{ minHeight: 36 }} />
              <Tab value="state" label="State" sx={{ minHeight: 36 }} />
              <Tab
                value="occurrences"
                label={`Occurrences (${streamed.occurrences.length})`}
                sx={{ minHeight: 36 }}
              />
              <Tab
                value="analytics"
                label={`Analytics (${streamed.interactions.length})`}
                sx={{ minHeight: 36 }}
              />
              <Tab value="tree" label="Tree" sx={{ minHeight: 36 }} />
            </Tabs>

            <Box sx={{ flexGrow: 1, overflow: "auto", p: 1.5 }}>
              {view === null ? null : (
                <ErrorBoundary resetKey={view}>
                  <Panels tab={tab} view={view} registry={registry} streamed={streamed} />
                </ErrorBoundary>
              )}
            </Box>
          </Stack>
        </Box>

        <ErrorBoundary resetKey={streamed.pending[0]?.id ?? null}>
          <ActionSnackbar queue={streamed.pending} settle={settle} />
        </ErrorBoundary>
      </Box>
    </ThemeProvider>
  );
}

interface PanelsProps {
  readonly tab: Tab;
  readonly view: MilanoView;
  readonly registry: Parameters<typeof MilanoRenderedView>[0]["registry"] | null;
  readonly streamed: Streamed;
}

function Panels({ tab, view, registry, streamed }: PanelsProps) {
  if (tab === "preview") {
    return registry === null ? null : <MilanoRenderedView view={view} registry={registry} />;
  }
  if (tab === "state") return <StatePanel view={view} />;
  if (tab === "occurrences") return <Log rows={streamed.occurrences.map(describeOccurrence)} empty="No occurrences: nothing degraded." />;
  if (tab === "analytics") return <Log rows={streamed.interactions.map(describeInteraction)} empty="No interactions yet." />;
  return (
    <Box component="pre" sx={{ m: 0, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
      {JSON.stringify(view.resolvedRoot, replacer, 2)}
    </Box>
  );
}

/** MilanoValue and bigint are not JSON; show them the way the engine does. */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value !== null && typeof value === "object" && "kind" in value && "isNull" in value) {
    return String(value);
  }
  return value;
}

function StatePanel({ view }: { readonly view: MilanoView }) {
  // Re-read on every re-resolution: this is what a host's inspector does.
  const [, force] = useState(0);
  useEffect(() => view.subscribe(() => force((n) => n + 1)), [view]);
  const rows = (label: string, values: Readonly<Record<string, unknown>>) => (
    <Box key={label}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Box component="pre" sx={{ m: 0, fontSize: 12, fontFamily: "monospace" }}>
        {JSON.stringify(values, replacer, 2)}
      </Box>
    </Box>
  );
  return (
    <Stack spacing={2}>
      {rows("state", view.state)}
      {rows("context", view.context)}
      {view.metadata === null ? null : rows("metadata", { metadata: view.metadata })}
    </Stack>
  );
}

function Log({ rows, empty }: { readonly rows: string[]; readonly empty: string }) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {empty}
      </Typography>
    );
  }
  return (
    <Stack spacing={0.5}>
      {rows.map((row, index) => (
        <Typography key={index} variant="caption" sx={{ fontFamily: "monospace" }}>
          {row}
        </Typography>
      ))}
    </Stack>
  );
}

/**
 * The kind, then the detail an occurrence carries since SDK 1.3.0: the
 * node, what it is about (an event, action, property, type, or key), and
 * the gate's expected/found terms when a rejection has them.
 */
function describeOccurrence(occurrence: MilanoOccurrence): string {
  const parts: string[] = [occurrence.kind];
  if (occurrence.node !== null) parts.push(occurrence.node);
  if (occurrence.name) parts.push(occurrence.name);
  if (occurrence.expected || occurrence.found) {
    parts.push(`expected ${occurrence.expected ?? "-"}, found ${occurrence.found ?? "-"}`);
  }
  return parts.join(" · ");
}

function describeInteraction(interaction: MilanoUserInteraction): string {
  const parts: string[] = [interaction.kind];
  if (interaction.node !== null) parts.push(interaction.node);
  if (interaction.name !== null) parts.push(interaction.name);
  if (interaction.value !== null) parts.push(String(interaction.value));
  return parts.join(" · ");
}
