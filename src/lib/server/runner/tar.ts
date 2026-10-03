/** Minimal ustar writer: the Build's files and the Test inputs travel into the Sandbox as one tar on stdin. */

export type TarEntry = { path: string; content: string };

const encoder = new TextEncoder();
const BLOCK = 512;

function field(
  header: Uint8Array,
  offset: number,
  length: number,
  text: string,
): void {
  header.set(encoder.encode(text).subarray(0, length), offset);
}

function octal(
  header: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  field(
    header,
    offset,
    length,
    `${value.toString(8).padStart(length - 1, "0")}\0`,
  );
}

function headerFor(path: string, size: number): Uint8Array {
  const name = encoder.encode(path);
  if (name.length > 100)
    throw new Error(`Path too long for the Sandbox archive: ${path}`);
  const header = new Uint8Array(BLOCK);
  header.set(name, 0);
  octal(header, 100, 8, 0o644);
  octal(header, 108, 8, 0);
  octal(header, 116, 8, 0);
  octal(header, 124, 12, size);
  octal(header, 136, 12, 0);
  field(header, 148, 8, "        ");
  field(header, 156, 1, "0");
  field(header, 257, 6, "ustar\0");
  field(header, 263, 2, "00");
  let sum = 0;
  for (const byte of header) sum += byte;
  field(header, 148, 8, `${sum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

export function createTar(entries: TarEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const { path, content } of entries) {
    const data = encoder.encode(content);
    parts.push(headerFor(path, data.length), data);
    parts.push(new Uint8Array((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  parts.push(new Uint8Array(BLOCK * 2));
  const tar = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    tar.set(part, at);
    at += part.length;
  }
  return tar;
}
