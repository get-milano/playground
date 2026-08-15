import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020";
import { loadSpecs, type SpecBundle } from "./specs";
import { deriveDocumentSchema, parseVocabulary } from "./derive";
import { startEngine, checkSemantics, dispatchEvent } from "./semantics";
import { encodeState, decodeState, type PlaygroundState } from "./share";
import { renderPreview, collectBindings, type ResolvedNode } from "./preview";
import { EXAMPLES } from "./samples";
import "./style.css";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    return label === "json" ? new jsonWorker() : new editorWorker();
  }
};

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const statusEl = $("specs-status");
const verdictEl = $("verdict");
const resultEl = $<HTMLPreElement>("result");
const previewEl = $("preview");
const toastEl = $("toast");
const contextInput = $<HTMLTextAreaElement>("context-input");
const stateInput = $<HTMLTextAreaElement>("state-input");
const policyInput = $<HTMLSelectElement>("policy-input");

const dark = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  monaco.editor.setTheme(dark.matches ? "vs-dark" : "vs");
}
dark.addEventListener("change", applyTheme);

function makeEditor(containerId: string, value: string, modelPath: string) {
  const model = monaco.editor.createModel(
    value,
    "json",
    monaco.Uri.parse(`milano://model/${modelPath}`)
  );
  return monaco.editor.create($(containerId), {
    model,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    tabSize: 2
  });
}

function setVerdict(kind: "ok" | "error" | "info", html: string) {
  verdictEl.className = kind;
  verdictEl.innerHTML = html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(message: string) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2500);
}

async function init() {
  let specs: SpecBundle;
  try {
    specs = await loadSpecs();
  } catch (error) {
    statusEl.textContent = "spec fetch failed";
    setVerdict(
      "error",
      `<b>Could not load the specification.</b> The playground validates against ` +
        `<a href="https://github.com/get-milano/specs">get-milano/specs</a> at runtime and needs the network. ` +
        `<code>${escapeHtml(String(error))}</code>`
    );
    return;
  }
  statusEl.textContent = "spec: specs@main";

  const ajv = new Ajv2020({ allErrors: false, strict: false });
  ajv.addSchema(specs.documentSchema, "document.schema.json");
  const validateVocabulary: ValidateFunction = ajv.compile(specs.vocabularySchema);
  const validateDocument: ValidateFunction = ajv.compile(specs.documentSchema);

  const restored = location.hash.length > 1 ? await decodeState(location.hash.slice(1)) : null;
  const first = EXAMPLES[0];
  const initial: PlaygroundState = restored ?? {
    vocabulary: first.vocabulary,
    document: first.document,
    context: first.context,
    state: first.state,
    policy: "skip"
  };

  const vocabularyEditor = makeEditor("vocabulary-editor", initial.vocabulary, "vocabulary.json");
  const documentEditor = makeEditor("document-editor", initial.document, "document.json");
  contextInput.value = initial.context;
  stateInput.value = initial.state;
  policyInput.value = initial.policy;
  applyTheme();

  function refreshEditorSchemas() {
    const vocabulary = parseVocabulary(vocabularyEditor.getValue());
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      enableSchemaRequest: false,
      schemas: [
        {
          uri: "milano://schema/vocabulary",
          fileMatch: ["**/vocabulary.json"],
          schema: specs.vocabularySchema
        },
        {
          uri: "milano://schema/document",
          fileMatch: ["**/document.json"],
          schema: deriveDocumentSchema(specs.documentSchema, vocabulary)
        }
      ]
    });
  }

  // Pyodide starts loading immediately so semantics are ready by the time
  // anyone finishes their first edit; verdicts degrade gracefully until then.
  let engineReady = false;
  const engine = startEngine(specs.referenceCheckerSource).then((pyodide) => {
    engineReady = true;
    return pyodide;
  });
  engine.catch(() => {
    statusEl.textContent = "spec: specs@main · semantic engine failed to load";
  });

  interface ParsedPanes {
    vocabulary: unknown;
    document: unknown;
    context: unknown;
    state: unknown;
  }

  function parsePanes(): { panes?: ParsedPanes; failure?: string } {
    const sources: Array<[string, string]> = [
      ["vocabulary", vocabularyEditor.getValue()],
      ["document", documentEditor.getValue()],
      ["context values", contextInput.value || "{}"],
      ["state values", stateInput.value || "{}"]
    ];
    const parsed: unknown[] = [];
    for (const [label, text] of sources) {
      try {
        parsed.push(JSON.parse(text));
      } catch (error) {
        return { failure: `${label}: ${String((error as Error).message)}` };
      }
    }
    return {
      panes: {
        vocabulary: parsed[0],
        document: parsed[1],
        context: parsed[2],
        state: parsed[3]
      }
    };
  }

  // Semantic runs are async (the first one waits on Pyodide); a slow run
  // must never overwrite the verdict of a newer edit.
  let generation = 0;

  async function update() {
    const run = ++generation;
    refreshEditorSchemas();
    resultEl.textContent = "";
    previewEl.replaceChildren();

    const { panes, failure } = parsePanes();
    if (!panes) {
      setVerdict("error", `<b>Not valid JSON.</b> ${escapeHtml(failure ?? "")}`);
      return;
    }

    if (!validateVocabulary(panes.vocabulary)) {
      const error = validateVocabulary.errors?.[0];
      setVerdict(
        "error",
        `<b>Vocabulary schema violation.</b> <code>${escapeHtml(error?.instancePath || "/")}</code> ${escapeHtml(error?.message ?? "")}`
      );
      return;
    }
    if (!validateDocument(panes.document)) {
      const error = validateDocument.errors?.[0];
      setVerdict(
        "error",
        `<b>Document schema violation.</b> <code>${escapeHtml(error?.instancePath || "/")}</code> ${escapeHtml(error?.message ?? "")}`
      );
      return;
    }

    const vector: Record<string, unknown> = {
      name: "playground",
      document: panes.document,
      context: panes.context,
      state: panes.state
    };
    if (policyInput.value !== "skip") {
      vector.config = { unknownTypePolicy: policyInput.value };
    }

    if (!engineReady) {
      setVerdict("info", "Structurally valid. Loading the semantic engine…");
      try {
        await engine;
      } catch {
        setVerdict("info", "Structurally valid. Semantic engine unavailable (network?).");
        return;
      }
    }

    const pyodide = await engine;
    const semantic = await checkSemantics(pyodide, panes.vocabulary, vector);
    if (run !== generation) return;
    if (semantic.crash) {
      setVerdict("error", `<b>Checker crashed.</b> <code>${escapeHtml(semantic.crash)}</code>`);
      return;
    }
    if (!semantic.ok) {
      const fields = semantic.error ?? {};
      const detail = Object.entries(fields)
        .filter(([key]) => key !== "type")
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(" · ");
      setVerdict(
        "error",
        `<b>Gate rejects: ${escapeHtml(String(fields.type ?? "error"))}.</b> ${escapeHtml(detail)}`
      );
      return;
    }

    const occurrences = semantic.occurrences ?? [];
    const summary =
      occurrences.length === 0
        ? "no occurrences"
        : occurrences.map((o) => `${o.kind}${o.node ? ` (${o.node})` : ""}`).join(", ");
    setVerdict("ok", `<b>Build succeeds.</b> ${escapeHtml(summary)}`);
    resultEl.textContent = JSON.stringify(semantic.view, null, 2);
    renderPreview(
      semantic.view as ResolvedNode,
      collectBindings(panes.document),
      previewEl,
      {
        onInfo(reference, binding) {
          showToast(`${reference} would emit: ${binding.described.join(" · ")} (bindings in console)`);
          const resolved = semantic.bindings?.[reference] ?? binding.raw;
          console.log(
            `[milano] ${reference} event bindings (parameters resolved):\n` +
              `${JSON.stringify(resolved, null, 2)}\n[milano] as written in the document:\n` +
              `${JSON.stringify(binding.raw, null, 2)}`
          );
        },
        async onEvent(reference, eventName, payload) {
          let outcome;
          try {
            outcome = await dispatchEvent(await engine, vector, reference, eventName, payload);
          } catch {
            showToast("Semantic engine unavailable; cannot dispatch.");
            return;
          }
          if (outcome.dropped) {
            showToast(`${reference}: ${eventName} dropped (no binding)`);
            return;
          }
          if (outcome.crash) {
            showToast(`${reference}: dispatch failed (details in console)`);
            console.log(`[milano] ${reference} ${eventName} dispatch failed: ${outcome.crash}`);
            return;
          }
          console.log(
            `[milano] ${reference} emitted ${eventName}` +
              `${payload === undefined ? "" : ` (payload ${JSON.stringify(payload)})`}` +
              `\n[milano] state after built-ins: ${JSON.stringify(outcome.state)}` +
              (outcome.dispatched?.length
                ? `\n[milano] dispatched to the host: ${JSON.stringify(outcome.dispatched, null, 2)}`
                : "")
          );
          if (outcome.dispatched?.length) {
            showToast(
              `dispatched: ${outcome.dispatched.map((a) => a.action).join(", ")} (console)`
            );
          }
          stateInput.value = JSON.stringify(outcome.state, null, 2);
          void update();
        }
      }
    );
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function scheduleUpdate() {
    clearTimeout(timer);
    timer = setTimeout(() => void update(), 400);
  }

  vocabularyEditor.onDidChangeModelContent(scheduleUpdate);
  documentEditor.onDidChangeModelContent(scheduleUpdate);
  for (const input of [contextInput, stateInput]) input.addEventListener("input", scheduleUpdate);
  policyInput.addEventListener("change", scheduleUpdate);

  for (const tab of document.querySelectorAll<HTMLButtonElement>("#view-tabs button")) {
    tab.addEventListener("click", () => {
      for (const other of document.querySelectorAll("#view-tabs button")) {
        other.classList.toggle("active", other === tab);
      }
      const showPreview = tab.dataset.view === "preview";
      previewEl.hidden = !showPreview;
      resultEl.hidden = showPreview;
    });
  }

  $("share-button").addEventListener("click", async () => {
    const fragment = await encodeState({
      vocabulary: vocabularyEditor.getValue(),
      document: documentEditor.getValue(),
      context: contextInput.value,
      state: stateInput.value,
      policy: policyInput.value
    });
    const url = `${location.origin}${location.pathname}#${fragment}`;
    history.replaceState(null, "", `#${fragment}`);
    await navigator.clipboard.writeText(url);
    statusEl.textContent = "link copied";
    setTimeout(() => (statusEl.textContent = "spec: specs@main"), 2000);
  });

  await update();
}

void init();
