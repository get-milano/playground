// What to show when the cursor rests on a name: a contract function's
// signature, a host function's declared shape, or a component's declared
// properties and events. Pure, so it can be tested without an editor; the
// Monaco glue lives in expressions.ts, next to completion's.
import { BUILT_INS, hostFunctions } from "./suggest";

export interface HoverInfo {
  /** Markdown for the tooltip. */
  readonly text: string;
  /** 1-based columns of the hovered token, for the anchor range. */
  readonly startColumn: number;
  readonly endColumn: number;
}

/** `${1:text}` placeholders down to `text`, for display. */
function plainSignature(insert: string): string {
  return insert.replace(/\$\{\d+:([^}]*)\}/g, "$1");
}

/** A type descriptor as a reader would say it. */
function describeType(descriptor: unknown): string {
  if (typeof descriptor === "string") return descriptor;
  if (descriptor !== null && typeof descriptor === "object") {
    const record = descriptor as Record<string, unknown>;
    const optional = record["optional"] === true ? "?" : "";
    if (Array.isArray(record["enum"])) {
      return `enum(${(record["enum"] as string[]).join(" | ")})${optional}`;
    }
    if ("array" in record) return `array of ${describeType(record["array"])}${optional}`;
    if ("record" in record) return `record${optional}`;
  }
  return "value";
}

interface ComponentDeclaration {
  readonly properties?: Record<string, unknown>;
  readonly events?: Record<string, unknown>;
  readonly children?: boolean;
}

function componentCard(name: string, declaration: ComponentDeclaration): string {
  const lines = [`**${name}** · component`];
  const properties = Object.entries(declaration.properties ?? {});
  lines.push(
    properties.length === 0
      ? "\nproperties: none"
      : `\nproperties: ${properties
          .map(([property, descriptor]) => `\`${property}: ${describeType(descriptor)}\``)
          .join(", ")}`,
  );
  const events = Object.entries(declaration.events ?? {});
  if (events.length > 0) {
    lines.push(
      `\nevents: ${events
        .map(([eventName, payload]) =>
          payload === null ? `\`${eventName}\`` : `\`${eventName}: ${describeType(payload)}\``,
        )
        .join(", ")}`,
    );
  }
  if (declaration.children === true) lines.push("\naccepts children");
  return lines.join("\n");
}

const TOKEN = /[$A-Za-z0-9_]/;

/**
 * The hover for `column` (1-based) of `lineText`, against the current
 * vocabulary pane, or null when the token under the cursor is nothing the
 * playground knows. Assistance only, like completion: a stale or broken
 * vocabulary simply offers less.
 */
export function hoverInfo(
  lineText: string,
  column: number,
  vocabularyText: string,
): HoverInfo | null {
  // The token under the cursor: the contiguous identifier run, `$` included.
  const at = column - 1;
  if (at < 0 || at > lineText.length) return null;
  let start = at;
  while (start > 0 && TOKEN.test(lineText[start - 1] as string)) start -= 1;
  let end = at;
  while (end < lineText.length && TOKEN.test(lineText[end] as string)) end += 1;
  const token = lineText.slice(start, end);
  if (token.length === 0) return null;
  const anchor = { startColumn: start + 1, endColumn: end + 1 };

  // A contract function: the signature every engine shares.
  if (token.startsWith("$")) {
    const builtIn = BUILT_INS.find((candidate) => candidate.label === token);
    if (builtIn === undefined) return null;
    return {
      ...anchor,
      text: `**${token}** · ${builtIn.detail}\n\n\`${plainSignature(builtIn.insert)}\``,
    };
  }

  // A host function the vocabulary declares.
  const host = hostFunctions(vocabularyText).find((candidate) => candidate.label === token);
  if (host !== undefined) {
    return {
      ...anchor,
      text: `**${token}** · host function, ${host.detail}\n\n\`${plainSignature(host.insert)}\``,
    };
  }

  // A component the vocabulary declares: its whole card.
  try {
    const vocabulary = JSON.parse(vocabularyText) as {
      components?: Record<string, ComponentDeclaration>;
    };
    const declaration = vocabulary.components?.[token];
    if (declaration !== undefined && declaration !== null) {
      return { ...anchor, text: componentCard(token, declaration) };
    }
  } catch {
    // No parseable vocabulary, no card.
  }
  return null;
}
