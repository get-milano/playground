// The JSON Schemas, used for editor assistance only: autocomplete and
// inline hints while typing. Validation is the engine's job now, so a
// failed fetch costs autocomplete and nothing else.
//
// Local development is the one exception: the sibling specs checkout may be
// ahead of published main, and validating against stale specs makes the dev
// playground crash or lie. When the page runs on localhost, a dev copy
// synced into specs-dev/ (npm run sync-specs) wins over published main;
// the folder is untracked and never deployed, so production stays pinned
// to main.

const RAW = "https://raw.githubusercontent.com/get-milano/specs/main";

const LOCAL_DEV = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? `${import.meta.env.BASE_URL}specs-dev`
  : null;

let announcedDevSpecs = false;

export interface SpecBundle {
  vocabularySchema: Record<string, unknown>;
  documentSchema: Record<string, unknown>;
}

async function load(path: string): Promise<Response> {
  if (LOCAL_DEV) {
    try {
      const response = await fetch(`${LOCAL_DEV}/${path}`);
      if (response.ok) {
        if (!announcedDevSpecs) {
          announcedDevSpecs = true;
          console.info(
            "[playground] using local dev specs from specs-dev/ " +
              "(npm run sync-specs to refresh)"
          );
        }
        return response;
      }
    } catch {
      // No dev copy synced; fall through to published main.
    }
  }
  const response = await fetch(`${RAW}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}

async function fetchJson(path: string): Promise<Record<string, unknown>> {
  return (await load(path)).json();
}

export async function loadSpecs(): Promise<SpecBundle> {
  const [vocabularySchema, documentSchema] = await Promise.all([
    fetchJson("schemas/vocabulary.schema.json"),
    fetchJson("schemas/document.schema.json")
  ]);
  return { vocabularySchema, documentSchema };
}
