// Editor assistance: the document editor autocompletes the author's own
// components, property names, and event names, by tightening the official
// document schema with whatever the vocabulary pane currently declares.
//
// Strictly optional. The engine decides what is valid; this only makes
// typing easier, so a failed schema fetch degrades autocomplete and
// nothing else.
import * as monaco from "monaco-editor";

import { deriveDocumentSchema, parseVocabulary } from "./derive";
import { loadSpecs, type SpecBundle } from "./specs";

let bundle: SpecBundle | null = null;

export async function loadEditorSchemas(): Promise<boolean> {
  try {
    bundle = await loadSpecs();
    return true;
  } catch {
    return false;
  }
}

export function applyEditorSchemas(vocabularyText: string): void {
  if (bundle === null) return;
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    enableSchemaRequest: false,
    schemas: [
      {
        uri: "milano://schema/vocabulary",
        fileMatch: ["**/vocabulary.json"],
        schema: bundle.vocabularySchema
      },
      {
        uri: "milano://schema/document",
        fileMatch: ["**/document.json"],
        schema: deriveDocumentSchema(bundle.documentSchema, parseVocabulary(vocabularyText))
      }
    ]
  });
}
