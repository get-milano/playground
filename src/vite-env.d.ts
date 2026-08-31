/// <reference types="vite/client" />

// The slim Monaco entries carry no .d.ts of their own; their types come
// from editor.api, imported alongside them in src/monaco.ts.
declare module "monaco-editor/esm/vs/editor/edcore.main";
declare module "monaco-editor/esm/vs/language/json/monaco.contribution";
