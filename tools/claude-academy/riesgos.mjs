/* ═══════════════════════════════════════════════
   tools/claude-academy/riesgos.mjs: qué de una ficha hay que contrastar con la fuente
   ─────────────────────────────────────────────────
   Revisar 25 campos enteros no es realista, y un texto bien presentado se lee como correcto. Esto reduce la revisión a una lista
   corta de lo que SÍ puede estar mal, comprobado con código contra el dossier crudo (tools/claude-academy/dossier.mjs):
     · números de 2 o más cifras que no aparecen en el dossier;
     · identificadores (flags --x, comandos /x, VARIABLES_DE_ENTORNO, camelCase, archivos .py/.json…) que no aparecen en el dossier;
     · campos marcados «ejemplo mío» (los redacta el modelo, no salen de la fuente; no se anclan);
     · datos leídos de una IMAGEN (la ficha no puede ser «verificado»);
     · cursos sin dossier (no se puede anclar nada).
   LÍMITE: que un número o comando esté en el dossier prueba que existe en la fuente, NO que la paráfrasis sea fiel ni que el dossier
   se haya leído bien. Pasar esta comprobación nunca sube un estado de verificación; eso sigue siendo juicio de quien revisa.
   riesgos(data, dossiers) es pura (dossiers: {curso: {texto, lecturas}}); cargarDossiers(data) los lee de .claude-academy/fuentes/.
   ═══════════════════════════════════════════════ */
import { leerDossier } from './dossier.mjs';

const deco = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PROPIO = /ejemplo\s+m[ií]o/i;
/* flags --x, comandos /x, VARIABLES_DE_ENTORNO, camelCase y nombres de archivo: lo que en una fuente aparece tal cual o no aparece */
const TOKEN = /^(--?[A-Za-z][\w-]*|\/[a-z][\w-]*|[A-Z][A-Z0-9]*_[A-Z0-9_]+|[a-z]+[A-Z]\w+|[\w.-]+\.(?:py|json|js|md|csv|txt|yml|yaml|sql))$/;

/* Todos los textos de una ficha como [campo, html]; los visuales genéricos (vizData) se recorren entera */
export function camposDe(t) {
  const out = [], add = (c, v) => { if (typeof v === 'string' && v.trim()) out.push([c, v]); };
  const deep = (c, v) => { if (typeof v === 'string') add(c, v); else if (Array.isArray(v)) v.forEach((x) => deep(c, x)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => deep(c, x)); };
  for (const k of ['one', 'friend', 'ex', 'key', 'vizNote', 'q']) add(k, t[k]);
  for (const k of ['steps', 'yes', 'no', 'rec']) (t[k] || []).forEach((x) => add(k, x));
  deep('caso', t.caso); deep('conf', t.conf); deep('pro', t.pro); deep('quiz', t.quiz); deep('lab', t.lab); deep('ejer', t.ejer); deep('vizData', t.vizData);
  (t.code || []).forEach((c) => add('code', c.s));
  return out;
}

export function riesgos(data, dossiers) {
  const res = [];
  for (const t of data.TOPICS) {
    const cursos = [...new Set((t.src || []).map((s) => s && s.c).filter(Boolean))];
    const ds = cursos.map((c) => [c, dossiers[c]]);
    const faltan = ds.filter(([, d]) => !d).map(([c]) => c);
    const fuente = ds.filter(([, d]) => d).map(([, d]) => d.texto + '\n' + d.lecturas.map((l) => l.t).join('\n')).join('\n');
    const r = { id: t.id, t: t.t, ver: t.ver && t.ver.e, sinDossier: faltan, sinAncla: [], propios: [], imagen: [], verAlto: false };
    const seen = new Set();
    const ancla = (campo, valor, tipo, ok) => { const k = tipo + valor; if (!ok && !seen.has(k)) { seen.add(k); r.sinAncla.push({ campo, valor, tipo }); } };
    const conFuente = fuente.trim().length > 0;
    {
      for (const [campo, html] of camposDe(t)) {
        const txt = deco(html);
        if (PROPIO.test(txt)) { if (!r.propios.includes(campo)) r.propios.push(campo); }
        else if (conFuente) {
          const sin = txt.replace(/\d{4}-\d{2}-\d{2}/g, ' ');
          for (const n of sin.match(/(?<![\w.,])\d{2,}(?:[.,]\d+)?(?![\w])/g) || []) {
            const alt = n.includes(',') ? n.replace(',', '.') : n.replace('.', ',');
            ancla(campo, n, 'número', [n, alt].some((v) => new RegExp(`(?<![\\d.,])${esc(v)}(?![\\d])`).test(fuente)));
          }
        }
        /* los identificadores se comprueban siempre (un ejemplo propio también debería usar nombres reales), salvo en campos «ejemplo mío» */
        if (conFuente && !PROPIO.test(txt)) {
          const codes = campo === 'code' ? [txt] : [...String(html).matchAll(/<code>(.*?)<\/code>/g)].map((m) => deco(m[1]));
          for (const c of codes) for (const tok of c.split(/[\s=,;()]+/).map((x) => x.replace(/^["'`]|["'`.:]$/g, '')).filter((x) => TOKEN.test(x))) ancla(campo, tok, 'identificador', fuente.includes(tok));
        }
      }
    }
    for (const c of cursos) for (const l of (dossiers[c] && dossiers[c].lecturas) || []) if (l.tipo === 'imagen' && (!l.temas.length || l.temas.includes(t.id))) r.imagen.push(l.t);
    r.verAlto = t.ver && t.ver.e === 'verificado' && r.imagen.length > 0;
    res.push(r);
  }
  return res;
}

export function cargarDossiers(data) {
  const out = {};
  for (const c of data.COURSES) { const d = leerDossier(c.id); if (d) out[c.id] = d; }
  return out;
}

/* Líneas listas para imprimir (vacío = nada que contrastar) */
export function formatear(res) {
  const L = [];
  for (const r of res) {
    const l = [];
    if (r.sinDossier.length) l.push(`  · sin dossier de «${r.sinDossier.join(', ')}»: no se ha podido comprobar nada contra la fuente`);
    if (r.verAlto) l.push(`  · ver.e es «verificado» pero ${r.imagen.length} dato(s) se leyeron de una imagen: debería ser «parcial»`);
    for (const x of r.imagen) l.push(`  · leído de una imagen: ${x}`);
    for (const x of r.sinAncla) l.push(`  · ${x.tipo} «${x.valor}» (${x.campo}) no aparece en el dossier`);
    if (r.propios.length) l.push(`  · ejemplo propio, no sale de la fuente (${r.propios.join(', ')})`);
    if (r.ver && r.ver !== 'verificado') l.push(`  · verificación: ${r.ver}`);
    if (l.length) L.push(`${r.id}`, ...l);
  }
  return L;
}
