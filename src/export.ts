// Exports the panes as a producer folder: the zip a project would keep
// its vocabulary and documents in, plus a README naming the CLI commands
// that pick up exactly where the playground leaves off. Stored entries,
// no compression: three small JSON files, and no dependency earns its
// keep for that.

export interface ExportFile {
  readonly path: string;
  readonly content: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A stored-entry zip, per APPNOTE: local headers, central directory, end record. */
export function zip(files: readonly ExportFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const push = (into: Uint8Array[], values: (number | Uint8Array)[]): number => {
    let size = 0;
    for (const value of values) size += typeof value === "number" ? 4 : value.length;
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let at = 0;
    for (const value of values) {
      if (typeof value === "number") {
        view.setUint32(at, value >>> 0, true);
        at += 4;
      } else {
        out.set(value, at);
        at += value.length;
      }
    }
    into.push(out);
    return size;
  };
  const u16 = (value: number): Uint8Array =>
    new Uint8Array([value & 0xff, (value >> 8) & 0xff]);

  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const headerStart = offset;
    offset += push(chunks, [
      0x04034b50,
      u16(20), u16(0x0800), u16(0), u16(0), u16(0), // version, utf-8 flag, stored, time, date
      crc, data.length, data.length,
      u16(name.length), u16(0),
      name, data,
    ]);
    push(central, [
      0x02014b50,
      u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      crc, data.length, data.length,
      u16(name.length), u16(0), u16(0), u16(0), u16(0),
      0, headerStart,
      name,
    ]);
  }

  const directoryStart = offset;
  let directorySize = 0;
  for (const entry of central) directorySize += entry.length;
  chunks.push(...central);
  push(chunks, [
    0x06054b50,
    u16(0), u16(0), u16(files.length), u16(files.length),
    directorySize, directoryStart,
    u16(0),
  ]);

  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** The producer folder for the current panes. */
export function producerFolder(
  vocabulary: string,
  document: string,
  documentName: string,
): readonly ExportFile[] {
  const readme = `# Milano producer folder

Exported from the Milano Playground (https://get-milano.dev/playground/).

Validate the document exactly the way the engines will, with the CLI:

    npx --package=@get-milano/cli milano validate documents/${documentName}.json --vocabulary vocabulary.json

Generate compiler-checked bindings from the vocabulary (each language optional):

    npx --package=@get-milano/cli milano bindings vocabulary.json --ts-out Bindings.ts

To start an app around these files, follow the tutorial at
https://get-milano.dev/getting-started/ - it wires this same folder into
SwiftUI, Compose, and React projects, with the engine installed from the
package manager of each.
`;
  return [
    { path: "milano/vocabulary.json", content: ensureTrailingNewline(vocabulary) },
    { path: `milano/documents/${documentName}.json`, content: ensureTrailingNewline(document) },
    { path: "milano/README.md", content: readme },
  ];
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}
