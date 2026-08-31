// Monaco, JSON-only. The stock `monaco-editor` entry bundles fifty-odd
// language modes the playground never edits; this one loads the editor
// core plus the JSON mode and nothing else, which is most of the
// difference between a fast first paint and a four-megabyte main chunk.
// Everything that needs Monaco imports it from here, so the slimming is a
// single decision, made once.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/edcore.main";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    return label === "json" ? new jsonWorker() : new editorWorker();
  },
};

export { monaco };
