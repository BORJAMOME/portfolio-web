// sync.ts — de los correos que manda el script de Gmail a public.procesos_correo (y a los procesos)
// Sin E/S directa: todo por «store» para poder probarlo con una base simulada.
import { classify, type Mail, type Resultado } from "./classify.ts";

export interface SyncStore {
  /** inserta si no existe message_id; devuelve el id nuevo o null si ya estaba */
  insert(row: Record<string, unknown>): Promise<string | null>;
  /** pc_aplicar(target): crea o actualiza el proceso; lanza error si no puede */
  apply(id: string): Promise<string>;
}

export const MAX_MESSAGES = 50;
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Valida un correo recibido del script (dato no confiable). null = descartar. */
export function parseMail(x: any): Mail | null {
  if (!x || typeof x !== "object") return null;
  const message_id = clip(x.message_id, 200), fecha = clip(x.fecha, 40);
  if (!/^[\w-]{6,200}$/.test(message_id) || isNaN(Date.parse(fecha))) return null;
  if (x.direccion !== "recibido" && x.direccion !== "enviado") return null;
  return {
    message_id, thread_id: clip(x.thread_id, 200) || null, direccion: x.direccion,
    remitente: clip(x.remitente, 320), destinatario: clip(x.destinatario, 320) || null,
    asunto: clip(x.asunto, 300), fecha: new Date(fecha).toISOString(),
    texto: typeof x.texto === "string" ? x.texto.slice(0, 4000) : "",
  };
}

export type Resumen = { recibidos: number; nuevos: number; aplicados: number; por_revisar: number; ignorados: number; repetidos: number; invalidos: number };

export async function sync(raw: unknown[], ownEmails: string[], store: SyncStore): Promise<Resumen> {
  const res: Resumen = { recibidos: raw.length, nuevos: 0, aplicados: 0, por_revisar: 0, ignorados: 0, repetidos: 0, invalidos: 0 };
  for (const x of raw.slice(0, MAX_MESSAGES)) {
    const m = parseMail(x);
    if (!m) { res.invalidos++; continue; }
    const c: Resultado = classify(m, ownEmails);
    const ignorar = c.confianza === "baja" || c.tipo === "otro";
    // de lo ignorado solo se guarda lo imprescindible para no volver a procesarlo (minimización)
    const row = ignorar
      ? { message_id: m.message_id, direccion: m.direccion, recibido_at: m.fecha, tipo: "otro", confianza: "baja", estado: "ignorado" }
      : {
        message_id: m.message_id, thread_id: m.thread_id, direccion: m.direccion, remitente: m.remitente.slice(0, 320),
        destinatario: m.destinatario?.slice(0, 320) ?? null, asunto: m.asunto.slice(0, 300), extracto: m.texto.replace(/\s+/g, " ").trim().slice(0, 700),
        recibido_at: m.fecha, tipo: c.tipo, empresa: c.empresa, empresa_clave: c.empresa_clave, puesto: c.puesto, fuente: c.fuente,
        motivo: c.motivo, confianza: c.confianza, senales: c.senales, estado: "por_revisar",
      };
    const id = await store.insert(row);
    if (!id) { res.repetidos++; continue; }
    res.nuevos++;
    if (ignorar) { res.ignorados++; continue; }
    if (c.confianza === "alta") {
      try { await store.apply(id); res.aplicados++; continue; } catch { /* queda por revisar */ }
    }
    res.por_revisar++;
  }
  return res;
}
