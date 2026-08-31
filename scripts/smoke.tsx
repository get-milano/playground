// Renders every bundled example the way the browser does: build a real
// view with the engine, materialise it through the Material renderers,
// and check something came out. Catches the failures a typecheck cannot,
// which is most of them.
//
//   npm run smoke
import { MilanoRenderedView } from "@get-milano/react";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { build, type PendingAction } from "../src/engine";
import { EXAMPLES } from "../src/samples";
import { expressionSuggestions } from "../src/suggest";
import { hoverInfo } from "../src/hover";
import { locateReference } from "../src/locate";
import { generateKotlin, generateSwift, generateTs, defaultPrefix } from "@milano-cli-bindings";
import { parseContextValues } from "../src/engine";

async function main(): Promise<void> {
  let failures = 0;

  for (const example of EXAMPLES) {
    const outcome = await build(
      {
        vocabulary: example.vocabulary,
        document: example.document,
        context: example.context,
        state: example.state,
        actions: example.actions,
        policy: "fail",
      },
      { onOccurrence: () => {}, onInteraction: () => {}, onAction: () => {} },
    );

    if (!outcome.ok) {
      failures += 1;
      console.error(`FAIL ${example.key}: ${outcome.failure.headline} · ${outcome.failure.detail}`);
      continue;
    }

    try {
      const html = renderToStaticMarkup(
        createElement(MilanoRenderedView, { view: outcome.view, registry: outcome.registry }),
      );
      if (html.trim().length === 0) {
        failures += 1;
        console.error(`FAIL ${example.key}: rendered nothing`);
        continue;
      }
      if (!html.includes("data-milano-ref=")) {
        failures += 1;
        console.error(`FAIL ${example.key}: rendered without inspectable node references`);
        continue;
      }
      const material = (html.match(/Mui[A-Za-z]+-root/g) ?? []).length;
      console.log(`ok   ${example.key}: ${html.length} bytes, ${material} Material elements`);
      if (process.env["SMOKE_DUMP"] !== undefined) console.log(html.slice(0, 400));
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${example.key}: render threw ${String(error)}`);
    } finally {
      outcome.view.teardown();
    }
  }

  failures += suggestionCheck();
  failures += locatorCheck();
  failures += hoverCheck();
  failures += bindingsCheck();
  failures += await contextUpdateCheck();

  // Server rendering never mounts, so it cannot see what breaks on mount:
  // transitions, effects, refs. This mounts the interactive pieces in a
  // DOM, which is where a Snackbar dereferencing a null ref shows up.
  failures += await mountCheck();

  if (failures > 0) {
    console.error(`${failures} example(s) failed`);
    process.exit(1);
  }
  console.log(`${EXAMPLES.length} examples built and rendered, and mounted in a DOM`);
}

/**
 * The editor's expression completion: it must fire inside a `$expr`
 * string and nowhere else, and it must know the vocabulary's own
 * functions, not only the contract's.
 */
function suggestionCheck(): number {
  const example = EXAMPLES.find((entry) => entry.key === "shopping-list");
  if (example === undefined) {
    console.error("FAIL suggest: the shopping-list example is missing");
    return 1;
  }
  const problems: string[] = [];

  const outside = expressionSuggestions('  "label": "Add', example.document, example.vocabulary);
  if (outside !== null) problems.push("offered suggestions outside an expression");

  const inside = expressionSuggestions(
    '  "text": { "$expr": "$con',
    example.document,
    example.vocabulary,
  );
  if (inside === null) {
    problems.push("offered nothing inside an expression");
  } else {
    if (inside.typed !== "$con") problems.push(`replaced ${inside.typed} instead of $con`);
    const labels = inside.suggestions.map((suggestion) => suggestion.label);
    for (const wanted of ["$concat", "$round", "formatMoney", "plural", "state.items", "event"]) {
      if (!labels.includes(wanted)) problems.push(`did not offer ${wanted}`);
    }
    // A host function the vocabulary declares comes before the contract's.
    if (labels.indexOf("formatMoney") > labels.indexOf("$concat")) {
      problems.push("ordered the contract's functions before the vocabulary's");
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL suggest: ${problem}`);
    return problems.length;
  }
  console.log("ok   suggest: completion fires inside expressions, with the vocabulary's functions");
  return 0;
}

/**
 * The reference locator behind error markers and "show in document":
 * id references, instance identities, and every branch a path can take.
 * Wrong positions would be worse than none, so the expected text is
 * asserted, not just non-nullness.
 */
function locatorCheck(): number {
  const doc = (key: string): string =>
    (EXAMPLES.find((entry) => entry.key === key) as (typeof EXAMPLES)[number]).document;
  const cases: readonly [string, string, string | null][] = [
    ["consent-banner", "consent", '"consent"'],
    ["repeat-list", "rows[2]", '"rows"'],
    ["repeat-list", "rows[abc]", '"rows"'],
    ["conditional-branch", "root/children[1]/then[0]", '"Text"'],
    ["conditional-branch", "root/children[1]/else[0]", '"Text"'],
    ["switch-branch", "root/children[0]/cases[late][0]", '"Badge"'],
    ["switch-branch", "root/children[0]/default[0]", '"Badge"'],
    ["switch-branch", "root/children[0]", '"$switch"'],
    ["switch-branch", "root", '"Column"'],
    ["switch-branch", "root/children[9]", null],
    ["consent-banner", "nonexistent-id", null],
  ];
  const problems: string[] = [];
  for (const [key, reference, expected] of cases) {
    const text = doc(key);
    const range = locateReference(text, reference);
    const found = range === null ? null : text.slice(range.start, range.end);
    if (found !== expected) {
      problems.push(`${key} ${reference}: located ${found ?? "null"}, wanted ${expected ?? "null"}`);
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL locate: ${problem}`);
    return problems.length;
  }
  console.log(`ok   locate: ${cases.length} reference forms land on the node they name`);
  return 0;
}

/** The editor hover: functions, host functions, and component cards. */
function hoverCheck(): number {
  const shopping = EXAMPLES.find((entry) => entry.key === "shopping-list") as (typeof EXAMPLES)[number];
  const branching = EXAMPLES.find((entry) => entry.key === "switch-branch") as (typeof EXAMPLES)[number];
  const problems: string[] = [];

  const fn = hoverInfo('    "text": {"$expr": "$substring(state.card, 0, 4)"}', 32, shopping.vocabulary);
  if (fn === null || !fn.text.includes("clamped")) problems.push("no signature for $substring");

  const host = hoverInfo('  "$expr": "formatMoney(item.price)"', 15, shopping.vocabulary);
  if (host === null || !host.text.includes("host function")) problems.push("no card for formatMoney");

  const line = '        "type": "Badge",';
  const component = hoverInfo(line, line.indexOf("Badge") + 2, branching.vocabulary);
  if (component === null || !component.text.includes("enum(info | success | warning | danger)?")) {
    problems.push("no component card for Badge");
  }

  if (hoverInfo('  "text": "plain words"', 12, shopping.vocabulary) !== null) {
    problems.push("offered a hover for a plain word");
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL hover: ${problem}`);
    return problems.length;
  }
  console.log("ok   hover: functions, host functions, and components answer");
  return 0;
}

/** The CLI's bindings generator, run the way the Bindings tab runs it. */
function bindingsCheck(): number {
  const example = EXAMPLES.find((entry) => entry.key === "shopping-list") as (typeof EXAMPLES)[number];
  const vocabulary = JSON.parse(example.vocabulary) as Record<string, unknown>;
  const problems: string[] = [];
  try {
    const swift = generateSwift(vocabulary, defaultPrefix(vocabulary));
    if (!swift.includes("struct") && !swift.includes("enum")) problems.push("Swift output has no types");
    const kotlin = generateKotlin(vocabulary, "dev.getmilano.playground", "");
    if (!kotlin.includes("package dev.getmilano.playground")) problems.push("Kotlin output misses its package");
    const ts = generateTs(vocabulary, defaultPrefix(vocabulary), "@get-milano/core");
    if (!ts.includes("export") || !ts.includes("@get-milano/core")) problems.push("TypeScript output incomplete");
  } catch (error) {
    problems.push(`generator threw: ${String(error)}`);
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL bindings: ${problem}`);
    return problems.length;
  }
  console.log("ok   bindings: Swift, Kotlin, and TypeScript generate from the vocabulary");
  return 0;
}

/**
 * The live context handle: an accepted update re-resolves the view, a
 * mismatched one is rejected whole and reported, values untouched.
 */
async function contextUpdateCheck(): Promise<number> {
  const example = EXAMPLES.find((entry) => entry.key === "consent-banner") as (typeof EXAMPLES)[number];
  const occurrences: string[] = [];
  const outcome = await build(
    {
      vocabulary: example.vocabulary,
      document: example.document,
      context: example.context,
      state: example.state,
      actions: example.actions,
      policy: "fail",
    },
    { onOccurrence: (o) => occurrences.push(o.kind), onInteraction: () => {}, onAction: () => {} },
  );
  if (!outcome.ok) {
    console.error("FAIL context: the example did not build");
    return 1;
  }
  const problems: string[] = [];
  try {
    outcome.context.update(parseContextValues('{"userName": "Grace"}'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    const markup = renderToStaticMarkup(
      createElement(MilanoRenderedView, { view: outcome.view, registry: outcome.registry }),
    );
    if (!markup.includes("Hello, Grace")) problems.push("accepted update did not re-resolve the greeting");

    outcome.context.update(parseContextValues('{"userName": 42}'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (!occurrences.includes("rejectedContextUpdate")) {
      problems.push("mismatched update was not reported as rejected");
    }
    const after = renderToStaticMarkup(
      createElement(MilanoRenderedView, { view: outcome.view, registry: outcome.registry }),
    );
    if (!after.includes("Hello, Grace")) problems.push("rejected update changed the view");
  } finally {
    outcome.view.teardown();
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL context: ${problem}`);
    return problems.length;
  }
  console.log("ok   context: live update re-resolves, a mismatch is rejected and reported");
  return 0;
}

async function mountCheck(): Promise<number> {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { pretendToBeVisual: true });
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["window"] = dom.window;
  globals["document"] = dom.window.document;
  globals["IS_REACT_ACT_ENVIRONMENT"] = true;
  // Node 24 defines navigator as a getter, so it is replaced rather than
  // assigned; everything else can be set directly.
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });

  // Imported after the DOM exists: MUI reads it at module scope.
  const { ActionSnackbar } = await import("../src/ActionSnackbar");
  const example = EXAMPLES[0] as (typeof EXAMPLES)[number];
  const outcome = await build(
    {
      vocabulary: example.vocabulary,
      document: example.document,
      context: example.context,
      state: example.state,
      actions: example.actions,
      policy: "fail",
    },
    { onOccurrence: () => {}, onInteraction: () => {}, onAction: () => {} },
  );
  if (!outcome.ok) {
    console.error(`FAIL mount: the example did not build`);
    return 1;
  }

  const pending: PendingAction = {
    id: 1,
    action: {
      name: "openUrl",
      parameters: {},
      viewIdentity: "playground",
      dispatch: 0,
      dispatchId: "smoke#0",
    },
    resultType: "string",
    failureType: null,
    failureMembers: null,
    settle: () => {},
  };

  const root = createRoot(dom.window.document.getElementById("root") as unknown as Element);
  try {
    await act(async () => {
      root.render(
        createElement("div", null, [
          createElement(MilanoRenderedView, {
            key: "view",
            view: outcome.view,
            registry: outcome.registry,
          }),
          createElement(ActionSnackbar, { key: "snack", queue: [pending], settle: () => {} }),
        ]),
      );
    });
    const html = dom.window.document.body.innerHTML;
    if (!html.includes("openUrl")) {
      console.error("FAIL mount: the dispatched action never reached the DOM");
      return 1;
    }
    console.log("ok   mount: view and dispatched-action snackbar mounted");
    return 0;
  } catch (error) {
    console.error(`FAIL mount: ${String(error)}`);
    return 1;
  } finally {
    await act(async () => root.unmount());
    outcome.view.teardown();
  }
}

void main();
