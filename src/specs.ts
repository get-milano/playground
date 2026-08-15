// Runtime binding to the specs repository: the playground always validates
// against current main, so it can never drift from the published spec.

const RAW = "https://raw.githubusercontent.com/get-milano/specs/main";

export interface SpecBundle {
  vocabularySchema: Record<string, unknown>;
  documentSchema: Record<string, unknown>;
  referenceCheckerSource: string;
}

async function fetchJson(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${RAW}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(`${RAW}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}

export async function loadSpecs(): Promise<SpecBundle> {
  const [vocabularySchema, documentSchema, referenceCheckerSource] =
    await Promise.all([
      fetchJson("schemas/vocabulary.schema.json"),
      fetchJson("schemas/document.schema.json"),
      fetchText("tools/reference_check.py")
    ]);
  return { vocabularySchema, documentSchema, referenceCheckerSource };
}
