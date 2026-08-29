// Derives a document JSON Schema from the vocabulary in the left pane, so
// the document editor autocompletes the author's own components, property
// names, and event names. The derived schema starts from the official
// document schema and tightens the node definition; the contract's
// tolerance rules stay looser than this on purpose: here, stricter means
// better authoring feedback.

type Json = Record<string, unknown>;

interface TypeDescriptor {
  [key: string]: unknown;
}

function literalSchema(descriptor: unknown): Json {
  if (typeof descriptor === "string") {
    const optional = descriptor.endsWith("?");
    const kind = descriptor.replace(/\?$/, "");
    const base: Json =
      kind === "bool"
        ? { type: "boolean" }
        : kind === "int"
          ? { type: "integer" }
          : kind === "double"
            ? { type: "number" }
            : { type: "string" };
    return optional ? { anyOf: [base, { type: "null" }] } : base;
  }
  const d = descriptor as TypeDescriptor;
  if (d && typeof d === "object" && "enum" in d) {
    const members = [...(d.enum as string[])].sort();
    const base: Json = { enum: members };
    return (d as { optional?: boolean }).optional
      ? { anyOf: [base, { type: "null" }] }
      : base;
  }
  if (d && typeof d === "object" && "array" in d) {
    return { type: "array", items: literalSchema(d.array) };
  }
  return { type: "object" };
}

function valueSchema(descriptor: unknown): Json {
  return {
    anyOf: [
      literalSchema(descriptor),
      {
        type: "object",
        required: ["$expr"],
        properties: { "$expr": { type: "string", minLength: 1 } },
        additionalProperties: false
      }
    ]
  };
}

/** Vocabulary components, or null when the pane does not parse (yet). */
export interface VocabularyShape {
  components: Record<
    string,
    {
      properties?: Record<string, unknown>;
      events?: Record<string, unknown>;
      children?: boolean;
    }
  >;
}

export function parseVocabulary(text: string): VocabularyShape | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.components) {
      return parsed as VocabularyShape;
    }
  } catch {
    // A half-typed vocabulary is normal; the schema falls back to generic.
  }
  return null;
}

/**
 * The official document schema with its node definition specialized to the
 * given vocabulary. Passing null returns the official schema unchanged.
 */
export function deriveDocumentSchema(
  documentSchema: Record<string, unknown>,
  vocabulary: VocabularyShape | null
): Record<string, unknown> {
  const derived = structuredClone(documentSchema) as Json;
  delete derived.$id;
  if (!vocabulary) return derived;

  const componentNames = Object.keys(vocabulary.components);
  if (componentNames.length === 0) return derived;

  const perComponent = componentNames.map((name) => {
    const component = vocabulary.components[name];
    const declared = component.properties ?? {};
    const events = Object.keys(component.events ?? {});
    const constraints: Json = {};

    const propertyNames = Object.keys(declared);
    constraints.properties = {
      properties: {
        type: "object",
        propertyNames: propertyNames.length > 0 ? { enum: propertyNames } : { enum: [] },
        properties: Object.fromEntries(
          propertyNames.map((p) => [p, valueSchema(declared[p])])
        )
      },
      on: {
        type: "object",
        propertyNames: events.length > 0 ? { enum: events } : { enum: [] }
      }
    };
    if (!component.children) {
      (constraints.properties as Json).children = { type: "array", maxItems: 0 };
    }
    return {
      if: { properties: { type: { const: name } } },
      then: constraints
    };
  });

  // The $repeat construct (contract 2.0) belongs to every vocabulary: its
  // own keys are required, a component's keys are not its to carry.
  perComponent.push({
    if: { properties: { type: { const: "$repeat" } } },
    then: {
      required: ["items", "as", "children"],
      properties: {
        properties: { type: "object", maxProperties: 0 },
        on: { type: "object", maxProperties: 0 }
      }
    }
  });

  const defs = derived.$defs as Json;
  const node = defs.node as Json;
  const nodeProperties = node.properties as Json;
  nodeProperties.type = { enum: [...componentNames, "$repeat"] };
  node.allOf = perComponent;
  return derived;
}
