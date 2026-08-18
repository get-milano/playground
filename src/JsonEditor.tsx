// Monaco, wrapped thinly. The editor owns its model for the lifetime of
// the pane; React only feeds it the initial text and takes edits back.
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useRef } from "react";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    return label === "json" ? new jsonWorker() : new editorWorker();
  },
};

export interface JsonEditorProps {
  readonly title: string;
  /** Distinguishes the models, and matches the schema associations. */
  readonly path: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly dark: boolean;
}

export function JsonEditor({ title, path, value, onChange, dark }: JsonEditorProps) {
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
    const subscription = model.onDidChangeContent(() => latest.current(model.getValue()));
    return () => {
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
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, borderLeft: 1, borderColor: "divider" }}>
      <Typography
        variant="overline"
        sx={{ px: 1.5, py: 0.5, borderBottom: 1, borderColor: "divider", color: "text.secondary" }}
      >
        {title}
      </Typography>
      <Box ref={host} sx={{ flexGrow: 1, minHeight: 0 }} />
    </Box>
  );
}
