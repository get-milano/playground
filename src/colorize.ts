// Colors the generated bindings with Monaco's own tokenizers, as static
// HTML: no editor instance, just `monaco.editor.colorize`. Loaded lazily
// with the three Monarch grammars it needs, so the main chunk stays
// JSON-only; the token styles come from the same global theme the editors
// set, so light and dark match the rest of the page.
import { monaco } from "./monaco";
import "monaco-editor/esm/vs/basic-languages/swift/swift.contribution";
import "monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution";

const LANGUAGE_IDS = {
  swift: "swift",
  kotlin: "kotlin",
  ts: "typescript",
} as const;

export type ColorizeLanguage = keyof typeof LANGUAGE_IDS;

/** The code as theme-styled HTML; the caller falls back to plain text on failure. */
export function colorize(code: string, language: ColorizeLanguage, dark: boolean): Promise<string> {
  // The theme is global and shared with the editors; setting it here covers
  // the panel being used before any editor has mounted.
  monaco.editor.setTheme(dark ? "vs-dark" : "vs");
  return monaco.editor.colorize(code, LANGUAGE_IDS[language], { tabSize: 2 });
}
