// The seam between the app shell and the lazily loaded editors. The shell
// must set markers, reveal ranges, and hear the build-now shortcut without
// importing anything that drags Monaco into the first chunk; the editor
// module connects here when it arrives and drains whatever queued while it
// was loading.

export interface GateMarker {
  readonly start: number;
  readonly end: number;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface EditorSink {
  /** Re-applies the stored markers for one pane. */
  applyMarkers(path: string): void;
  /** Scrolls a pane's editor to a range and selects it. */
  reveal(path: string, start: number, end: number): void;
}

let sink: EditorSink | null = null;
const markers = new Map<string, readonly GateMarker[]>();
let queuedReveal: { path: string; start: number; end: number } | null = null;
let buildNow: (() => void) | null = null;

/** The editor module announcing itself; queued work runs immediately. */
export function connectEditors(next: EditorSink): void {
  sink = next;
  for (const path of markers.keys()) next.applyMarkers(path);
  if (queuedReveal !== null) {
    next.reveal(queuedReveal.path, queuedReveal.start, queuedReveal.end);
    queuedReveal = null;
  }
}

/** Replaces the gate's markers on one pane. An empty list clears them. */
export function setGateMarkers(path: string, next: readonly GateMarker[]): void {
  markers.set(path, next);
  sink?.applyMarkers(path);
}

/** The stored markers for a pane, for the editor module to draw. */
export function markersFor(path: string): readonly GateMarker[] {
  return markers.get(path) ?? [];
}

/** Reveal a range, or queue it until the editors have loaded. */
export function revealRange(path: string, start: number, end: number): void {
  if (sink !== null) sink.reveal(path, start, end);
  else queuedReveal = { path, start, end };
}

/** The shell's handler for Cmd/Ctrl+Enter, wherever it is pressed. */
export function onBuildNow(handler: (() => void) | null): void {
  buildNow = handler;
}

export function requestBuildNow(): void {
  buildNow?.();
}
