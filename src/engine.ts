// The playground's Milano setup. Everything here is the published engine
// doing its real job: no simulation, no second implementation. What the
// verdict says is what a host app would get, because it is the same code
// a host app installs from npm.
import {
  MilanoBuildError,
  MilanoEngine,
  MilanoEngineError,
  MilanoInfo,
  MilanoType,
  MilanoValue,
  MilanoVocabulary,
  parseJson,
  synthesizedState,
} from "@get-milano/core";
import type {
  MilanoAction,
  MilanoOccurrence,
  MilanoUnknownTypePolicy,
  MilanoUserInteraction,
  MilanoView,
} from "@get-milano/core";
import type { MilanoReactBuilder, MilanoReactRegistry } from "@get-milano/react";

import { registryFor, type ComponentShape } from "./renderers";

export const ENGINE_VERSION = MilanoInfo.version;

/** A custom action the document dispatched, waiting for the playground. */
export interface PendingAction {
  readonly id: number;
  readonly action: MilanoAction;
  /** The declared result type, so the UI knows what a success needs. */
  readonly resultType: string | null;
  readonly settle: (outcome: "success" | "failure", value: string) => void;
}

export interface BuildInputs {
  readonly vocabulary: string;
  readonly document: string;
  readonly context: string;
  readonly state: string;
  readonly actions: string;
  readonly policy: string;
}

export interface Streams {
  readonly onOccurrence: (occurrence: MilanoOccurrence) => void;
  readonly onInteraction: (interaction: MilanoUserInteraction) => void;
  readonly onAction: (pending: PendingAction) => void;
}

/** What went wrong, in the words the host would see. */
export interface Failure {
  readonly headline: string;
  readonly detail: string;
}

export type BuildOutcome =
  | { readonly ok: true; readonly view: MilanoView; readonly registry: MilanoReactRegistry }
  | { readonly ok: false; readonly failure: Failure };

function parseRecord(label: string, text: string): Record<string, MilanoValue> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return {};
  // The engine's own reader, not JSON.parse: `20.0` has to stay a double,
  // and a playground that quietly retyped values would lie about the gate.
  const parsed = parseJson(trimmed);
  const record = parsed.recordValue;
  if (record === null) throw new Error(`${label} must be a JSON object`);
  return { ...record };
}

/** The component shapes the registry needs, read off the vocabulary. */
function shapes(vocabulary: MilanoVocabulary): Record<string, ComponentShape> {
  const components: Record<string, ComponentShape> = {};
  for (const [type, component] of Object.entries(vocabulary.components)) {
    components[type] = {
      properties: Object.keys(component.properties),
      events: Object.keys(component.events),
    };
  }
  return components;
}

/**
 * Grants from the actions pane: `{"allow": [...], "declare": {...}}`.
 * Returns the result types it declared, which override the vocabulary's.
 */
function applyGrants(
  builder: MilanoReactBuilder,
  text: string,
): Record<string, MilanoType | null> {
  const declared: Record<string, MilanoType | null> = {};
  const trimmed = text.trim();
  if (trimmed.length === 0) return declared;
  const grants = parseJson(trimmed).recordValue;
  if (grants === null) throw new Error("builder action grants must be a JSON object");

  const allow = grants["allow"]?.arrayValue;
  if (allow !== undefined && allow !== null) {
    builder.allowActions(allow.map((name) => name.stringValue ?? ""));
  }

  const declare = grants["declare"]?.recordValue;
  if (declare !== undefined && declare !== null) {
    for (const [name, declaration] of Object.entries(declare)) {
      const fields = declaration.recordValue ?? {};
      const parameters: Record<string, MilanoType> = {};
      for (const [parameter, descriptor] of Object.entries(fields["parameters"]?.recordValue ?? {})) {
        const type = MilanoType.fromDescriptor(descriptor);
        if (type === null) throw new Error(`${name}.${parameter}: undecodable type descriptor`);
        parameters[parameter] = type;
      }
      const resultDescriptor = fields["result"];
      const result =
        resultDescriptor === undefined ? null : MilanoType.fromDescriptor(resultDescriptor);
      builder.action(name, { parameters, ...(result === null ? {} : { result }) });
      declared[name] = result;
    }
  }
  return declared;
}

function describe(error: unknown): Failure {
  if (error instanceof MilanoEngineError) {
    return {
      headline: `Vocabulary rejected: ${error.type}`,
      detail: [error.rule, error.detail, error.missing?.join(", ")]
        .filter((part) => part !== null && part !== undefined && part !== "")
        .join(" · "),
    };
  }
  if (error instanceof MilanoBuildError) {
    const parts: string[] = [];
    if (error.rule !== null) parts.push(`rule: ${error.rule}`);
    if (error.node !== null) parts.push(`node: ${error.node}`);
    if (error.expected !== null) parts.push(`expected: ${error.expected}`);
    if (error.found !== null) parts.push(`found: ${error.found}`);
    if (error.unknownType !== null) parts.push(`type: ${error.unknownType}`);
    if (error.limit !== null) parts.push(`limit: ${error.limit} (${error.value})`);
    if (error.actual !== null) parts.push(`actual: ${error.actual}`);
    if (error.declared !== null) parts.push(`declared: ${error.declared}`);
    if (error.detail !== null) parts.push(error.detail);
    return { headline: `Gate rejects: ${error.type}`, detail: parts.join(" · ") };
  }
  return { headline: "Could not build", detail: String(error) };
}

/**
 * Builds a view from the panes. The failure path is deliberately the same
 * one a host has: a typed error carrying the rule it broke, not a message
 * the playground invented.
 */
export async function build(inputs: BuildInputs, streams: Streams): Promise<BuildOutcome> {
  let nextActionId = 1;
  try {
    const vocabulary = MilanoVocabulary.parse(inputs.vocabulary);
    const engine = new MilanoEngine({
      vocabularyJson: inputs.vocabulary,
      registry: registryFor(shapes(vocabulary)),
      defaultUnknownTypePolicy: inputs.policy as MilanoUnknownTypePolicy,
      observer: { occurrence: streams.onOccurrence },
      userInteractionObserver: { interaction: streams.onInteraction },
    });

    const builder = engine
      .viewBuilder(inputs.document)
      .label("playground")
      .context(parseRecord("context values", inputs.context));

    const grantedResults = applyGrants(builder, inputs.actions);
    const resultTypeOf = (name: string): MilanoType | null =>
      name in grantedResults ? grantedResults[name] ?? null : (vocabulary.actions[name]?.result ?? null);

    const supplied = parseRecord("state values", inputs.state);
    builder.stateData((declarations) => synthesizedState(declarations, supplied));

    // Custom actions are handed to the UI and left pending: the author
    // decides the outcome, which is how onSuccess and onFailure become
    // explorable instead of theoretical.
    builder.actionHandler(
      (action) =>
        new Promise<MilanoValue | null>((resolve, reject) => {
          const resultType = resultTypeOf(action.name);
          streams.onAction({
            id: nextActionId++,
            action,
            resultType: resultType?.name ?? null,
            settle(outcome, value) {
              if (outcome === "failure") {
                reject(new Error(value.trim().length === 0 ? "rejected in the playground" : value));
                return;
              }
              if (resultType === null || value.trim().length === 0) {
                resolve(null);
                return;
              }
              try {
                resolve(parseJson(value.trim()));
              } catch {
                resolve(MilanoValue.string(value));
              }
            },
          });
        }),
    );

    return { ok: true, view: await builder.build(), registry: engine.registry };
  } catch (error) {
    return { ok: false, failure: describe(error) };
  }
}
