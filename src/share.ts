// Shareable links: the whole playground state travels in the URL fragment,
// deflate-compressed and base64url-encoded. No backend, nothing stored.

export interface PlaygroundState {
  vocabulary: string;
  document: string;
  context: string;
  state: string;
  actions?: string;
  policy: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(
  bytes: Uint8Array,
  stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream }
): Promise<Uint8Array> {
  const readable = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(stream as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(readable).arrayBuffer());
}

export async function encodeState(state: PlaygroundState): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(state));
  const deflated = await pipe(raw, new CompressionStream("deflate-raw"));
  return toBase64Url(deflated);
}

export async function decodeState(fragment: string): Promise<PlaygroundState | null> {
  try {
    const inflated = await pipe(fromBase64Url(fragment), new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(inflated));
  } catch {
    return null;
  }
}
