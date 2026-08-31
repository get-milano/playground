// Monaco, wrapped thinly. The editor owns its model for the lifetime of
// the pane; React only feeds it the initial text and takes edits back.
// This module is loaded lazily (it is what pulls Monaco in), so its editor
// services register through editor-link when it arrives.
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useRef } from "react";

import { connectEditors, markersFor, requestBuildNow } from "./editor-link";
import { monaco } from "./monaco";

// The live editors by pane path, so a failure or occurrence can point at
// the node it names. Markers live in editor-link and are re-applied when a
// pane remounts, since unmounting disposes the model and its markers.
const LIVE = new Map<string, monaco.editor.IStandaloneCodeEditor>();

function modelFor(path: string): monaco.editor.ITextModel | null {
  return monaco.editor.getModel(monaco.Uri.parse(`milano://model/${path}`));
}

function applyMarkers(path: string): void {
  const model = modelFor(path);
  if (model === null) return;
  const applied = markersFor(path).map((marker) => {
    const from = model.getPositionAt(marker.start);
    const to = model.getPositionAt(marker.end);
    return {
      message: marker.message,
      severity:
        marker.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      startLineNumber: from.lineNumber,
      startColumn: from.column,
      endLineNumber: to.lineNumber,
      endColumn: to.column,
    };
  });
  monaco.editor.setModelMarkers(model, "milano-gate", applied);
}

/**
 * Scrolls a pane's editor to a text range and selects it. Retries across a
 * few frames so a click that first has to mount or unhide the pane (a tab
 * being brought forward has no height until the next layout) still lands.
 */
function reveal(path: string, start: number, end: number, attempt = 0): void {
  const editor = LIVE.get(path);
  const model = modelFor(path);
  if (editor === undefined || model === null || editor.getLayoutInfo().height === 0) {
    if (attempt < 20) requestAnimationFrame(() => reveal(path, start, end, attempt + 1));
    return;
  }
  const from = model.getPositionAt(start);
  const to = model.getPositionAt(end);
  const range = new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column);
  editor.setSelection(range);
  editor.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
  editor.focus();
}

connectEditors({ applyMarkers, reveal });

export interface JsonEditorProps {
  readonly title: string;
  /** Distinguishes the models, and matches the schema associations. */
  readonly path: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly dark: boolean;
  /** The editor group renders its own tab bar; it hides the pane title. */
  readonly hideTitle?: boolean;
}

export function JsonEditor({ title, path, value, onChange, dark, hideTitle }: JsonEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (host.current === null) return;
    const uri = monaco.Uri.parse(`milano://model/${path}`);
    const model =
      monaco.editor.getModel(uri) ?? monaco.editor.createModel(value, "json", uri);
    const created = monaco.editor.create(host.current, {
      model,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      tabSize: 2,
    });
    editor.current = created;
    LIVE.set(path, created);
    applyMarkers(path);
    // Build now, even from inside the editor, where the window never
    // hears the keystroke.
    created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => requestBuildNow());
    const subscription = model.onDidChangeContent(() => latest.current(model.getValue()));
    return () => {
      LIVE.delete(path);
      subscription.dispose();
      created.dispose();
      model.dispose();
    };
    // The model is created once per pane; `value` seeds it and is then
    // owned by Monaco, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    monaco.editor.setTheme(dark ? "vs-dark" : "vs");
  }, [dark]);

  // A shared link replaces the text under the editor; typing does not.
  useEffect(() => {
    const model = editor.current?.getModel();
    if (model !== null && model !== undefined && model.getValue() !== value) {
      model.setValue(value);
    }
  }, [value]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, flexGrow: 1 }}>
      {hideTitle === true ? null : (
        <Typography
          variant="overline"
          sx={{ px: 1.5, py: 0.5, borderBottom: 1, borderColor: "divider", color: "text.secondary" }}
        >
          {title}
        </Typography>
      )}
      <Box ref={host} sx={{ flexGrow: 1, minHeight: 0 }} />
    </Box>
  );
}

export default JsonEditor;
