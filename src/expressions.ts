// Completion inside `$expr` strings, where the document's JSON schema
// stops: expressions are opaque strings to JSON. What to offer is decided
// by suggest.ts, which is pure and tested; this is the Monaco glue.
//
// Assistance only: the engine decides what is valid, and a pane that does
// not parse simply offers fewer suggestions.
import * as monaco from "monaco-editor";

import { expressionSuggestions, type Suggestion } from "./suggest";

/** The vocabulary pane's text, refreshed as it is edited. */
let vocabularyText = "";

export function setExpressionScope(text: string): void {
  vocabularyText = text;
}

const KINDS: Record<Suggestion["kind"], monaco.languages.CompletionItemKind> = {
  function: monaco.languages.CompletionItemKind.Function,
  hostFunction: monaco.languages.CompletionItemKind.Function,
  key: monaco.languages.CompletionItemKind.Field,
  root: monaco.languages.CompletionItemKind.Variable,
};

const DOCUMENTATION: Record<Suggestion["kind"], string> = {
  function: "A function of the contract: identical on every engine.",
  hostFunction: "A host function this vocabulary declares; the app computes it.",
  key: "A key this document declares.",
  root: "A root, available where the gate binds it.",
};

/** Offers with a host function first, then keys, then the contract's own. */
const ORDER: Record<Suggestion["kind"], string> = {
  hostFunction: "0",
  key: "1",
  function: "2",
  root: "3",
};

let installed = false;

/** Registers the provider once; calling again is a no-op. */
export function installExpressionCompletion(): void {
  if (installed) return;
  installed = true;
  monaco.languages.registerCompletionItemProvider("json", {
    triggerCharacters: ["$", "."],
    provideCompletionItems(model, position) {
      const lineUpToCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const offered = expressionSuggestions(lineUpToCursor, model.getValue(), vocabularyText);
      if (offered === null) return { suggestions: [] };

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - offered.typed.length,
        endColumn: position.column,
      };
      return {
        suggestions: offered.suggestions.map((suggestion) => ({
          label: suggestion.label,
          kind: KINDS[suggestion.kind],
          detail: suggestion.detail,
          documentation: DOCUMENTATION[suggestion.kind],
          insertText: suggestion.insert,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: `${ORDER[suggestion.kind]}${suggestion.label}`,
        })),
      };
    },
  });
}
