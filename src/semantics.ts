// Semantic checking through the actual reference implementation: the
// playground executes the specs repo's reference_check.py via Pyodide, so
// its verdicts can never drift from what CI enforces on the suite.

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<Pyodide>;
  }
}

interface Pyodide {
  runPython(code: string): unknown;
  globals: { set(name: string, value: unknown): void };
}

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const WRAPPER = `
import json

# Exec into a namespace whose __name__ is not "__main__", so the checker's
# CLI entry point stays dormant and only its classes are defined.
_ns = {"__name__": "reference_check"}
exec(checker_source, _ns)
ReferenceGate = _ns["ReferenceGate"]
GateError = _ns["GateError"]

def _store(declared, supplied):
    parse_type = _ns["parse_type"]
    validate_value = _ns["validate_value"]
    values = {}
    for name, descriptor in declared.items():
        ty = parse_type(descriptor)
        values[name] = (
            validate_value(supplied[name], ty, "binding") if name in supplied else None
        )
    return values

def _evaluate(value, evaluator):
    if isinstance(value, dict) and set(value) == {"$expr"}:
        return evaluator.eval(_ns["Parser"](_ns["tokenize"](value["$expr"])).parse())
    return value

def _resolve_bindings(vector):
    """Evaluate action-parameter expressions over context/state, the way
    dispatch would. Expressions over the event payload stay symbolic: there
    is no payload until a real event fires."""
    document = vector.get("document")
    if not isinstance(document, dict):
        return {}
    Evaluator = _ns["Evaluator"]

    context = _store(document.get("context", {}), vector.get("context", {}))
    state = _store(document.get("state", {}), vector.get("state", {}))
    evaluator = Evaluator(state, context, lambda kind: None)

    def resolve(value):
        if isinstance(value, dict) and set(value) == {"$expr"}:
            try:
                return _evaluate(value, evaluator)
            except Exception:
                return {"$expr": value["$expr"], "resolvedAt": "dispatch (event payload)"}
        if isinstance(value, dict):
            return {key: resolve(item) for key, item in value.items()}
        if isinstance(value, list):
            return [resolve(item) for item in value]
        return value

    bindings = {}

    def walk(node, path):
        reference = node.get("id") or path
        if isinstance(node.get("on"), dict) and node["on"]:
            bindings[reference] = resolve(node["on"])
        for index, child in enumerate(node.get("children", [])):
            walk(child, f"{path}/children[{index}]")

    walk(document.get("root", {}), "root")
    return bindings

def _run_actions(actions, evaluator, state, dispatched):
    """Build-time dispatch of the built-in actions per the state-and-actions
    spec's synchronous core: $set assigns whole keys, $sequence runs in
    order, $when branches on its condition. Custom actions are reported as
    data, never executed; completions and their follow-ups are runtime
    territory the playground does not simulate."""
    if isinstance(actions, dict):
        actions = [actions]
    for action in actions:
        name = action.get("action")
        if name == "$set":
            state[action["key"]] = _evaluate(action.get("value"), evaluator)
        elif name == "$sequence":
            _run_actions(action.get("actions", []), evaluator, state, dispatched)
        elif name == "$when":
            branch = "then" if _evaluate(action.get("condition"), evaluator) else "else"
            _run_actions(action.get(branch, []), evaluator, state, dispatched)
        else:
            parameters = {
                key: _evaluate(item, evaluator)
                for key, item in action.items()
                if key not in ("action", "onSuccess", "onFailure")
            }
            dispatched.append({"action": name, "parameters": parameters})

def dispatch_event(payload_json):
    data = json.loads(payload_json)
    vector = data["vector"]
    document = vector.get("document") or {}
    target = data["reference"]

    found = []

    def walk(node, path):
        reference = node.get("id") or path
        if reference == target and isinstance(node.get("on"), dict):
            found.append(node["on"])
        for index, child in enumerate(node.get("children", [])):
            walk(child, f"{path}/children[{index}]")

    walk(document.get("root", {}), "root")
    if not found or data["event"] not in found[0]:
        return json.dumps({"dropped": True})

    context = _store(document.get("context", {}), vector.get("context", {}))
    state = _store(document.get("state", {}), vector.get("state", {}))

    # The checker's evaluator only sees property expressions, where a bare
    # root is never valid; in bindings, a bare "event" is the scalar payload.
    class _DispatchEvaluator(_ns["Evaluator"]):
        def eval(self, node):
            if node[0] == "ref" and node[1] == "event" and "event" in self.roots:
                return self.roots["event"]
            return super().eval(node)

    evaluator = _DispatchEvaluator(
        state, context, lambda kind: None, event=data.get("payload")
    )
    dispatched = []
    try:
        _run_actions(found[0][data["event"]], evaluator, state, dispatched)
    except Exception as error:
        return json.dumps({"crash": f"{type(error).__name__}: {error}"})
    return json.dumps({"state": state, "dispatched": dispatched})

def run_playground(payload_json):
    data = json.loads(payload_json)
    vector = data["vector"]
    config = vector.get("config", {})
    policy = config.get("unknownTypePolicy", "fail")
    gate = ReferenceGate(data["vocabulary"], policy, config.get("actions"))
    try:
        resolved, state = gate.build(vector)
        return json.dumps({
            "ok": True,
            "view": resolved,
            "state": state,
            "occurrences": gate.occurrences,
            "bindings": _resolve_bindings(vector),
        })
    except GateError as error:
        return json.dumps({"ok": False, "error": error.fields})
    except Exception as error:  # a checker crash is a playground bug
        return json.dumps({"ok": False, "crash": f"{type(error).__name__}: {error}"})
`;

let instance: Promise<Pyodide> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function startEngine(referenceCheckerSource: string): Promise<Pyodide> {
  if (!instance) {
    instance = (async () => {
      await loadScript(`${PYODIDE_URL}pyodide.js`);
      const pyodide = await window.loadPyodide!({ indexURL: PYODIDE_URL });
      pyodide.globals.set("checker_source", referenceCheckerSource);
      pyodide.runPython(WRAPPER);
      return pyodide;
    })();
  }
  return instance;
}

export interface SemanticResult {
  ok: boolean;
  view?: unknown;
  state?: unknown;
  occurrences?: Array<{ kind: string; node?: string }>;
  bindings?: Record<string, unknown>;
  error?: Record<string, unknown>;
  crash?: string;
}

export async function checkSemantics(
  pyodide: Pyodide,
  vocabulary: unknown,
  vector: unknown
): Promise<SemanticResult> {
  pyodide.globals.set("payload_json", JSON.stringify({ vocabulary, vector }));
  const raw = pyodide.runPython("run_playground(payload_json)") as string;
  return JSON.parse(raw);
}

export interface DispatchResult {
  state?: Record<string, unknown>;
  dispatched?: Array<{ action: string; parameters: Record<string, unknown> }>;
  dropped?: boolean;
  crash?: string;
}

export async function dispatchEvent(
  pyodide: Pyodide,
  vector: unknown,
  reference: string,
  event: string,
  payload: unknown
): Promise<DispatchResult> {
  pyodide.globals.set(
    "dispatch_json",
    JSON.stringify({ vector, reference, event, payload })
  );
  const raw = pyodide.runPython("dispatch_event(dispatch_json)") as string;
  return JSON.parse(raw);
}
