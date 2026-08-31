// Maps a gate node reference to its place in the document text, so a
// failure or occurrence can point the editor at the node it names instead
// of leaving the author to search. Pure text navigation over the JSON the
// author typed: no parse tree is kept, and a reference that cannot be
// resolved (edited text, a keyed instance, an escape the search misses)
// degrades to null, never to a wrong position.
//
// Two reference forms exist (document model spec, Validation):
// - a node id, possibly with instance identities appended: `consent`,
//   `rows[2]`, `card[abc]`;
// - a path from the root: `root/children[2]/cases[late][0]`, with
//   `children`, `then`, `else`, `default` indexed and `cases` keyed.

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

function skipWhitespace(text: string, at: number): number {
  while (at < text.length && WHITESPACE.has(text[at] as string)) at += 1;
  return at;
}

/** From the opening quote past the closing one. */
function skipString(text: string, at: number): number {
  at += 1; // the opening quote
  while (at < text.length) {
    const character = text[at];
    if (character === "\\") {
      at += 2;
      continue;
    }
    at += 1;
    if (character === '"') return at;
  }
  return at;
}

/** From the first character of a value to just past its end. */
function skipValue(text: string, at: number): number {
  at = skipWhitespace(text, at);
  const character = text[at];
  if (character === '"') return skipString(text, at);
  if (character === "{" || character === "[") {
    let depth = 0;
    while (at < text.length) {
      const current = text[at];
      if (current === '"') {
        at = skipString(text, at);
        continue;
      }
      if (current === "{" || current === "[") depth += 1;
      if (current === "}" || current === "]") {
        depth -= 1;
        if (depth === 0) return at + 1;
      }
      at += 1;
    }
    return at;
  }
  // A literal: true, false, null, or a number.
  while (at < text.length && !WHITESPACE.has(text[at] as string) && !",]}".includes(text[at] as string)) {
    at += 1;
  }
  return at;
}

/** The offset of the value bound to `key` in the object starting at `at`. */
function memberValue(text: string, at: number, key: string): number | null {
  at = skipWhitespace(text, at);
  if (text[at] !== "{") return null;
  at += 1;
  for (;;) {
    at = skipWhitespace(text, at);
    if (text[at] === "}" || at >= text.length) return null;
    if (text[at] !== '"') return null;
    const keyStart = at;
    at = skipString(text, at);
    let memberKey: string;
    try {
      memberKey = JSON.parse(text.slice(keyStart, at)) as string;
    } catch {
      return null;
    }
    at = skipWhitespace(text, at);
    if (text[at] !== ":") return null;
    at = skipWhitespace(text, at + 1);
    if (memberKey === key) return at;
    at = skipValue(text, at);
    at = skipWhitespace(text, at);
    if (text[at] === ",") at += 1;
    else if (text[at] !== "}") return null;
  }
}

/** The offset of element `index` in the array starting at `at`. */
function element(text: string, at: number, index: number): number | null {
  at = skipWhitespace(text, at);
  if (text[at] !== "[") return null;
  at = skipWhitespace(text, at + 1);
  if (text[at] === "]") return null;
  for (let seen = 0; ; seen += 1) {
    if (seen === index) return at;
    at = skipValue(text, at);
    at = skipWhitespace(text, at);
    if (text[at] !== ",") return null;
    at = skipWhitespace(text, at + 1);
  }
}

/**
 * The range to mark for the value at `at`: a node object is narrowed to
 * its `"type"` value, so the marker underlines one token rather than a
 * thirty-line subtree; anything else is marked whole.
 */
function markRange(text: string, at: number): TextRange {
  at = skipWhitespace(text, at);
  if (text[at] === "{") {
    const type = memberValue(text, at, "type");
    if (type !== null) return { start: type, end: skipValue(text, type) };
  }
  return { start: at, end: skipValue(text, at) };
}

/** `name[token][token]` into its parts; null when the shape is not that. */
function parseSegment(segment: string): { name: string; brackets: string[] } | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[[^\[\]]*\])*)$/.exec(segment);
  if (match === null) return null;
  const brackets = [...(match[2] ?? "").matchAll(/\[([^\[\]]*)\]/g)].map((hit) => hit[1] as string);
  return { name: match[1] as string, brackets };
}

/** The `"id": "<id>"` member with this exact value, anywhere in the text. */
function locateId(text: string, id: string): TextRange | null {
  const encoded = JSON.stringify(id);
  const pattern = new RegExp(`"id"\\s*:\\s*${encoded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const match = pattern.exec(text);
  if (match === null) return null;
  const start = match.index + match[0].length - encoded.length;
  return { start, end: start + encoded.length };
}

export function locateReference(documentText: string, reference: string): TextRange | null {
  if (!reference.includes("/")) {
    // An id, with any instance identities (`rows[2]`, `card[abc]`) stripped:
    // identities index data, not text, so the template node is the target.
    const base = reference.replace(/(\[[^\[\]]*\])+$/, "");
    if (base.length === 0) return null;
    const byId = locateId(documentText, base);
    if (byId !== null) return byId;
    // `root` names the root node when it carries no id: the path form's
    // one single-segment reference.
    if (base !== "root") return null;
  }

  const segments = reference.split("/").map(parseSegment);
  if (segments.some((segment) => segment === null)) return null;
  const parsed = segments as { name: string; brackets: string[] }[];
  if (parsed[0]?.name !== "root") return null;

  const top = skipWhitespace(documentText, 0);
  let at = memberValue(documentText, top, "root");
  if (at === null) return null;

  for (const segment of parsed.slice(1)) {
    at = memberValue(documentText, at, segment.name);
    if (at === null) return null;
    for (const bracket of segment.brackets) {
      const here = skipWhitespace(documentText, at);
      const index = /^\d+$/.test(bracket) ? Number(bracket) : null;
      if (documentText[here] === "[" && index !== null) {
        at = element(documentText, here, index);
      } else if (documentText[here] === "{") {
        // A keyed bracket on an object: `cases[late]`.
        at = memberValue(documentText, here, bracket);
      } else {
        // A keyed-repeat identity on an array: it names an element of the
        // data, not of the text; the template array is the closest target.
        break;
      }
      if (at === null) return null;
    }
  }
  return markRange(documentText, at);
}
