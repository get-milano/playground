# Milano Playground

An in-browser authoring tool for [Milano](https://github.com/get-milano/sdk) vocabularies and documents, hosted at [get-milano.dev/playground](https://get-milano.dev/playground/).

It runs the **published engine**, not a simulation: `@get-milano/core` and `@get-milano/react` straight from npm, the same packages an app installs. Whatever the playground says about a document is what a host would get, because it is the same code. That also makes this a working example of the React integration, roughly 700 lines of it.

- **A real build.** The engine parses the vocabulary and the document, validates context and state, type-checks every expression, and either produces a view or throws the typed error a host would catch, with its rule, node, and expected/found detail. Occurrences a valid document reports (a dropped event, a rejected update, a value past the size limit) show the same detail: what they are about, and what was expected against what was found.
- **A running view, not a picture.** Clicks emit declared events, `$set` mutates state, `$when` branches, and the tree re-resolves live. The state and context inspector updates as you interact.
- **Custom actions you can settle.** A dispatched action waits in the preview with its captured parameters; succeed it (typing a `result` where one is declared) or fail it, and watch the document's `onSuccess` or `onFailure` run.
- **Both engine streams, side by side.** Occurrences (dropped events, undeclared properties, saturation, division by zero) and the user-interaction analytics stream (impressions, taps, dispatches, outcomes), each in its own tab.
- **Material UI as the design system.** Every pixel in the preview belongs to MUI, wired to Milano by a renderer per component type in `src/renderers.tsx`. Components the playground has no Material mapping for get a generic renderer that shows the resolved values and a button per declared event, so any vocabulary is explorable.
- **Vocabulary-aware autocomplete**: the document editor derives a schema from the vocabulary pane live, completing your own component types, properties, and events. Inside `$expr` strings, where JSON schemas stop, it completes expressions too: the contract's `$` functions, the host functions your vocabulary declares (offered first, since those are the ones nobody can guess), and the state and context keys your document declares. Editor assistance only, fetched best-effort from [get-milano/specs](https://github.com/get-milano/specs); the engine is what decides validity.
- **Builder action grants**: an input models the surface's capability set, with an allowlist over the vocabulary's actions and per-surface declarations and signature overrides; ungranted or mis-parameterized bindings fail with the gate's typed errors.
- **Host functions, answered.** A vocabulary may declare functions the app computes; the playground's engine answers `formatMoney` (in the browser's locale), `formatPercent`, `upper`, `lower`, and `plural`, and any other declared name with `null`, which the engine reports as an invalid function result and replaces with the return type's zero value, so the mechanism is visible either way.
- **Edits replace, they do not rebuild.** When only the document pane changes under a live view, the playground calls `view.replace()`: state whose declaration is unchanged survives the edit, exactly as a host refreshing a document keeps what the user typed; a replacement the gate refuses leaves the view as it was and shows why.
- **Bundled examples**: a consent banner, a form with a typed completion result and a failure payload, a guardrails tour that fills the Occurrences tab, a keyed list repeated from state with `$repeat`, a lifecycle-and-numeric-functions calculator, and a shopping list edited in place with the array actions and a `watch`; pick one from the top bar and every pane follows.
- **Shareable links**: the entire playground state is compressed into the URL fragment. No backend, nothing stored.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check + production build into dist/
npm run smoke    # build and render every bundled example through the engine, in Node
```

`npm run smoke` is the test that matters: it server-renders each example with the real engine and the real renderers, so a broken renderer or a document that no longer builds fails without a browser.

Deployment is automatic: pushes to `main` build and publish to GitHub Pages via `.github/workflows/deploy.yml` (repository Pages setting must be "GitHub Actions").

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
