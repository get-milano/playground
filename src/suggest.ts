// What to offer inside a `$expr` string: the contract's `$` functions, the
// host functions the vocabulary declares, and the roots the document
// declares. Pure, so it can be tested without an editor; the Monaco glue
// lives in expressions.ts.

/** One offer, in the terms an editor needs to render and insert it. */
export interface Suggestion {
  readonly label: string;
  /** The text to insert, with `${n:name}` placeholders where an editor supports them. */
  readonly insert: string;
  readonly detail: string;
  readonly kind: "function" | "hostFunction" | "key" | "root";
}

/** The contract's own functions, with the signature each one reads as. */
export const BUILT_INS: readonly Suggestion[] = [
  ["$str", "$str(${1:value})", "scalar to string"],
  ["$int", "$int(${1:double})", "double to int, truncating"],
  ["$double", "$double(${1:int})", "int to double"],
  ["$concat", "$concat(${1:a}, ${2:b})", "two or more strings to one"],
  ["$length", "$length(${1:value})", "string or array to int"],
  ["$isEmpty", "$isEmpty(${1:value})", "string or array to bool"],
  ["$contains", "$contains(${1:text}, ${2:part})", "string, string to bool"],
  ["$startsWith", "$startsWith(${1:text}, ${2:prefix})", "string, string to bool"],
  ["$endsWith", "$endsWith(${1:text}, ${2:suffix})", "string, string to bool"],
  ["$trim", "$trim(${1:text})", "trims Unicode whitespace at both ends"],
  ["$if", "$if(${1:condition}, ${2:then}, ${3:otherwise})", "both branches share one type"],
  ["$abs", "$abs(${1:number})", "magnitude, keeping int or double"],
  ["$min", "$min(${1:a}, ${2:b})", "two or more numbers"],
  ["$max", "$max(${1:a}, ${2:b})", "two or more numbers"],
  ["$floor", "$floor(${1:double})", "double to double, downwards"],
  ["$ceil", "$ceil(${1:double})", "double to double, upwards"],
  ["$round", "$round(${1:double})", "double to double, ties away from zero"],
  ["$substring", "$substring(${1:text}, ${2:from}, ${3:to})", "the scalars between two clamped indices"],
  ["$indexOf", "$indexOf(${1:text}, ${2:needle})", "the first scalar index, or -1"],
  ["$replace", "$replace(${1:text}, ${2:needle}, ${3:replacement})", "every occurrence"],
  ["$split", "$split(${1:text}, ${2:separator})", "string to array of string"],
  ["$join", "$join(${1:array}, ${2:separator})", "array of string to string"],
].map(([label, insert, detail]) => ({
  label: label as string,
  insert: insert as string,
  detail: detail as string,
  kind: "function" as const,
}));

/** The scoped roots, which the gate admits only where they bind. */
const ROOTS: readonly Suggestion[] = [
  ["event", "the event's payload, inside a node's bindings"],
  ["result", "the handler's value, inside onSuccess"],
  ["failure", "the handler's reason, inside onFailure"],
].map(([label, detail]) => ({
  label: label as string,
  insert: label as string,
  detail: detail as string,
  kind: "root" as const,
}));

/** An unterminated `$expr` string on this line: an expression is being typed. */
const INSIDE_EXPRESSION = /"\$expr"\s*:\s*"(?:[^"\\]|\\.)*$/;
/** What the author has typed of the current name. */
const PREFIX = /[A-Za-z0-9_$.]*$/;

/** A type descriptor as a reader would say it. */
function describe(descriptor: unknown): string {
  if (typeof descriptor === "string") return descriptor;
  if (descriptor !== null && typeof descriptor === "object") {
    const record = descriptor as Record<string, unknown>;
    if ("enum" in record) return "enum";
    if ("array" in record) return "array";
    if ("record" in record) return "record";
  }
  return "value";
}

/** The host functions a vocabulary declares, as offers. */
export function hostFunctions(vocabularyText: string): Suggestion[] {
  let parsed: { functions?: Record<string, { arguments?: unknown[]; returns?: unknown }> };
  try {
    parsed = JSON.parse(vocabularyText);
  } catch {
    return [];
  }
  return Object.entries(parsed.functions ?? {}).map(([name, declaration]) => {
    const argumentTypes = Array.isArray(declaration?.arguments) ? declaration.arguments : [];
    const placeholders = argumentTypes.map((_, at) => `\${${at + 1}:arg${at + 1}}`);
    return {
      label: name,
      insert: `${name}(${placeholders.join(", ")})`,
      detail: `${argumentTypes.map(describe).join(", ")} to ${describe(declaration?.returns)}`,
      kind: "hostFunction" as const,
    };
  });
}

/** The declared state and context keys of a document, as offers. */
export function declaredKeys(documentText: string): Suggestion[] {
  let parsed: { state?: Record<string, unknown>; context?: Record<string, unknown> };
  try {
    parsed = JSON.parse(documentText);
  } catch {
    return [];
  }
  return (["state", "context"] as const).flatMap((root) =>
    Object.keys(parsed[root] ?? {}).map((key) => ({
      label: `${root}.${key}`,
      insert: `${root}.${key}`,
      detail: `declared ${root} key`,
      kind: "key" as const,
    })),
  );
}

/**
 * What to offer where the cursor is, or null when it is not inside an
 * expression. `typed` is the partial name the offers should replace.
 */
export function expressionSuggestions(
  lineUpToCursor: string,
  documentText: string,
  vocabularyText: string,
): { typed: string; suggestions: Suggestion[] } | null {
  if (!INSIDE_EXPRESSION.test(lineUpToCursor)) return null;
  return {
    typed: PREFIX.exec(lineUpToCursor)?.[0] ?? "",
    // The host's own functions first: they are the ones a reader of this
    // vocabulary cannot guess.
    suggestions: [
      ...hostFunctions(vocabularyText),
      ...declaredKeys(documentText),
      ...BUILT_INS,
      ...ROOTS,
    ],
  };
}
