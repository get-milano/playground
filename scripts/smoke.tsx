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
    action: { name: "openUrl", parameters: {}, viewIdentity: "playground" },
    resultType: "string",
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
