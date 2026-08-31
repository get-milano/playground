// The playground's Milano setup. Everything here is the published engine
// doing its real job: no simulation, no second implementation. What the
// verdict says is what a host app would get, because it is the same code
// a host app installs from npm.
import {
  MilanoActionFailure,
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
  MilanoFunctionCall,
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
  /** The declared failure type, so the UI knows what a failure may carry. */
  readonly failureType: string | null;
  /** The members, when the declared failure type is an enum: the UI can
   *  offer them as one-tap failures, keeping free text for the
   *  invalid-completion lesson. */
  readonly failureMembers: readonly string[] | null;
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
  /** The gate's node reference, when the error names one: the UI points
   *  the editor at it rather than leaving the author to search. */
  readonly node: string | null;
}

/**
 * The playground's host functions: what its engine answers when a
 * vocabulary declares one of these names with a compatible signature. A
 * real app writes its own handler; here a small library stands in, and a
 * declared function it does not know answers null, which the engine
 * reports as an invalid function result in the Occurrences tab (the zero
 * value of the declared return then shows in the view).
 */
export const HOST_FUNCTIONS: Readonly<Record<string, string>> = {
  formatMoney: "formatMoney(amount: double | int, currency: string) -> string, in the browser's locale",
  formatPercent: "formatPercent(fraction: double) -> string, one decimal",
  upper: "upper(text: string) -> string",
  lower: "lower(text: string) -> string",
  plural: "plural(count: int, singular: string, plural: string) -> string",
};

export function hostFunction(call: MilanoFunctionCall): MilanoValue | null {
  const [first, second, third] = call.arguments;
  switch (call.name) {
    case "formatMoney": {
      const amount = first?.numberValue ?? 0;
      const currency = second?.stringValue ?? "EUR";
      try {
        return MilanoValue.string(new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount));
      } catch {
        return MilanoValue.string(`${amount.toFixed(2)} ${currency}`);
      }
    }
    case "formatPercent":
      return MilanoValue.string(`${((first?.numberValue ?? 0) * 100).toFixed(1)}%`);
    case "upper":
      return MilanoValue.string((first?.stringValue ?? "").toUpperCase());
    case "lower":
      return MilanoValue.string((first?.stringValue ?? "").toLowerCase());
    case "plural":
      return MilanoValue.string(
        Number(first?.intValue ?? 0n) === 1 ? (second?.stringValue ?? "") : (third?.stringValue ?? ""),
      );
    default:
      return null;
  }
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

/** The completion types an action declares: what a success or a failure carries. */
interface Outcomes {
  readonly result: MilanoType | null;
  readonly failure: MilanoType | null;
}

/**
 * Grants from the actions pane: `{"allow": [...], "declare": {...}}`.
 * Returns the outcome types it declared, which override the vocabulary's.
 */
function applyGrants(builder: MilanoReactBuilder, text: string): Record<string, Outcomes> {
  const declared: Record<string, Outcomes> = {};
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
      const failureDescriptor = fields["failure"];
      const failure =
        failureDescriptor === undefined ? null : MilanoType.fromDescriptor(failureDescriptor);
      builder.action(name, {
        parameters,
        ...(result === null ? {} : { result }),
        ...(failure === null ? {} : { failure }),
      });
      declared[name] = { result, failure };
    }
  }
  return declared;
}

/** The value the author typed, as JSON when it parses and as a string otherwise. */
function readValue(entered: string): MilanoValue {
  try {
    return parseJson(entered);
  } catch {
    return MilanoValue.string(entered);
  }
}

export function describe(error: unknown): Failure {
  if (error instanceof MilanoEngineError) {
    return {
      headline: `Vocabulary rejected: ${error.type}`,
      detail: [error.rule, error.detail, error.missing?.join(", ")]
        .filter((part) => part !== null && part !== undefined && part !== "")
        .join(" · "),
      node: null,
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
    return { headline: `Gate rejects: ${error.type}`, detail: parts.join(" · "), node: error.node };
  }
  return { headline: "Could not build", detail: String(error), node: null };
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
      functionHandler: hostFunction,
    });

    const builder = engine
      .viewBuilder(inputs.document)
      .label("playground")
      .context(parseRecord("context values", inputs.context));

    const granted = applyGrants(builder, inputs.actions);
    const outcomesOf = (name: string): Outcomes =>
      granted[name] ?? {
        result: vocabulary.actions[name]?.result ?? null,
        failure: vocabulary.actions[name]?.failure ?? null,
      };

    const supplied = parseRecord("state values", inputs.state);
    builder.stateData((declarations) => synthesizedState(declarations, supplied));

    // Custom actions are handed to the UI and left pending: the author
    // decides the outcome, which is how onSuccess and onFailure become
    // explorable instead of theoretical. The typed value the author enters
    // travels the way a host's would: a result as the return value, a
    // failure payload inside a MilanoActionFailure, and the engine's own
    // completion check decides whether either fits the declaration.
    builder.actionHandler(
      (action) =>
        new Promise<MilanoValue | null>((resolve, reject) => {
          const outcomes = outcomesOf(action.name);
          streams.onAction({
            id: nextActionId++,
            action,
            resultType: outcomes.result?.name ?? null,
            failureType: outcomes.failure?.name ?? null,
            failureMembers:
              outcomes.failure !== null && outcomes.failure.kind.kind === "enum"
                ? [...outcomes.failure.kind.members].sort()
                : null,
            settle(outcome, value) {
              const entered = value.trim();
              if (outcome === "failure") {
                if (outcomes.failure === null || entered.length === 0) {
                  reject(new Error("rejected in the playground"));
                  return;
                }
                reject(new MilanoActionFailure(readValue(entered)));
                return;
              }
              if (outcomes.result === null || entered.length === 0) {
                resolve(null);
                return;
              }
              resolve(readValue(entered));
            },
          });
        }),
    );

    return { ok: true, view: await builder.build(), registry: engine.registry };
  } catch (error) {
    return { ok: false, failure: describe(error) };
  }
}
