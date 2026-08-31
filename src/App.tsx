// The playground, as a Milano host. It builds a real view with the
// published engine, renders it through Material renderers, and shows every
// stream the runtime produces: state, occurrences, analytics, and the
// custom actions waiting for an outcome.
//
// The layout follows an editor the author already knows: a tabbed editor
// group (vocabulary.json, document.json) on one side, the rendered view on
// the other, and a bottom panel, like a terminal, with one section per
// input or stream. The session survives a refresh (localStorage), examples
// are addressable (#e=<key>), and the editors load lazily so the first
// paint is the app, not Monaco.
import { MilanoRenderedView } from "@get-milano/react";
import type {
  MilanoContextHandle,
  MilanoOccurrence,
  MilanoUserInteraction,
  MilanoView,
} from "@get-milano/core";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CssBaseline from "@mui/material/CssBaseline";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  build,
  ENGINE_VERSION,
  parseContextValues,
  type BuildInputs,
  type Failure,
  type PendingAction,
} from "./engine";
import { ActionSnackbar } from "./ActionSnackbar";
import { ErrorBoundary } from "./ErrorBoundary";
import { onBuildNow, revealRange, setGateMarkers, type GateMarker } from "./editor-link";
import { producerFolder, zip } from "./export";
import { locateReference } from "./locate";
import { EXAMPLES } from "./samples";
import { describe } from "./engine";
import { decodeState, encodeState } from "./share";

// Monaco arrives with this chunk, after the shell has painted.
const JsonEditor = lazy(() => import("./JsonEditor"));

type EditorTab = "vocabulary.json" | "document.json";
type PanelTab =
  | "context"
  | "state-values"
  | "grants"
  | "live"
  | "timeline"
  | "occurrences"
  | "analytics"
  | "tree"
  | "bindings";

/** The synthetic dropdown entry holding edits set aside by a switch. */
const STASH_KEY = "__stash__";
const STORAGE_KEY = "milano-playground-session-v1";

/** One entry of the runtime's story, in the order it happened. */
interface TimelineEvent {
  readonly at: number;
  readonly kind: "build" | "occurrence" | "analytics" | "action" | "completion";
  readonly text: string;
  readonly node: string | null;
}

interface Streamed {
  readonly occurrences: MilanoOccurrence[];
  readonly interactions: MilanoUserInteraction[];
  readonly pending: PendingAction[];
  readonly timeline: TimelineEvent[];
}

const EMPTY: Streamed = { occurrences: [], interactions: [], pending: [], timeline: [] };

function withEvent(streamed: Streamed, entry: TimelineEvent): Streamed {
  // Capped: a long session must not grow without bound.
  return { ...streamed, timeline: [...streamed.timeline.slice(-249), entry] };
}

function timelineEvent(
  kind: TimelineEvent["kind"],
  text: string,
  node: string | null = null,
): TimelineEvent {
  return { at: Date.now(), kind, text, node };
}

interface Session {
  readonly inputs: BuildInputs;
  readonly example: string;
  readonly stash: BuildInputs | null;
  readonly origin: BuildInputs;
}

function sessionFromExample(example: (typeof EXAMPLES)[number]): Session {
  const inputs: BuildInputs = {
    vocabulary: example.vocabulary,
    document: example.document,
    context: example.context,
    state: example.state,
    actions: example.actions,
    policy: "fail",
  };
  return { inputs, example: example.key, stash: null, origin: inputs };
}

function isInputs(value: unknown): value is BuildInputs {
  if (value === null || typeof value !== "object") return false;
  return (["vocabulary", "document", "context", "state", "actions", "policy"] as const).every(
    (key) => typeof (value as Record<string, unknown>)[key] === "string",
  );
}

/**
 * Where a session starts: an `#e=<key>` link names an example, a stored
 * session survives a refresh, and a compressed share fragment is decoded
 * asynchronously by the effect below. In that order of intent.
 */
function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const stored = JSON.parse(raw) as Partial<Session>;
    if (!isInputs(stored.inputs) || !isInputs(stored.origin) || typeof stored.example !== "string") {
      return null;
    }
    return {
      inputs: stored.inputs,
      example: stored.example,
      origin: stored.origin,
      stash: isInputs(stored.stash) ? stored.stash : null,
    };
  } catch {
    // Storage unavailable or corrupt: a fresh session is the answer.
    return null;
  }
}

function initialSession(): Session {
  const hash = location.hash.slice(1);
  const stored = storedSession();
  if (hash.startsWith("e=")) {
    const linked = EXAMPLES.find((entry) => entry.key === hash.slice(2));
    if (linked !== undefined) {
      // A link opens the example it names, but never at the price of the
      // stored session's work: dirty panes, or an existing stash, carry
      // over as the stash of the linked session.
      const base = sessionFromExample(linked);
      if (stored === null) return base;
      const wasDirty = (
        ["vocabulary", "document", "context", "state", "actions"] as const
      ).some((key) => stored.inputs[key] !== stored.origin[key]);
      return { ...base, stash: wasDirty ? stored.inputs : stored.stash };
    }
  }
  if (stored !== null) return stored;
  return sessionFromExample(EXAMPLES[0] as (typeof EXAMPLES)[number]);
}

export function App() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const narrow = useMediaQuery("(max-width: 899px)");
  const theme = useMemo(
    () => createTheme({ palette: { mode: prefersDark ? "dark" : "light" } }),
    [prefersDark],
  );

  const [session] = useState(initialSession);
  const [inputs, setInputs] = useState<BuildInputs>(session.inputs);
  const [view, setView] = useState<MilanoView | null>(null);
  const [registry, setRegistry] = useState<Parameters<typeof MilanoRenderedView>[0]["registry"] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [streamed, setStreamed] = useState<Streamed>(EMPTY);
  const [status, setStatus] = useState(`engine ${ENGINE_VERSION}`);
  const [building, setBuilding] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("document.json");
  const [panelTab, setPanelTab] = useState<PanelTab>("live");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHeight, setPanelHeight] = useState(224);

  const patch = useCallback(
    (part: Partial<BuildInputs>) => setInputs((current) => ({ ...current, ...part })),
    [],
  );

  const flash = useCallback((message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(`engine ${ENGINE_VERSION}`), 2500);
  }, []);

  // The bundled examples: picking one replaces every pane, the way a
  // shared link does, and stamps the address bar with a light `#e=` link
  // anyone can pass around. Edits are never silently lost: switching away
  // from dirty panes stashes them under a synthetic "Your edits" entry.
  const [example, setExample] = useState(session.example);
  const [stash, setStash] = useState<BuildInputs | null>(session.stash);
  const origin = useRef<BuildInputs>(session.origin);
  const dirty = useCallback(
    () =>
      (["vocabulary", "document", "context", "state", "actions"] as const).some(
        (key) => inputs[key] !== origin.current[key],
      ),
    [inputs],
  );
  const loadExample = useCallback(
    (key: string) => {
      if (key === STASH_KEY) {
        if (stash === null) return;
        // A swap, so returning to the stash never loses the panes being
        // left: dirty edits become the new stash.
        const restored = stash;
        setStash(dirty() ? inputs : null);
        setExample(STASH_KEY);
        origin.current = restored;
        setInputs(restored);
        return;
      }
      const chosen = EXAMPLES.find((entry) => entry.key === key);
      if (chosen === undefined) return;
      if (dirty()) {
        setStash(inputs);
        flash('edits set aside under "Your edits"');
      }
      const loaded = sessionFromExample(chosen);
      setExample(key);
      origin.current = loaded.origin;
      setInputs(loaded.inputs);
      history.replaceState(null, "", `#e=${key}`);
    },
    [dirty, flash, inputs, stash],
  );

  // The session survives a refresh: an experiment must not die with an
  // accidental reload. Debounced, and best-effort like all storage.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ inputs, example, stash, origin: origin.current }),
        );
      } catch {
        // Private windows and full disks lose persistence, nothing else.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [inputs, example, stash]);

  // A compressed share link replaces every pane at once; `#e=` links were
  // already consumed synchronously at startup.
  useEffect(() => {
    if (location.hash.length <= 1 || location.hash.startsWith("#e=")) return;
    void decodeState(location.hash.slice(1)).then((restored) => {
      if (restored === null) return;
      setExample("");
      const loaded: BuildInputs = { ...restored, actions: restored.actions ?? "" };
      origin.current = loaded;
      setInputs(loaded);
    });
  }, []);

  // Editor assistance is best-effort and never blocks: the engine decides
  // what is valid, the schemas only help while typing. Both modules ride
  // the Monaco chunk, so they are imported dynamically.
  const [schemas, setSchemas] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void import("./schemas")
      .then((module) => module.loadEditorSchemas())
      .then((loaded) => {
        if (!cancelled) setSchemas(loaded);
      });
    void import("./expressions").then((module) => module.installExpressionCompletion());
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    void import("./expressions").then((module) => module.setExpressionScope(inputs.vocabulary));
    if (schemas) {
      void import("./schemas").then((module) => module.applyEditorSchemas(inputs.vocabulary));
    }
  }, [schemas, inputs.vocabulary]);

  // Cmd/Ctrl+Enter builds immediately, skipping the debounce; the same
  // gesture inside Monaco arrives through editor-link, since the editor
  // swallows its own keystrokes.
  const immediate = useRef(false);
  const [buildNonce, setBuildNonce] = useState(0);
  const buildNow = useCallback(() => {
    immediate.current = true;
    setBuildNonce((nonce) => nonce + 1);
  }, []);
  useEffect(() => {
    onBuildNow(buildNow);
    const listener = (keyboard: KeyboardEvent) => {
      if ((keyboard.metaKey || keyboard.ctrlKey) && keyboard.key === "Enter") {
        keyboard.preventDefault();
        buildNow();
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      onBuildNow(null);
      window.removeEventListener("keydown", listener);
    };
  }, [buildNow]);

  // Debounced so typing does not rebuild on every keystroke, and
  // generation-guarded so a slow build cannot overwrite a newer one.
  const generation = useRef(0);
  const current = useRef<MilanoView | null>(null);
  const liveContext = useRef<MilanoContextHandle | null>(null);
  const built = useRef<BuildInputs | null>(null);
  useEffect(() => {
    const run = ++generation.current;
    const delay = immediate.current ? 0 : 400;
    immediate.current = false;
    const timer = setTimeout(() => {
      setBuilding(true);
      // Only the document changed under a live view: replace it in place,
      // the way a host refreshes a document, so the state the author put
      // into the view survives the edit. A replacement that fails leaves
      // the view as it was and shows why; anything else changing (the
      // vocabulary, the data, the grants) is a new engine or surface, and
      // a rebuild.
      const previous = built.current;
      const live = current.current;
      // Only the context changed under a live view: push it through the
      // handle, the way a host updates context at runtime. The engine
      // validates the update atomically; a rejection arrives as a
      // rejectedContextUpdate occurrence, and the view keeps its values.
      if (
        previous !== null &&
        live !== null &&
        liveContext.current !== null &&
        previous.context !== inputs.context &&
        previous.document === inputs.document &&
        previous.vocabulary === inputs.vocabulary &&
        previous.state === inputs.state &&
        previous.actions === inputs.actions &&
        previous.policy === inputs.policy
      ) {
        try {
          const values = parseContextValues(inputs.context);
          liveContext.current.update(values);
          built.current = inputs;
          setBuilding(false);
          setStreamed((s) => withEvent(s, timelineEvent("build", "context pushed to the live view")));
          return;
        } catch {
          // Unparseable context: fall through to a full rebuild, whose
          // failure says what the gate sees.
        }
      }
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
            setBuilding(false);
            setStreamed((s) =>
              withEvent(s, timelineEvent("build", "document replaced in place · state kept")),
            );
          },
          (error: unknown) => {
            if (run !== generation.current) return;
            const described = describe(error);
            setFailure(described);
            setBuilding(false);
            setStreamed((s) =>
              withEvent(
                s,
                timelineEvent("build", `replacement rejected · ${described.headline}`, described.node),
              ),
            );
          },
        );
        return;
      }
      const collected: Streamed = { occurrences: [], interactions: [], pending: [], timeline: [] };
      void build(inputs, {
        onOccurrence: (occurrence) => {
          collected.occurrences.push(occurrence);
          collected.timeline.push(
            timelineEvent("occurrence", describeOccurrence(occurrence), occurrence.node),
          );
          setStreamed((s) =>
            withEvent(
              { ...s, occurrences: [...s.occurrences, occurrence] },
              timelineEvent("occurrence", describeOccurrence(occurrence), occurrence.node),
            ),
          );
        },
        onInteraction: (interaction) => {
          collected.interactions.push(interaction);
          setStreamed((s) =>
            withEvent(
              { ...s, interactions: [...s.interactions, interaction] },
              timelineEvent("analytics", describeInteraction(interaction), interaction.node),
            ),
          );
        },
        onAction: (pending) =>
          setStreamed((s) =>
            withEvent(
              { ...s, pending: [...s.pending, pending] },
              timelineEvent("action", `dispatched ${pending.action.name} (${pending.action.dispatchId})`),
            ),
          ),
      }).then((outcome) => {
        if (run !== generation.current) {
          if (outcome.ok) outcome.view.teardown();
          return;
        }
        // The previous view is torn down explicitly: a playground that
        // leaked one per keystroke would be a poor advertisement for the
        // lifecycle it is demonstrating.
        current.current?.teardown();
        built.current = inputs;
        setBuilding(false);
        if (!outcome.ok) {
          current.current = null;
          liveContext.current = null;
          setView(null);
          setFailure(outcome.failure);
          setStreamed({
            ...collected,
            pending: [],
            timeline: [
              ...collected.timeline,
              timelineEvent("build", `build failed · ${outcome.failure.headline}`, outcome.failure.node),
            ],
          });
          return;
        }
        current.current = outcome.view;
        liveContext.current = outcome.context;
        setView(outcome.view);
        setRegistry(outcome.registry);
        setFailure(null);
        setStreamed({
          ...collected,
          pending: [],
          timeline: [...collected.timeline, timelineEvent("build", "view rebuilt")],
        });
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [inputs, buildNonce]);

  useEffect(() => () => current.current?.teardown(), []);

  // The gate's verdict, drawn where the author is looking: the failure's
  // node as an error marker in the document editor, occurrence nodes as
  // warnings. Cleared when neither names one.
  useEffect(() => {
    const markers: GateMarker[] = [];
    if (failure !== null && failure.node !== null) {
      const range = locateReference(inputs.document, failure.node);
      if (range !== null) {
        markers.push({ ...range, message: `${failure.headline} · ${failure.detail}`, severity: "error" });
      }
    }
    for (const occurrence of streamed.occurrences.slice(0, 50)) {
      if (occurrence.node === null) continue;
      const range = locateReference(inputs.document, occurrence.node);
      if (range !== null) {
        markers.push({ ...range, message: describeOccurrence(occurrence), severity: "warning" });
      }
    }
    setGateMarkers("document.json", markers);
  }, [failure, streamed.occurrences, inputs.document]);

  // A click on a node reference: bring the document tab forward and
  // reveal the node it names.
  const goToNode = useCallback(
    (reference: string) => {
      const range = locateReference(inputs.document, reference);
      if (range === null) {
        flash(`could not locate ${reference}`);
        return;
      }
      setEditorTab("document.json");
      revealRange("document.json", range.start, range.end);
    },
    [flash, inputs.document],
  );

  const share = useCallback(async () => {
    const fragment = await encodeState(inputs);
    history.replaceState(null, "", `#${fragment}`);
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${fragment}`);
      flash("link copied");
    } catch {
      flash("copy failed · the link is in the address bar");
    }
  }, [flash, inputs]);

  // The exit ramp: the panes as the producer folder a real project keeps,
  // with the CLI commands that continue from here.
  const exportFolder = useCallback(() => {
    const name = example !== "" && example !== STASH_KEY ? example : "document";
    const bytes = zip(producerFolder(inputs.vocabulary, inputs.document, name));
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "milano-producer.zip";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    flash("producer folder downloaded");
  }, [example, flash, inputs.document, inputs.vocabulary]);

  const settle = useCallback((pending: PendingAction, outcome: "success" | "failure", value: string) => {
    pending.settle(outcome, value);
    setStreamed((s) =>
      withEvent(
        { ...s, pending: s.pending.filter((p) => p.id !== pending.id) },
        timelineEvent("completion", `completed ${pending.action.name} · ${outcome}`),
      ),
    );
  }, []);

  // The editor half against the preview half, adjustable; and the panel
  // height, dragged the way a terminal's top edge is.
  const mainRef = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState<[number, number]>([1, 1]);
  const splitDrag = useRef<{ startX: number; start: [number, number] } | null>(null);
  const beginSplit = useCallback(
    (pointer: React.PointerEvent<HTMLElement>) => {
      splitDrag.current = { startX: pointer.clientX, start: [...split] };
      pointer.currentTarget.setPointerCapture(pointer.pointerId);
    },
    [split],
  );
  const moveSplit = useCallback((pointer: React.PointerEvent<HTMLElement>) => {
    const drag = splitDrag.current;
    const main = mainRef.current;
    if (drag === null || main === null || main.clientWidth === 0) return;
    const total = drag.start[0] + drag.start[1];
    const delta = ((pointer.clientX - drag.startX) / main.clientWidth) * total;
    setSplit([Math.max(0.25, drag.start[0] + delta), Math.max(0.25, drag.start[1] - delta)]);
  }, []);
  const endSplit = useCallback(() => {
    splitDrag.current = null;
  }, []);

  const heightDrag = useRef<{ startY: number; start: number } | null>(null);
  const beginHeight = useCallback(
    (pointer: React.PointerEvent<HTMLElement>) => {
      heightDrag.current = { startY: pointer.clientY, start: panelHeight };
      pointer.currentTarget.setPointerCapture(pointer.pointerId);
    },
    [panelHeight],
  );
  const moveHeight = useCallback((pointer: React.PointerEvent<HTMLElement>) => {
    const drag = heightDrag.current;
    if (drag === null) return;
    const next = drag.start + (drag.startY - pointer.clientY);
    setPanelHeight(Math.min(Math.max(120, next), Math.round(window.innerHeight * 0.6)));
  }, []);
  const endHeight = useCallback(() => {
    heightDrag.current = null;
  }, []);

  // Clearing a log empties what was collected so far; the streams keep
  // appending afterwards. Occurrence markers follow, since they derive
  // from the same list.
  const clearPanelTab =
    panelTab === "occurrences"
      ? () => setStreamed((s) => ({ ...s, occurrences: [] }))
      : panelTab === "analytics"
        ? () => setStreamed((s) => ({ ...s, interactions: [] }))
        : panelTab === "timeline"
          ? () => setStreamed((s) => ({ ...s, timeline: [] }))
          : null;

  const currentExample = EXAMPLES.find((entry) => entry.key === example) ?? null;
  const groups = [...new Set(EXAMPLES.map((entry) => entry.group))];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider", alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography variant="h6">Milano Playground</Typography>
          <Chip size="small" variant="outlined" label={building ? "building…" : status} />
          <TextField
            select
            size="small"
            label="Example"
            value={example}
            onChange={(change) => loadExample(change.target.value)}
            slotProps={{ select: { native: true } }}
            sx={{ minWidth: 240 }}
          >
            {example === "" ? <option value="">Shared link</option> : null}
            {stash !== null || example === STASH_KEY ? (
              <option value={STASH_KEY}>Your edits</option>
            ) : null}
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {EXAMPLES.filter((entry) => entry.group === group).map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" onClick={() => void share()}>
            Share
          </Button>
          <Button
            size="small"
            onClick={exportFolder}
            title="Download the panes as a producer folder, with the CLI commands to continue"
          >
            Export
          </Button>
          <Button size="small" href="https://get-milano.dev/specs/" target="_blank" rel="noopener">
            Specs
          </Button>
          <Button size="small" href="https://get-milano.dev/sdk/" target="_blank" rel="noopener">
            SDK
          </Button>
        </Stack>

        <Box
          ref={mainRef}
          sx={
            narrow
              ? { display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }
              : {
                  display: "grid",
                  gridTemplateColumns: `${split[0]}fr 6px ${split[1]}fr`,
                  flexGrow: 1,
                  minHeight: 0,
                }
          }
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              minWidth: 0,
              ...(narrow ? { flexBasis: "45%", flexShrink: 0 } : {}),
            }}
          >
            <Tabs
              value={editorTab}
              onChange={(_, next: EditorTab) => setEditorTab(next)}
              sx={{ borderBottom: 1, borderColor: "divider", minHeight: 34 }}
            >
              <Tab
                value="vocabulary.json"
                label="vocabulary.json"
                sx={{ minHeight: 34, textTransform: "none", fontFamily: "monospace", fontSize: 12 }}
              />
              <Tab
                value="document.json"
                label="document.json"
                sx={{ minHeight: 34, textTransform: "none", fontFamily: "monospace", fontSize: 12 }}
              />
            </Tabs>
            {/* Both editors stay mounted: switching tabs must keep each
                file's undo history and markers, so the inactive one is
                hidden, never unmounted. */}
            <Suspense
              fallback={
                <Typography variant="caption" color="text.secondary" sx={{ p: 2 }}>
                  loading the editors…
                </Typography>
              }
            >
              <Box
                sx={{
                  display: editorTab === "vocabulary.json" ? "flex" : "none",
                  flexDirection: "column",
                  flexGrow: 1,
                  minHeight: 0,
                }}
              >
                <JsonEditor
                  title="Vocabulary"
                  path="vocabulary.json"
                  value={inputs.vocabulary}
                  onChange={(vocabulary) => patch({ vocabulary })}
                  dark={prefersDark}
                  hideTitle
                />
              </Box>
              <Box
                sx={{
                  display: editorTab === "document.json" ? "flex" : "none",
                  flexDirection: "column",
                  flexGrow: 1,
                  minHeight: 0,
                }}
              >
                <JsonEditor
                  title="Document"
                  path="document.json"
                  value={inputs.document}
                  onChange={(documentText) => patch({ document: documentText })}
                  dark={prefersDark}
                  hideTitle
                />
              </Box>
            </Suspense>
          </Box>

          {narrow ? null : (
            <Box
              onPointerDown={beginSplit}
              onPointerMove={moveSplit}
              onPointerUp={endSplit}
              sx={{
                cursor: "col-resize",
                touchAction: "none",
                borderLeft: 1,
                borderColor: "divider",
                "&:hover": { bgcolor: "divider" },
              }}
            />
          )}

          <PreviewPane
            example={currentExample}
            failure={failure}
            occurrenceCount={streamed.occurrences.length}
            view={view}
            registry={registry}
            goToNode={goToNode}
            narrow={narrow}
          />
        </Box>

        {panelOpen ? (
          <Box
            onPointerDown={beginHeight}
            onPointerMove={moveHeight}
            onPointerUp={endHeight}
            sx={{
              height: "5px",
              cursor: "row-resize",
              touchAction: "none",
              borderTop: 1,
              borderColor: "divider",
              flexShrink: 0,
              "&:hover": { bgcolor: "divider" },
            }}
          />
        ) : (
          <Box sx={{ borderTop: 1, borderColor: "divider", flexShrink: 0 }} />
        )}
        <BottomPanel
          tab={panelTab}
          setTab={setPanelTab}
          onClear={clearPanelTab}
          open={panelOpen}
          setOpen={setPanelOpen}
          height={panelHeight}
          inputs={inputs}
          patch={patch}
          view={view}
          streamed={streamed}
          goToNode={goToNode}
        />

        <ErrorBoundary resetKey={streamed.pending[0]?.id ?? null}>
          <ActionSnackbar queue={streamed.pending} settle={settle} />
        </ErrorBoundary>
      </Box>
    </ThemeProvider>
  );
}

interface PreviewPaneProps {
  readonly example: (typeof EXAMPLES)[number] | null;
  readonly failure: Failure | null;
  readonly occurrenceCount: number;
  readonly view: MilanoView | null;
  readonly registry: Parameters<typeof MilanoRenderedView>[0]["registry"] | null;
  readonly goToNode: (reference: string) => void;
  readonly narrow: boolean;
}

function PreviewPane({ example, failure, occurrenceCount, view, registry, goToNode, narrow }: PreviewPaneProps) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const showDescription = example !== null && dismissed !== example.key;

  // Inspect mode: hover outlines the innermost rendered node, a click
  // reveals it in document.json. The bridge stamps every rendered root
  // with data-milano-ref, which is all this needs.
  const [inspecting, setInspecting] = useState(false);
  const outlined = useRef<HTMLElement | null>(null);
  const clearOutline = useCallback(() => {
    if (outlined.current !== null) {
      outlined.current.style.outline = "";
      outlined.current.style.outlineOffset = "";
      outlined.current = null;
    }
  }, []);
  useEffect(() => {
    if (!inspecting) clearOutline();
  }, [clearOutline, inspecting]);
  const stamped = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? (target.closest("[data-milano-ref]") as HTMLElement | null) : null;
  const hoverNode = (over: React.MouseEvent) => {
    if (!inspecting) return;
    const element = stamped(over.target);
    if (element === outlined.current) return;
    clearOutline();
    if (element !== null) {
      element.style.outline = "2px solid #1976d2";
      element.style.outlineOffset = "1px";
      outlined.current = element;
    }
  };
  const pickNode = (click: React.MouseEvent) => {
    if (!inspecting) return;
    click.preventDefault();
    click.stopPropagation();
    const element = stamped(click.target);
    const reference = element?.getAttribute("data-milano-ref");
    setInspecting(false);
    clearOutline();
    if (reference) goToNode(reference);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        ...(narrow ? { flexGrow: 1, borderTop: 1, borderColor: "divider" } : {}),
      }}
    >
      {showDescription ? (
        <Alert
          severity="info"
          icon={false}
          onClose={() => setDismissed(example.key)}
          sx={{ borderRadius: 0, py: 0.25, "& .MuiAlert-message": { py: 0.5 } }}
        >
          <Typography variant="caption">
            {example.description}{" "}
            <Link href={example.docsUrl} target="_blank" rel="noopener">
              Read more
            </Link>
          </Typography>
        </Alert>
      ) : null}
      <Box sx={{ px: 1.5, pt: 1 }}>
        {failure === null ? (
          <Alert severity="success" variant="outlined" sx={{ py: 0 }}>
            <Typography variant="caption">
              Build succeeds ·{" "}
              {occurrenceCount === 0 ? "no occurrences" : `${occurrenceCount} occurrence(s)`}
            </Typography>
          </Alert>
        ) : (
          <Alert severity="error" variant="outlined">
            <AlertTitle sx={{ mb: 0 }}>{failure.headline}</AlertTitle>
            <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
              {failure.detail}
            </Typography>
            {failure.node === null ? null : (
              <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
                <Link component="button" onClick={() => goToNode(failure.node as string)}>
                  show {failure.node} in document.json
                </Link>
              </Typography>
            )}
          </Alert>
        )}
      </Box>
      <Stack direction="row" spacing={1} sx={{ px: 1.5, pt: 0.5, alignItems: "center", justifyContent: "flex-end" }}>
        {inspecting ? (
          <Typography variant="caption" color="text.secondary">
            click an element to reveal its node
          </Typography>
        ) : null}
        <Button
          size="small"
          color={inspecting ? "primary" : "inherit"}
          variant={inspecting ? "outlined" : "text"}
          onClick={() => setInspecting((now) => !now)}
        >
          Inspect
        </Button>
      </Stack>
      <Box
        onMouseOver={hoverNode}
        onClickCapture={pickNode}
        sx={{
          flexGrow: 1,
          overflow: "auto",
          px: 1.5,
          pb: 1.5,
          minHeight: 80,
          cursor: inspecting ? "crosshair" : "auto",
        }}
      >
        {view === null || registry === null ? null : (
          <ErrorBoundary resetKey={view}>
            <MilanoRenderedView view={view} registry={registry} />
          </ErrorBoundary>
        )}
      </Box>
    </Box>
  );
}

interface BottomPanelProps {
  readonly tab: PanelTab;
  readonly setTab: (tab: PanelTab) => void;
  /** Empties the active tab's log; null for tabs that are not logs. */
  readonly onClear: (() => void) | null;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly height: number;
  readonly inputs: BuildInputs;
  readonly patch: (part: Partial<BuildInputs>) => void;
  readonly view: MilanoView | null;
  readonly streamed: Streamed;
  readonly goToNode: (reference: string) => void;
}

function BottomPanel({
  tab,
  setTab,
  onClear,
  open,
  setOpen,
  height,
  inputs,
  patch,
  view,
  streamed,
  goToNode,
}: BottomPanelProps) {
  const pick = (next: PanelTab) => {
    setTab(next);
    if (!open) setOpen(true);
  };
  return (
    <Box sx={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: open ? 1 : 0, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={(_, next: PanelTab) => pick(next)}
          variant="scrollable"
          sx={{ minHeight: 32, flexGrow: 1 }}
        >
          <Tab value="context" label="Context values" sx={{ minHeight: 32, fontSize: 12 }} />
          <Tab value="state-values" label="State values" sx={{ minHeight: 32, fontSize: 12 }} />
          <Tab value="grants" label="Action grants" sx={{ minHeight: 32, fontSize: 12 }} />
          <Tab value="live" label="Live state" sx={{ minHeight: 32, fontSize: 12 }} />
          <Tab value="timeline" label="Timeline" sx={{ minHeight: 32, fontSize: 12 }} />
          <Tab
            value="occurrences"
            label={`Occurrences (${streamed.occurrences.length})`}
            sx={{ minHeight: 32, fontSize: 12 }}
          />
          <Tab
            value="analytics"
            label={`Analytics (${streamed.interactions.length})`}
            sx={{ minHeight: 32, fontSize: 12 }}
          />
          <Tab value="tree" label="Tree" sx={{ minHeight: 32, fontSize: 12 }} />
          <Tab value="bindings" label="Bindings" sx={{ minHeight: 32, fontSize: 12 }} />
        </Tabs>
        {onClear === null ? null : (
          <Button size="small" onClick={onClear} sx={{ mr: 1 }}>
            Clear
          </Button>
        )}
        <TextField
          select
          size="small"
          label="Unknown types"
          value={inputs.policy}
          onChange={(change) => patch({ policy: change.target.value })}
          slotProps={{ select: { native: true } }}
          sx={{ minWidth: 130, mr: 1 }}
        >
          <option value="fail">fail</option>
          <option value="skip">skip</option>
          <option value="placeholder">placeholder</option>
        </TextField>
        <Button size="small" onClick={() => setOpen(!open)} sx={{ minWidth: 36 }}>
          {open ? "▾" : "▴"}
        </Button>
      </Stack>
      {open ? (
        <Box sx={{ height, overflow: "auto", p: 1.5 }}>
          <PanelContent tab={tab} inputs={inputs} patch={patch} view={view} streamed={streamed} goToNode={goToNode} />
        </Box>
      ) : null}
    </Box>
  );
}

interface PanelContentProps {
  readonly tab: PanelTab;
  readonly inputs: BuildInputs;
  readonly patch: (part: Partial<BuildInputs>) => void;
  readonly view: MilanoView | null;
  readonly streamed: Streamed;
  readonly goToNode: (reference: string) => void;
}

function PanelContent({ tab, inputs, patch, view, streamed, goToNode }: PanelContentProps) {
  if (tab === "context") {
    return (
      <PanelField
        label="Context values, as a JSON object · edits push to the live view"
        value={inputs.context}
        onChange={(context) => patch({ context })}
      />
    );
  }
  if (tab === "state-values") {
    return (
      <PanelField
        label="State values the provider answers, as a JSON object"
        value={inputs.state}
        onChange={(state) => patch({ state })}
      />
    );
  }
  if (tab === "grants") {
    return (
      <PanelField
        label='Builder action grants: {"allow": [...], "declare": {...}}'
        value={inputs.actions}
        onChange={(actions) => patch({ actions })}
      />
    );
  }
  if (tab === "bindings") return <BindingsPanel vocabulary={inputs.vocabulary} />;
  if (view === null) {
    return (
      <Typography variant="body2" color="text.secondary">
        Nothing built yet.
      </Typography>
    );
  }
  if (tab === "live") return <StatePanel view={view} />;
  if (tab === "timeline") {
    return (
      <Log
        rows={streamed.timeline.map((entry) => ({
          text: `${stamp(entry.at)}  ${entry.kind.padEnd(10)}  ${entry.text}`,
          node: entry.node,
        }))}
        empty="Nothing yet: build, tap, and complete something."
        goToNode={goToNode}
      />
    );
  }
  if (tab === "occurrences") {
    return (
      <Log
        rows={streamed.occurrences.map((occurrence) => ({
          text: describeOccurrence(occurrence),
          node: occurrence.node,
        }))}
        empty="No occurrences: nothing degraded."
        goToNode={goToNode}
      />
    );
  }
  if (tab === "analytics") {
    return (
      <Log
        rows={streamed.interactions.map((interaction) => ({
          text: describeInteraction(interaction),
          node: interaction.node,
        }))}
        empty="No interactions yet."
        goToNode={goToNode}
      />
    );
  }
  return (
    <ErrorBoundary resetKey={view}>
      <Box component="pre" sx={{ m: 0, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
        {JSON.stringify(view.resolvedRoot, replacer, 2)}
      </Box>
    </ErrorBoundary>
  );
}

/** Wall-clock with milliseconds, for the timeline. */
function stamp(at: number): string {
  const time = new Date(at);
  return `${time.toLocaleTimeString(undefined, { hour12: false })}.${String(at % 1000).padStart(3, "0")}`;
}

/** One editable input of the surface, filling its panel section. */
function PanelField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  // A gentle hint only: the gate is the authority, this saves the round
  // trip for a missing comma.
  const invalid = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    try {
      JSON.parse(trimmed);
      return false;
    } catch {
      return true;
    }
  }, [value]);
  return (
    <TextField
      fullWidth
      multiline
      minRows={4}
      size="small"
      label={label}
      value={value}
      error={invalid}
      helperText={invalid ? "Not parseable JSON yet" : undefined}
      onChange={(change) => onChange(change.target.value)}
      slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 12 } } }}
    />
  );
}

type BindingLanguage = "swift" | "kotlin" | "ts";

const BINDING_LABELS: Record<BindingLanguage, string> = {
  swift: "Swift",
  kotlin: "Kotlin",
  ts: "TypeScript",
};

/**
 * What `milano bindings` would generate from the vocabulary pane, using
 * the CLI's own generator: the same bytes a project would commit. The
 * generator module is pure and loads lazily, outside the main chunk.
 */
function BindingsPanel({ vocabulary }: { readonly vocabulary: string }) {
  const [language, setLanguage] = useState<BindingLanguage>("swift");
  const [output, setOutput] = useState("generating…");
  useEffect(() => {
    let cancelled = false;
    void import("@milano-cli-bindings").then((generators) => {
      let text: string;
      try {
        const parsed = JSON.parse(vocabulary) as Record<string, unknown>;
        text =
          language === "swift"
            ? generators.generateSwift(parsed, generators.defaultPrefix(parsed))
            : language === "kotlin"
              ? generators.generateKotlin(parsed, "dev.getmilano.playground", "")
              : generators.generateTs(parsed, generators.defaultPrefix(parsed), "@get-milano/core");
      } catch (error) {
        text = `cannot generate: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (!cancelled) setOutput(text);
    });
    return () => {
      cancelled = true;
    };
  }, [language, vocabulary]);
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        {(Object.keys(BINDING_LABELS) as BindingLanguage[]).map((candidate) => (
          <Chip
            key={candidate}
            size="small"
            label={BINDING_LABELS[candidate]}
            color={candidate === language ? "primary" : "default"}
            variant={candidate === language ? "filled" : "outlined"}
            onClick={() => setLanguage(candidate)}
          />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          onClick={() => {
            void navigator.clipboard.writeText(output).catch(() => {});
          }}
        >
          Copy
        </Button>
      </Stack>
      <Box component="pre" sx={{ m: 0, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre" }}>
        {output}
      </Box>
    </Stack>
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

interface LogRow {
  readonly text: string;
  readonly node: string | null;
}

function Log({
  rows,
  empty,
  goToNode,
}: {
  readonly rows: LogRow[];
  readonly empty: string;
  readonly goToNode: (reference: string) => void;
}) {
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
        <Typography key={index} variant="caption" sx={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
          {row.node === null ? (
            row.text
          ) : (
            <Link
              component="button"
              underline="hover"
              color="inherit"
              onClick={() => goToNode(row.node as string)}
              sx={{ fontFamily: "monospace", fontSize: "inherit", textAlign: "left" }}
              title="Show in document.json"
            >
              {row.text}
            </Link>
          )}
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
