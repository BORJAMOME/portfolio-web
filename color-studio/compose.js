/* ═══════════════════════════════════════════════
   color-studio/compose.js: composición cromática y direcciones (Minimalista · Equilibrada · Creativa)
   ─────────────────────────────────────────────────
   Módulo ES sin DOM. Tres capas separadas a propósito:
     1. HECHOS calculados: luminosidad, croma, tono, temperatura aproximada, ΔE00, superficie estimada.
     2. CRITERIOS de estilismo con nombre (MOVES): convenciones explícitas, no leyes. Cada propuesta
        cita el suyo y sus frases solo describen lo que el criterio hace de verdad.
     3. LECTURA: «más cerca de lo minimalista / equilibrado / creativo», derivada de los hechos con
        umbrales documentados. Es una orientación, nunca una nota ni un porcentaje.
   Las propuestas cambian una o dos prendas por otras REALES del armario. Cuando no hay prenda
   que encaje, el color se ofrece como HIPOTÉTICO (hypothetical: true) y la interfaz lo dice:
   nunca se presenta como algo que ya tienes.
   ═══════════════════════════════════════════════ */
import { normalizeHex, colorDistance, describeColor, hexToLab, labToLch, lchToLab, labToHex, rankPalettes, SLOTS, SLOT, garmentColorParts, estimateDistribution } from './engine.js';

export const DIRECTIONS = [
  { id: 'minimal', label: 'Minimalista', goal: 'Discreto y tonal: neutros o tonos apagados, sin acentos que compitan.' },
  { id: 'balanced', label: 'Equilibrada', goal: 'Un color que manda, apoyos que se repiten y como mucho un acento.' },
  { id: 'creative', label: 'Creativa', goal: 'Un contraste o un acento deliberado, sin perder la coherencia.' }
];
export const DIRECTION = Object.fromEntries(DIRECTIONS.map((d) => [d.id, d]));
/** La preferencia antigua de calcetines (discreet/balanced/contrast) se traduce a dirección. */
export function directionOf(v) {
  if (DIRECTION[v]) return v;
  return v === 'discreet' ? 'minimal' : v === 'contrast' ? 'creative' : 'balanced';
}

/* Explicaciones breves para el aprendizaje progresivo (se muestran bajo demanda). */
export const GLOSSARY = {
  tonal: ['Relación tonal', 'Colores del mismo tono con distinta luminosidad o intensidad (marino y azul medio). Se lee como un bloque: sofisticado si hay diferencia de luz; plano si no la hay.'],
  analoga: ['Relación análoga', 'Tonos vecinos en el círculo (verde oliva y mostaza). Armoniza sin parecer igualado.'],
  complementaria: ['Relación complementaria', 'Tonos opuestos (azul y naranja). Con colores intensos es vibrante; con tonos apagados (marino y camel) el contraste es suave y clásico.'],
  luminosidad: ['Contraste de luminosidad', 'Diferencia entre claro y oscuro, independiente del tono. Blanco y marino contrastan mucho aunque ninguno sea «un color».'],
  acento: ['Color de acento', 'Un color pequeño (menos del 15 % de la superficie estimada) que destaca sobre el resto por intensidad o por distancia. Atrae la mirada: con uno basta.'],
  temperatura: ['Temperatura', 'Aproximación por tono: rojos, naranjas y amarillos se leen cálidos; azules y verdes azulados, fríos. Los neutros también tienen temperatura (camel cálido, gris azulado frío).'],
  repeticion: ['Repetición', 'El mismo color (o uno muy próximo) en dos zonas del conjunto. Une las prendas y hace que un color se lea como intencionado.'],
  continuidad: ['Continuidad', 'Pantalón, calcetín y calzado en la misma familia o con poco contraste: la pierna se lee como una línea.']
};

/* ═══════════ HECHOS ═══════════ */
export function temperatureOf(C, h) {
  if (C < 8) return 'neutra';
  if (h < 100 || h >= 345) return 'cálida';
  if (h >= 150 && h < 300) return 'fría';
  return 'intermedia';
}
/** { hex, L, C, h, family, neutral, name, temperature } o null si no es un HEX válido. */
export function colorFacts(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  const lch = labToLch(hexToLab(n)), d = describeColor(n);
  return { hex: n, L: lch.L, C: lch.C, h: lch.h, family: d.family, neutral: d.neutral, name: d.name, temperature: temperatureOf(lch.C, lch.h) };
}
export const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
export function lightnessLevel(dL) { return dL < 15 ? 'bajo' : dL < 35 ? 'medio' : 'alto'; }

/* Umbrales (orientativos): ΔE00 ≤ 5 casi el mismo color; tono relevante solo con croma ≥ 10;
   hueco de tono ≤ 20° tonal, ≤ 50° análogo, ≥ 130° complementario (en LCh los complementarios
   percibidos no quedan a 180°: azul y naranja están a unos 140°). */
export const RELATION_LABEL = {
  igual: 'Casi el mismo color', neutros: 'Entre neutros', 'base-neutra': 'Color sobre neutro', tonal: 'Tonal',
  analoga: 'Análoga', complementaria: 'Complementaria', 'contraste-tono': 'Contraste de tono'
};
export function relation(a, b) {
  const x = colorFacts(a), y = colorFacts(b);
  if (!x || !y) return null;
  const dE = colorDistance(x.hex, y.hex), dL = Math.abs(x.L - y.L), gap = hueGap(x.h, y.h);
  let kind;
  if (dE <= 5) kind = 'igual';
  else if (x.C < 10 && y.C < 10) kind = 'neutros';
  else if (x.C < 10 || y.C < 10) kind = 'base-neutra';
  else if (gap <= 20) kind = 'tonal';
  else if (gap <= 50) kind = 'analoga';
  else if (gap >= 130) kind = 'complementaria';
  else kind = 'contraste-tono';
  return { kind, label: RELATION_LABEL[kind], dE, dL, light: lightnessLevel(dL), muted: Math.max(x.C, y.C) < 35, a: x, b: y };
}
/** Frase corta que describe una relación (hecho, no valoración). */
export function describeRelation(r) {
  if (!r) return '';
  const light = 'contraste de luminosidad ' + r.light;
  const txt = {
    igual: 'casi el mismo color',
    neutros: 'dos neutros, ' + light,
    'base-neutra': 'un color sobre un neutro, ' + light,
    tonal: 'misma familia de tono, ' + light,
    analoga: 'tonos vecinos, ' + light,
    complementaria: 'tonos opuestos' + (r.muted ? ' en versión apagada (contraste suave)' : '') + ', ' + light,
    'contraste-tono': 'tonos distintos que contrastan' + (r.muted ? ' en versión apagada' : '') + ', ' + light
  }[r.kind];
  return r.a.name + ' y ' + r.b.name + ': ' + txt + '.';
}

/* ═══════════ OUTFIT ═══════════ */
/** Huecos del borrador → items para estimateDistribution, en el orden en que se lleva la ropa. */
export function buildItems(slots, garments) {
  const byId = {};
  (garments || []).forEach((g) => { byId[g.id] = g; });
  return SLOTS.filter((s) => slots && slots[s.id]).map((s) => {
    const e = slots[s.id], g = e.garment_id ? byId[e.garment_id] || null : null;
    const colors = g ? garmentColorParts(g) : normalizeHex(e.hex) ? [{ hex: normalizeHex(e.hex), share: 1 }] : [];
    return { slot: s.id, label: s.label, garment: g, lost: !!(e.garment_id && !g), hex: g ? g.primary_color : normalizeHex(e.hex) || null,
      weight: e.weight, colors, hypothetical: !!e.hypothetical };
  });
}

/* Umbrales de la lectura (documentados en color-studio/README.md):
   acento = < 15 % de superficie, no neutro, croma ≥ 25 y ΔE00 > 15 con todos los colores mayores.
   minimal = sin acentos, ≤ 1 familia fuera de los neutros, croma medio ponderado < 22 y sin contraste de tono fuerte.
   creative = ≥ 2 acentos, o un contraste de tono fuerte entre colores con ≥ 10 % (complementario o de tono, croma ≥ 30 en ambos),
              o ≥ 3 familias fuera de los neutros, o un acento muy intenso (croma ≥ 65). */
export const READING_LABEL = { minimal: 'más cerca de lo minimalista', balanced: 'equilibrada', creative: 'más cerca de lo creativo' };
export function analyzeOutfit(items, opts = {}) {
  const est = estimateDistribution(items);
  if (!est.valid) return { valid: false, colors: [], accents: [], repetitions: [], relations: [], warnings: est.warnings };
  let cols = est.colors.map((c) => Object.assign(colorFacts(c.hex), { pct: c.pct, slots: [...new Set(c.sources.map((s) => s.slot))] }));
  if (Array.isArray(opts.distribution) && opts.distribution.length) {     // reparto ajustado a mano
    const by = {};
    opts.distribution.forEach((x) => { const n = normalizeHex(x.hex); if (n) by[n] = Number(x.pct) || 0; });
    if (cols.every((c) => c.hex in by)) cols.forEach((c) => { c.pct = by[c.hex]; });
  }
  cols.sort((a, b) => b.pct - a.pct);
  cols.forEach((c, i) => { c.role = i === 0 ? 'dominante' : 'apoyo'; });
  cols.forEach((c, i) => {
    if (i && c.pct < 15 && !c.neutral && c.C >= 25 && cols.filter((o) => o.pct > c.pct).every((o) => colorDistance(o.hex, c.hex) > 15)) c.role = 'acento';
  });
  const big = cols.filter((c) => c.pct >= 3);
  const sumPct = cols.reduce((s, c) => s + c.pct, 0) || 1;
  const weightedC = cols.reduce((s, c) => s + c.C * c.pct, 0) / sumPct;
  const visible = cols.filter((c) => c.pct >= 5);
  const Ls = visible.map((c) => c.L);
  const lightRange = Ls.length > 1 ? Math.max(...Ls) - Math.min(...Ls) : 0;
  const families = [...new Set(big.filter((c) => !c.neutral).map((c) => c.family))];
  const warm = cols.filter((c) => c.temperature === 'cálida').reduce((s, c) => s + c.pct, 0);
  const cool = cols.filter((c) => c.temperature === 'fría').reduce((s, c) => s + c.pct, 0);
  // repetición: el mismo color (ΔE00 ≤ 10) en prendas distintas
  const entries = [];
  items.forEach((it) => (it.colors || []).forEach((c) => { const n = normalizeHex(c.hex); if (n) entries.push({ hex: n, slot: it.slot, label: it.label }); }));
  const groups = [];
  entries.forEach((e) => {
    const g = groups.find((x) => colorDistance(x.hex, e.hex) <= 10);
    if (g) { if (!g.slots.includes(e.slot)) { g.slots.push(e.slot); g.labels.push(e.label); } } else groups.push({ hex: e.hex, slots: [e.slot], labels: [e.label] });
  });
  const repetitions = groups.filter((g) => g.slots.length > 1).map((g) => Object.assign(g, { name: colorFacts(g.hex).name }));
  const dominant = cols[0];
  const relations = big.slice(1, 4).map((c) => relation(dominant.hex, c.hex));
  const pairs = [], wide = cols.filter((c) => c.pct >= 10);       // contraste fuerte = entre dos superficies grandes
  for (let i = 0; i < wide.length; i++) for (let j = i + 1; j < wide.length; j++) pairs.push(relation(wide[i].hex, wide[j].hex));
  const strong = pairs.some((r) => (r.kind === 'complementaria' || r.kind === 'contraste-tono') && r.a.C >= 30 && r.b.C >= 30);
  const accents = cols.filter((c) => c.role === 'acento');
  const by = {};
  items.forEach((it) => { by[it.slot] = it; });
  const lower = by.bottom && by.shoes && by.bottom.hex && by.shoes.hex ? relation(by.bottom.hex, by.shoes.hex) : null;
  let reading = 'balanced';
  if (!accents.length && families.length <= 1 && weightedC < 22 && !strong) reading = 'minimal';
  else if (accents.length >= 2 || strong || families.length >= 3 || accents.some((a) => a.C >= 65)) reading = 'creative';
  return {
    valid: true, colors: cols, dominant, accents, repetitions, relations, strongContrast: strong,
    families, weightedC, light: lightnessLevel(lightRange), lightRange,
    temperature: warm >= 10 && cool >= 10 ? 'mixta' : warm >= 10 ? 'cálida' : cool >= 10 ? 'fría' : 'neutra',
    lower, reading, warnings: est.warnings
  };
}

/** Diferencias legibles entre dos análisis (lo que cambia, sin valorar si es mejor). */
export function compareAnalyses(a, b) {
  if (!a.valid || !b.valid) return [];
  const out = [];
  const names = (list) => (list.length ? list.map((c) => c.name).join(', ') : 'ninguno');
  if (a.light !== b.light) out.push('Contraste de luminosidad: ' + a.light + ' → ' + b.light + '.');
  if (names(a.accents) !== names(b.accents)) out.push('Acento: ' + names(a.accents) + ' → ' + names(b.accents) + '.');
  if (a.families.length !== b.families.length) out.push('Familias fuera de los neutros: ' + a.families.length + ' → ' + b.families.length + '.');
  const dC = b.weightedC - a.weightedC;
  if (Math.abs(dC) >= 4) out.push('Intensidad media del color: ' + (dC < 0 ? 'más apagada' : 'más intensa') + '.');
  const rep = (x) => (x.repetitions.length ? 'sí (' + x.repetitions.map((r) => r.name).join(', ') + ')' : 'no');
  if (rep(a) !== rep(b)) out.push('Repetición entre prendas: ' + rep(a) + ' → ' + rep(b) + '.');
  if (a.lower && b.lower && (a.lower.kind !== b.lower.kind || a.lower.light !== b.lower.light)) {
    out.push('Pantalón y calzado: ' + a.lower.label.toLowerCase() + ' (' + a.lower.light + ') → ' + b.lower.label.toLowerCase() + ' (' + b.lower.light + ').');
  }
  if (a.temperature !== b.temperature) out.push('Temperatura: ' + a.temperature + ' → ' + b.temperature + '.');
  if (a.reading !== b.reading) out.push('Lectura: ' + READING_LABEL[a.reading] + ' → ' + READING_LABEL[b.reading] + '.');
  return out;
}

/* ═══════════ DIRECCIONES ═══════════
   MOVES: criterios con nombre. Cada uno devuelve 0 o 1 propuesta; se muestran como mucho 2 por dirección,
   sin repetir composiciones casi iguales (todos los colores emparejados con ΔE00 ≤ 5). */
export const MOVES = {
  'min-apagar': 'Retirar el color más intenso: una prenda neutra o un tono apagado de la misma familia en su lugar.',
  'min-tonal': 'Llevar la parte de arriba a la familia del pantalón (tonal o neutros próximos): el conjunto se lee como un bloque.',
  'eq-repetir': 'Repetir un color ya presente en otra zona del conjunto: la repetición une las prendas.',
  'eq-reducir': 'Con dos o más acentos, convertir uno en color de apoyo: queda un solo foco de atención.',
  'eq-apoyo': 'Sobre una base solo neutra, introducir un color apagado que dé carácter sin gritar.',
  'cr-paleta': 'Incorporar un color de una paleta de la biblioteca que ya comparte colores con el conjunto y que este aún no usa.',
  'cr-acento': 'Un acento en relación complementaria, de contraste o análoga con el color principal, en una prenda pequeña.',
  'cr-repetir': 'Repetir el acento en una segunda zona: el color inesperado se lee como decisión, no como accidente.',
  'mantener': 'El conjunto ya cumple los criterios de esta dirección: no se fuerza un cambio.'
};
const SMALL = ['accessory', 'socks', 'top', 'outer'];
const CHROMA_CAP = { formal: 30, smart: 45, casual: 60 };

function context(input) {
  const slots = input.slots || {}, garments = input.garments || [];
  const items = buildItems(slots, garments);
  const used = new Set(items.filter((it) => it.garment).map((it) => it.garment.id));
  return { slots, garments, items, used, palettes: input.palettes || [], formality: CHROMA_CAP[input.formality] ? input.formality : 'smart', before: analyzeOutfit(items) };
}
const realFor = (c, slot) => c.garments.filter((g) => SLOT[slot].categories.includes(g.category) && !c.used.has(g.id));
const itemOf = (c, slot) => c.items.find((it) => it.slot === slot) || null;
const nameOfHex = (hex) => (describeColor(hex) || {}).name || hex;
const garmentLabel = (g) => g.name || nameOfHex(g.primary_color);
function fromText(c, slot) {
  const it = itemOf(c, slot);
  return !it ? 'nada' : it.garment ? garmentLabel(it.garment) : it.hex ? 'color provisional ' + nameOfHex(it.hex) : 'prenda eliminada';
}

function proposal(c, direction, move, changes, explanation, extra) {
  const slots = JSON.parse(JSON.stringify(c.slots));
  changes.forEach((ch) => {
    if (ch.remove) { delete slots[ch.slot]; return; }
    const prev = slots[ch.slot];
    slots[ch.slot] = { weight: prev && prev.weight != null ? prev.weight : SLOT[ch.slot].weight, garment_id: ch.garment ? ch.garment.id : null,
      hex: ch.garment ? null : ch.hex, hypothetical: !ch.garment };
  });
  const after = analyzeOutfit(buildItems(slots, c.garments));
  return Object.assign({
    id: direction + ':' + move + ':' + changes.map((ch) => ch.slot + '=' + (ch.garment ? ch.garment.id : ch.hex)).join(','),
    direction, move, rule: MOVES[move], explanation,
    changes: changes.map((ch) => ({ slot: ch.slot, label: SLOT[ch.slot].label, from: fromText(c, ch.slot), garment: ch.garment || null, remove: !!ch.remove,
      hex: ch.remove ? null : ch.garment ? ch.garment.primary_color : ch.hex, name: ch.remove ? 'sin ' + SLOT[ch.slot].label.toLowerCase() : ch.garment ? garmentLabel(ch.garment) : nameOfHex(ch.hex),
      hypothetical: !ch.garment && !ch.remove })),
    hypothetical: changes.some((ch) => !ch.garment && !ch.remove),
    slots, before: c.before, after, diff: compareAnalyses(c.before, after)
  }, extra || {});
}
function muted(hex, maxC) {
  const lch = labToLch(hexToLab(hex));
  return labToHex(lchToLab({ L: lch.L, C: Math.min(lch.C, maxC), h: lch.h }));
}
function loudItems(c) {
  return c.items.filter((it) => it.hex && !it.lost).map((it) => ({ it, f: colorFacts(it.hex) }))
    .filter((x) => !x.f.neutral && x.f.C >= 20).sort((a, b) => b.f.C - a.f.C);
}
const nearAny = (hex, list, tol) => list.some((h) => colorDistance(hex, h) <= tol);
function outfitHexes(c) { const out = []; c.items.forEach((it) => (it.colors || []).forEach((x) => out.push(x.hex))); return out; }

const MOVE_FNS = {
  'min-apagar'(c) {
    const loud = loudItems(c);
    if (!loud.length) return null;
    for (const x of loud) {             // primero, una prenda real que retire el color más intenso posible
      const others = c.before.colors.filter((col) => !x.it.colors.some((y) => y.hex === col.hex));
      const anchor = (others[0] || c.before.dominant).hex;
      const cand = realFor(c, x.it.slot).map((g) => ({ g, f: colorFacts(g.primary_color) }))
        .filter((y) => y.f.neutral || (hueGap(y.f.h, x.f.h) <= 30 && y.f.C <= Math.max(15, x.f.C - 15)))
        .sort((a, b) => (b.f.neutral - a.f.neutral) || (a.f.C - b.f.C) || (colorDistance(a.g.primary_color, anchor) - colorDistance(b.g.primary_color, anchor)))[0];
      if (cand) {
        return proposal(c, 'minimal', 'min-apagar', [{ slot: x.it.slot, garment: cand.g }],
          'Cambia ' + fromText(c, x.it.slot) + ' por ' + garmentLabel(cand.g) + ': retira el ' + x.f.name + (x === loud[0] ? ', el color más intenso,' : '') + ' y deja ' + (cand.f.neutral ? 'un neutro' : 'un tono apagado de la misma familia') + ' en su lugar.');
      }
    }
    const top = loud[0];
    if (top.it.slot === 'accessory' || top.it.slot === 'socks') {      // quitar una pieza pequeña no inventa nada
      return proposal(c, 'minimal', 'min-apagar', [{ slot: top.it.slot, remove: true }],
        'Prescinde de ' + fromText(c, top.it.slot) + ': el ' + top.f.name + ' es el color más intenso y, sin él, el conjunto se queda en ' + (c.before.families.length > 1 ? 'menos familias de color' : 'neutros') + '.');
    }
    const hex = muted(top.it.hex, 12);
    return proposal(c, 'minimal', 'min-apagar', [{ slot: top.it.slot, hex }],
      'No hay en tu armario otra prenda de este tipo que encaje. Hipótesis: una versión apagada del ' + top.f.name + ' (' + nameOfHex(hex) + ') mantendría el tono con mucha menos intensidad.');
  },
  'min-tonal'(c) {
    const bottom = itemOf(c, 'bottom'), slot = itemOf(c, 'top') ? 'top' : itemOf(c, 'outer') ? 'outer' : null;
    if (!bottom || !bottom.hex || !slot) return null;
    const cur = relation(bottom.hex, itemOf(c, slot).hex);
    if (cur && (cur.kind === 'igual' || cur.kind === 'tonal' || (cur.kind === 'neutros' && cur.light !== 'alto'))) return null;
    const cands = realFor(c, slot).map((g) => ({ g, r: relation(bottom.hex, g.primary_color) }))
      .filter((x) => x.r && x.r.kind !== 'igual' && (x.r.kind === 'tonal' || (x.r.a.C < 15 && x.r.b.C < 15 && x.r.light !== 'alto')))
      .sort((a, b) => Math.abs(a.r.dL - 20) - Math.abs(b.r.dL - 20));
    if (!cands.length) return null;
    const x = cands[0];
    return proposal(c, 'minimal', 'min-tonal', [{ slot, garment: x.g }],
      'Cambia ' + fromText(c, slot) + ' por ' + garmentLabel(x.g) + ': ' + describeRelation(x.r).replace(/^./, (m) => m.toLowerCase()) + ' El conjunto se lee como un bloque con diferencia de luz.');
  },
  'eq-repetir'(c) {
    if (c.before.repetitions.length) return null;
    let best = null;
    // la repetición une ZONAS distintas: un calcetín que repite el pantalón o el calzado es continuidad, no repetición
    const NEIGHBOURS = { socks: ['bottom', 'shoes', 'socks'], accessory: ['accessory'], outer: ['outer'], top: ['top'] };
    ['accessory', 'socks', 'outer', 'top'].forEach((slot) => {
      const others = c.items.filter((it) => !NEIGHBOURS[slot].includes(it.slot));
      realFor(c, slot).forEach((g) => {
        [g.primary_color].concat(g.secondary_colors || []).forEach((hex) => others.forEach((it) => (it.colors || []).forEach((col) => {
          const d = colorDistance(hex, col.hex);
          if (d <= 10 && (!best || d < best.d)) best = { slot, g, d, hex: col.hex, from: it.label };
        })));
      });
    });
    if (best) {
      return proposal(c, 'balanced', 'eq-repetir', [{ slot: best.slot, garment: best.g }],
        (itemOf(c, best.slot) ? 'Cambia ' + fromText(c, best.slot) + ' por ' : 'Añade ') + garmentLabel(best.g) + ': repite el ' + nameOfHex(best.hex) + ' de ' + best.from.toLowerCase() + ' y une las dos zonas.');
    }
    const src = loudItems(c).find((x) => !['bottom', 'shoes', 'socks', 'accessory'].includes(x.it.slot)) || null;
    const slot = itemOf(c, 'socks') ? 'accessory' : 'socks';
    if (!src || src.it.slot === slot) return null;
    return proposal(c, 'balanced', 'eq-repetir', [{ slot, hex: src.it.hex }],
      'No tienes una prenda que repita colores del conjunto. Hipótesis: ' + (slot === 'socks' ? 'unos calcetines' : 'un accesorio') + ' en ' + src.f.name + ' repetirían el color de ' + src.it.label.toLowerCase() + '.');
  },
  'eq-reducir'(c) {
    if (c.before.accents.length < 2) return null;
    const acc = c.before.accents[c.before.accents.length - 1];
    const it = c.items.find((x) => x.colors.some((col) => colorDistance(col.hex, acc.hex) < 3));
    if (!it) return null;
    const keep = c.before.colors.filter((x) => x.role !== 'acento').map((x) => x.hex);
    const cands = realFor(c, it.slot).filter((g) => nearAny(g.primary_color, keep, 12))
      .sort((a, b) => Math.min(...keep.map((h) => colorDistance(a.primary_color, h))) - Math.min(...keep.map((h) => colorDistance(b.primary_color, h))));
    if (!cands.length) return null;
    return proposal(c, 'balanced', 'eq-reducir', [{ slot: it.slot, garment: cands[0] }],
      'Hay ' + c.before.accents.length + ' acentos compitiendo. Cambia ' + fromText(c, it.slot) + ' por ' + garmentLabel(cands[0]) + ': su color ya está en el conjunto y el ' + c.before.accents[0].name + ' queda como único foco.');
  },
  'eq-apoyo'(c) {
    if (c.before.families.length) return null;
    const dom = c.before.dominant;
    let best = null;
    ['top', 'outer', 'accessory'].forEach((slot) => realFor(c, slot).forEach((g) => {
      const f = colorFacts(g.primary_color);
      if (f.neutral || f.C < 15 || f.C > 45) return;
      if (!best || Math.abs(f.C - 28) < Math.abs(best.f.C - 28)) best = { slot, g, f };
    }));
    if (!best) return null;
    const r = relation(dom.hex, best.g.primary_color);
    return proposal(c, 'balanced', 'eq-apoyo', [{ slot: best.slot, garment: best.g }],
      'El conjunto es solo neutro. ' + (itemOf(c, best.slot) ? 'Cambia ' + fromText(c, best.slot) + ' por ' : 'Añade ') + garmentLabel(best.g) + ': un ' + best.f.name + ' apagado como color de apoyo (' + describeRelation(r).replace(/^.*?: /, '') + ')');
  },
  'cr-paleta'(c, opts) {
    const colors = c.before.colors.map((x) => ({ hex: x.hex, share: x.pct }));
    const pals = opts && opts.palette ? [{ palette: opts.palette }] : rankPalettes(colors, c.palettes, { limit: 12 })
      .sort((a, b) => ((b.palette.source_type === 'book') - (a.palette.source_type === 'book')));
    const present = outfitHexes(c);
    for (const r of pals) {
      const missing = (r.palette.colors || []).map((pc) => ({ hex: normalizeHex(pc.hex), name: pc.name })).filter((pc) => pc.hex && !nearAny(pc.hex, present, 15) && labToLch(hexToLab(pc.hex)).C >= 18);
      for (const m of missing) {
        for (const slot of ['accessory', 'socks', 'top', 'outer', 'shoes']) {
          const g = realFor(c, slot).filter((x) => colorDistance(x.primary_color, m.hex) <= 12).sort((a, b) => colorDistance(a.primary_color, m.hex) - colorDistance(b.primary_color, m.hex))[0];
          if (g) {
            return proposal(c, 'creative', 'cr-paleta', [{ slot, garment: g }],
              'La paleta «' + (r.palette.name || 'sin nombre') + '» ya comparte colores con el conjunto. ' + (itemOf(c, slot) ? 'Cambia ' + fromText(c, slot) + ' por ' : 'Añade ') + garmentLabel(g) +
              ': aporta el ' + (m.name || nameOfHex(m.hex)) + ' de la paleta, que el conjunto aún no usa.', { palette: r.palette, paletteHex: m.hex });
          }
        }
      }
      if (missing.length) {
        const m = missing[0], slot = itemOf(c, 'accessory') && !itemOf(c, 'socks') ? 'socks' : 'accessory';
        return proposal(c, 'creative', 'cr-paleta', [{ slot, hex: m.hex }],
          'La paleta «' + (r.palette.name || 'sin nombre') + '» ya comparte colores con el conjunto. Hipótesis: ' + (slot === 'socks' ? 'unos calcetines' : 'un accesorio') + ' en ' + (m.name || nameOfHex(m.hex)) +
          ' (no tienes una prenda de ese color) completaría la combinación.', { palette: r.palette, paletteHex: m.hex });
      }
    }
    return null;
  },
  'cr-acento'(c) {
    const anchor = c.before.colors.find((x) => !x.neutral && x.C >= 10) || c.before.dominant;
    const present = outfitHexes(c), cap = CHROMA_CAP[c.formality] + 10;
    let best = null;
    ['accessory', 'socks', 'top'].forEach((slot) => realFor(c, slot).forEach((g) => {
      const f = colorFacts(g.primary_color);
      if (f.C < 25 || f.C > cap + 15 || nearAny(f.hex, present, 15)) return;
      const r = relation(anchor.hex, f.hex);
      if (!['complementaria', 'contraste-tono', 'analoga', 'base-neutra'].includes(r.kind)) return;
      const rank = (r.kind === 'complementaria' ? 0 : r.kind === 'contraste-tono' ? 1 : 2) * 100 + Math.abs(f.C - 45) + SMALL.indexOf(slot) * 5;
      if (!best || rank < best.rank) best = { slot, g, r, rank };
    }));
    if (best) {
      return proposal(c, 'creative', 'cr-acento', [{ slot: best.slot, garment: best.g }],
        (itemOf(c, best.slot) ? 'Cambia ' + fromText(c, best.slot) + ' por ' : 'Añade ') + garmentLabel(best.g) + ': ' + describeRelation(best.r).replace(/^./, (m) => m.toLowerCase()) + ' En una prenda pequeña funciona como acento deliberado.');
    }
    const lch = { L: Math.max(35, Math.min(60, anchor.L)), C: Math.min(c.formality === 'formal' ? 28 : 42, Math.max(25, anchor.C)), h: (anchor.h + 180) % 360 };
    const hex = labToHex(lchToLab(lch)), slot = itemOf(c, 'accessory') && !itemOf(c, 'socks') ? 'socks' : 'accessory';
    return proposal(c, 'creative', 'cr-acento', [{ slot, hex }],
      'No hay en tu armario una prenda pequeña que contraste con el ' + anchor.name + '. Hipótesis calculada: ' + (slot === 'socks' ? 'unos calcetines' : 'un accesorio') + ' en ' + nameOfHex(hex) + ', el tono opuesto con la intensidad contenida.');
  },
  'cr-repetir'(c) {
    const acc = c.before.accents[0];
    if (!acc || c.before.repetitions.some((r) => colorDistance(r.hex, acc.hex) <= 10)) return null;
    for (const slot of ['socks', 'accessory', 'top']) {
      if (acc.slots.includes(slot)) continue;
      const g = realFor(c, slot).find((x) => [x.primary_color].concat(x.secondary_colors || []).some((h) => colorDistance(h, acc.hex) <= 10));
      if (g) return proposal(c, 'creative', 'cr-repetir', [{ slot, garment: g }], (itemOf(c, slot) ? 'Cambia ' + fromText(c, slot) + ' por ' : 'Añade ') + garmentLabel(g) + ': repite el ' + acc.name + ' en una segunda zona.');
    }
    return null;
  }
};
const ORDER = { minimal: ['min-apagar', 'min-tonal'], balanced: ['eq-reducir', 'eq-repetir', 'eq-apoyo'], creative: ['cr-paleta', 'cr-acento', 'cr-repetir'] };

/* Dos composiciones son la misma si tienen los mismos huecos y cada hueco conserva su color (ΔE00 ≤ 5). */
function sameSlots(a, b, garments) {
  const A = buildItems(a, garments), B = buildItems(b, garments);
  if (A.map((x) => x.slot).join() !== B.map((x) => x.slot).join()) return false;
  return A.every((x, i) => (x.hex && B[i].hex ? colorDistance(x.hex, B[i].hex) <= 5 : x.hex === B[i].hex));
}
/**
 * input: { slots, garments, palettes, formality }  ·  direction: 'minimal' | 'balanced' | 'creative'
 * → { direction, reading, kept, note, proposals: [ … ] }  (como mucho 2 propuestas distintas)
 * El borrador original no se toca: cada propuesta trae sus propios slots.
 */
export function proposeDirection(direction, input) {
  const dir = directionOf(direction);
  const c = context(input);
  if (!c.before.valid) return { direction: dir, kept: false, proposals: [], note: 'Elige al menos una prenda para explorar direcciones.' };
  const out = [];
  for (const move of ORDER[dir]) {
    if (out.length >= 2) break;
    const p = MOVE_FNS[move](c);
    if (!p || sameSlots(p.slots, c.slots, c.garments) || out.some((q) => sameSlots(q.slots, p.slots, c.garments))) continue;
    out.push(p);
  }
  const already = c.before.reading === dir;
  return {
    direction: dir, reading: c.before.reading, kept: !out.length,
    note: out.length ? (already ? 'El conjunto ya se lee ' + READING_LABEL[dir] + '; estas son variaciones dentro de la misma dirección.' : null)
      : already ? MOVES.mantener : 'Con tu armario actual no hay un cambio de una o dos prendas que lleve el conjunto en esta dirección sin inventar prendas.',
    proposals: out
  };
}

/* ═══════════ PALETAS COMO INSPIRACIÓN ═══════════ */
export const PALETTE_ROLE = { tonal: 'Tonal', apoyo: 'De apoyo', contraste: 'De contraste' };
/**
 * Cada color de la paleta frente al conjunto: si ya está (y en qué prenda), qué prenda real de tu armario
 * podría representarlo (ΔE00 ≤ 12) y qué papel cumpliría respecto al color dominante.
 */
export function adaptPalette(palette, input) {
  const c = context(input);
  const dom = c.before.valid ? c.before.dominant.hex : null;
  const entries = [];
  c.items.forEach((it) => (it.colors || []).forEach((col) => entries.push({ hex: col.hex, slot: it.slot, label: it.label })));
  return (palette.colors || []).map((pc, i) => {
    const hex = normalizeHex(pc.hex);
    if (!hex) return null;
    let present = null;
    entries.forEach((e) => { const d = colorDistance(e.hex, hex); if (d <= 10 && (!present || d < present.dE)) present = Object.assign({ dE: d }, e); });
    let candidate = null;
    if (!present) {
      c.garments.forEach((g) => {
        if (c.used.has(g.id)) return;
        const d = colorDistance(g.primary_color, hex);
        const slot = SLOTS.find((s) => s.categories.includes(g.category));
        if (slot && d <= 12 && (!candidate || d < candidate.dE)) candidate = { garment: g, slot: slot.id, label: slot.label, dE: d };
      });
    }
    let role = null;
    if (dom) {
      const r = relation(dom, hex);
      // tonos apagados con poca diferencia de luz acompañan aunque sus tonos se opongan (marino y marrón)
      role = r.kind === 'igual' || r.kind === 'tonal' ? 'tonal' : r.light === 'alto' || ((r.kind === 'complementaria' || r.kind === 'contraste-tono') && !r.muted) ? 'contraste' : 'apoyo';
    }
    return { index: i, hex, name: pc.name || nameOfHex(hex), original: pc.original || null, present, candidate, role };
  }).filter(Boolean);
}
/** Propuesta creativa a partir de una paleta concreta (para «Comparar» desde las referencias). */
export function proposeFromPalette(palette, input) {
  const c = context(input);
  if (!c.before.valid) return null;
  const p = MOVE_FNS['cr-paleta'](c, { palette });
  return p && !sameSlots(p.slots, c.slots, c.garments) ? p : null;
}
