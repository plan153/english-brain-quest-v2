/**
 * Minimal ZIP (STORE only) — no compression dependency.
 * Paths use forward slashes; suitable for Obsidian vault unpack.
 */

export interface ZipEntry {
  path: string;
  content: string | Uint8Array;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function encodePath(path: string): Uint8Array {
  const normalized = path.replace(/^\/+/, '').replace(/\\/g, '/');
  return new TextEncoder().encode(normalized);
}

/** Build an uncompressed ZIP blob. */
export function createZipBlob(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encodePath(entry.path);
    const data =
      typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    const checksum = crc32(data);
    const size = data.length;

    const local = concat([
      u32(0x04034b50), // local file header
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method = store
      u16(0), // time
      u16(0), // date
      u32(checksum),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0), // extra len
      name,
      data,
    ]);

    const central = concat([
      u32(0x02014b50), // central directory
      u16(20), // version made by
      u16(20), // version needed
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  const bytes = concat([...locals, centralDir, end]);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: 'application/zip' });
}
