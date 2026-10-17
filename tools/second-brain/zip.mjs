/* tools/second-brain/zip.mjs: lector de ZIP mínimo (docx, xlsx, pbix) sin dependencias.
   Solo lee: nunca extrae a disco ni ejecuta nada. Límites contra ZIP bombs. */
import { inflateRawSync } from 'node:zlib';

const MAX_ENTRY = 24 * 1024 * 1024;   // máximo descomprimido por entrada
const MAX_ENTRIES = 5000;

/** Devuelve { names, read(name) → Buffer|null } o null si no es un ZIP legible. */
export function openZip(buf) {
  // End Of Central Directory: firma 0x06054b50 en los últimos 64 KB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (total > MAX_ENTRIES) return null;
  const entries = new Map();
  for (let n = 0; n < total; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    entries.set(name, { method, csize, usize, lho });
    off += 46 + nlen + elen + clen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e || e.usize > MAX_ENTRY) return null;
      const h = e.lho;
      if (h + 30 > buf.length || buf.readUInt32LE(h) !== 0x04034b50) return null;
      const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
      const raw = buf.subarray(start, start + e.csize);
      try {
        if (e.method === 0) return Buffer.from(raw);
        if (e.method === 8) return inflateRawSync(raw, { maxOutputLength: MAX_ENTRY });
      } catch { /* entrada dañada o demasiado grande */ }
      return null;
    },
  };
}
