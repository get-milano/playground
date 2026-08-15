# Milano Playground

An in-browser authoring tool for [Milano](https://github.com/get-milano/sdk) vocabularies and documents, hosted at [get-milano.github.io/playground](https://get-milano.github.io/playground/).

- **Live validation** against the official schemas from [get-milano/specs](https://github.com/get-milano/specs), fetched at runtime so the playground always matches current `main`.
- **Semantic verdicts** from the specs repo's reference checker (`tools/reference_check.py`), executed in the browser via Pyodide: gate errors with their typed detail, or the resolved tree with evaluated expressions and reported occurrences.
- **Vocabulary-aware autocomplete**: the document editor derives a schema from the vocabulary pane live, completing your own component types, properties, and events.
- **Non-normative preview**: the resolved tree rendered with a tiny web design system, exactly the way a real consumer bridges Milano to its own components. Sample-vocabulary types render as interactive controls: events dispatch the document's built-in actions through the reference evaluator and the build re-runs, while custom actions are reported to the console as host-bound data. Unknown types render as wireframe boxes, placeholders as hatched boxes.
- **Shareable links**: the entire playground state is compressed into the URL fragment. No backend, nothing stored.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check + production build into dist/
```

Deployment is automatic: pushes to `main` build and publish to GitHub Pages via `.github/workflows/deploy.yml` (repository Pages setting must be "GitHub Actions").

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
