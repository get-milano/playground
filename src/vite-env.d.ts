/// <reference types="vite/client" />

// The slim Monaco entries carry no .d.ts of their own; their types come
// from editor.api, imported alongside them in src/monaco.ts.
declare module "monaco-editor/esm/vs/editor/edcore.main";
declare module "monaco-editor/esm/vs/language/json/monaco.contribution";

// The surface of @get-milano/cli's bindings generator, reached through the
// vite alias above the package's exports map (see vite.config.ts).
declare module "@milano-cli-bindings" {
  export type Vocabulary = Record<string, unknown>;
  export class BindingError extends Error {}
  export function defaultPrefix(vocabulary: Vocabulary): string;
  export function generateSwift(vocabulary: Vocabulary, prefix: string): string;
  export function generateKotlin(vocabulary: Vocabulary, pkg: string, prefix: string): string;
  export function generateTs(vocabulary: Vocabulary, prefix: string, coreImport: string): string;
}
