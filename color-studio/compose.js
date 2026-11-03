/* ═══════════════════════════════════════════════
   color-studio/compose.js: composición cromática y direcciones (Minimalista · Equilibrada · Creativa)
   ─────────────────────────────────────────────────
   Módulo ES sin DOM. Tres capas separadas a propósito:
     1. HECHOS calculados: luminosidad, croma, tono, temperatura aproximada, ΔE00, superficie estimada.
     2. CRITERIOS de estilismo con nombre (MOVES): convenciones explícitas, no leyes. Cada propuesta
        cita el suyo y sus frases solo describen lo que el criterio hace de verdad.
     3. LECTURA: «más cerca de lo minimalista / equilibrado / creativo», derivada de los hechos con
        umbrales documentados. Es una orientación, nunca una nota ni un porcentaje.
   Las propuestas cambian una o dos prendas por otras REALES del armario (dos a la vez solo si con una no basta). Cuando no hay prenda
   que encaje, el color se ofrece como HIPOTÉTICO (hypothetical: true) y la interfaz lo dice:
   nunca se presenta como algo que ya tienes.
   ═══════════════════════════════════════════════ */
import { normalizeHex, colorDistance, describeColor, hexToLab, labToLch, lchToLab, labToHex, rankPalettes, SLOTS, SLOT, garmentColorParts, estimateDistribution, paletteAffinity, byAffinity, similarityLevel, SIMILARITY, SIMILARITY_LABEL, garmentTypeInfo, garmentType } from './engine.js?v=0ea937e1d8';

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
const factsCache = new Map();            // las 159 tintas de Wada y las prendas se repiten en cada repintado
export function colorFacts(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  let f = factsCache.get(n);
  if (!f) {
    const lch = labToLch(hexToLab(n)), d = describeColor(n);
    f = Object.freeze({ hex: n, L: lch.L, C: lch.C, h: lch.h, family: d.family, neutral: d.neutral, name: d.name, temperature: temperatureOf(lch.C, lch.h) });
    if (factsCache.size > 4000) factsCache.clear();
    factsCache.set(n, f);
  }
  return Object.assign({}, f);           // copia: quien la recibe puede añadir campos (pct, role…)
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
  'biblioteca': 'Acercar el conjunto a una combinación de tu Biblioteca que ya representa en parte: una prenda real de tu armario completa el color que le falta.',
  'par-prendas': 'Cuando ningún cambio de una sola prenda lleva el conjunto a la dirección, probar parejas de prendas reales y quedarse con la que lo consigue alterando menos el conjunto.',
  'mantener': 'El conjunto ya cumple los criterios de esta dirección: no se fuerza un cambio.'
};
const SMALL = ['accessory', 'socks', 'inner', 'top', 'outer'];
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
    const NEIGHBOURS = { socks: ['bottom', 'shoes', 'socks'], accessory: ['accessory'], outer: ['outer'], top: ['top'], inner: ['inner'] };
    ['accessory', 'socks', 'inner', 'outer', 'top'].forEach((slot) => {
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
    ['top', 'inner', 'outer', 'accessory'].forEach((slot) => realFor(c, slot).forEach((g) => {
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
    const byBook = (a, b) => ((b.palette.source_type === 'book') - (a.palette.source_type === 'book'));
    let pals = opts && opts.palette ? [{ palette: opts.palette, family: !!opts.family }] : rankPalettes(colors, c.palettes, { limit: 12 }).sort(byBook);
    if (!(opts && opts.palette)) {
      pals = pals.concat(rankPalettesByFamily(colors, c.palettes, { limit: 12, exclude: pals.map((r) => r.palette) }).sort(byBook).map((r) => Object.assign({ family: true }, r)));
    }
    const present = outfitHexes(c);
    for (const r of pals) {
      const missing = (r.palette.colors || []).map((pc) => ({ hex: normalizeHex(pc.hex), name: pc.name })).filter((pc) => pc.hex && !nearAny(pc.hex, present, 15) && labToLch(hexToLab(pc.hex)).C >= 18);
      for (const m of missing) {
        for (const slot of ['accessory', 'socks', 'inner', 'top', 'outer', 'shoes']) {
          const g = realFor(c, slot).filter((x) => colorDistance(x.primary_color, m.hex) <= 12).sort((a, b) => colorDistance(a.primary_color, m.hex) - colorDistance(b.primary_color, m.hex))[0];
          if (g) {
            return proposal(c, 'creative', 'cr-paleta', [{ slot, garment: g }],
              'La paleta «' + (r.palette.name || 'sin nombre') + '» ' + (r.family ? 'comparte familias de color con el conjunto (no colores exactos). ' : 'ya comparte colores con el conjunto. ') + (itemOf(c, slot) ? 'Cambia ' + fromText(c, slot) + ' por ' : 'Añade ') + garmentLabel(g) +
              ': aporta el ' + (m.name || nameOfHex(m.hex)) + ' de la paleta, que el conjunto aún no usa.', { palette: r.palette, paletteHex: m.hex });
          }
        }
      }
      if (missing.length) {
        const m = missing[0], slot = itemOf(c, 'accessory') && !itemOf(c, 'socks') ? 'socks' : 'accessory';
        return proposal(c, 'creative', 'cr-paleta', [{ slot, hex: m.hex }],
          'La paleta «' + (r.palette.name || 'sin nombre') + '» ' + (r.family ? 'comparte familias de color con el conjunto (no colores exactos). ' : 'ya comparte colores con el conjunto. ') + 'Hipótesis: ' + (slot === 'socks' ? 'unos calcetines' : 'un accesorio') + ' en ' + (m.name || nameOfHex(m.hex)) +
          ' (no tienes una prenda de ese color) completaría la combinación.', { palette: r.palette, paletteHex: m.hex });
      }
    }
    return null;
  },
  'cr-acento'(c) {
    const anchor = c.before.colors.find((x) => !x.neutral && x.C >= 10) || c.before.dominant;
    const present = outfitHexes(c), cap = CHROMA_CAP[c.formality] + 10;
    let best = null;
    ['accessory', 'socks', 'inner', 'top'].forEach((slot) => realFor(c, slot).forEach((g) => {
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
    for (const slot of ['socks', 'accessory', 'inner', 'top']) {
      if (acc.slots.includes(slot)) continue;
      const g = realFor(c, slot).find((x) => [x.primary_color].concat(x.secondary_colors || []).some((h) => colorDistance(h, acc.hex) <= 10));
      if (g) return proposal(c, 'creative', 'cr-repetir', [{ slot, garment: g }], (itemOf(c, slot) ? 'Cambia ' + fromText(c, slot) + ' por ' : 'Añade ') + garmentLabel(g) + ': repite el ' + acc.name + ' en una segunda zona.');
    }
    return null;
  }
};
/* ── Biblioteca como referencia común (dirección, sugerencias y calcetines usan paletteAffinity) ──
   Colores del conjunto con su superficie estimada → afinidad con cada paleta. Una paleta encaja con una dirección por su
   propio carácter: minimalista = colores sobrios (croma medio < 28 y ninguno > 45); creativa = al menos un color intenso
   (croma ≥ 35); equilibrada = cualquiera. */
const LIB_TRY = 12, LIB_PER_SLOT = 3;
export function outfitColorsOf(analysis) { return analysis && analysis.valid ? analysis.colors.map((x) => ({ hex: x.hex, share: x.pct })) : []; }
function paletteFits(p, dir) {
  const cs = (p.colors || []).map((x) => colorFacts(x.hex)).filter(Boolean);
  if (cs.length < 2) return false;
  const meanC = cs.reduce((t, x) => t + x.C, 0) / cs.length;
  if (dir === 'minimal') return meanC < 28 && cs.every((x) => x.C <= 45);
  if (dir === 'creative') return cs.some((x) => x.C >= 35);
  return true;
}
/** La paleta de la Biblioteca que mejor representa unos colores (solo si la representa de verdad: valid). */
export function libraryReference(colors, palettes, opts = {}) {
  let best = null;
  (palettes || []).forEach((p) => {
    if ((p.colors || []).length < 2 || (opts.filter && !opts.filter(p))) return;
    const a = paletteAffinity(p, colors, opts);
    if (a.valid && (!best || byAffinity(a, best.affinity) < 0)) best = { palette: p, affinity: a };
  });
  return best;
}
MOVE_FNS.biblioteca = function (c, dir) {
  const now = outfitColorsOf(c.before);
  if (!now.length || !c.palettes.length) return null;
  const ranked = c.palettes.filter((p) => paletteFits(p, dir)).map((p) => ({ p, a: paletteAffinity(p, now, { maxOff: 1 }) }))
    // ya relacionada (≥ 1 color) pero aún sin representarla del todo (con el criterio por defecto de paletteAffinity)
    .filter((r) => r.a.covered >= 1 && !paletteAffinity(r.p, now).valid).sort((x, y) => byAffinity(x.a, y.a)).slice(0, LIB_TRY);
  let best = null;
  for (const r of ranked) {
    const missing = r.a.paletteLinks.filter((l) => l.level === 'none').map((l) => l.hex);
    if (!missing.length) continue;
    for (const slot of ['top', 'inner', 'outer', 'bottom', 'shoes', 'accessory']) {
      const cands = realFor(c, slot).map((g) => ({ g, d: Math.min(...missing.map((h) => colorDistance(g.primary_color, h))) }))
        .filter((x) => x.d <= SIMILARITY.RELATED).sort((x, y) => x.d - y.d).slice(0, LIB_PER_SLOT);
      for (const x of cands) {
        const p = proposal(c, dir, 'biblioteca', [{ slot, garment: x.g }], '');
        if (!p.after.valid || (dir !== 'balanced' && p.after.reading !== dir)) continue;
        const a = paletteAffinity(r.p, outfitColorsOf(p.after));
        if (!a.valid) continue;
        if (!best || byAffinity(a, best.a) < 0) best = { p, a, palette: r.p, before: r.a, slot, g: x.g };
      }
    }
    if (best && best.a.level !== 'related') break;            // ya hay una muy buena: no hace falta seguir buscando
  }
  if (!best) return null;
  const name = best.palette.name || 'sin nombre';
  best.p.explanation = 'La combinación «' + name + '» de tu Biblioteca ya está en ' + best.before.covered + ' de sus ' + (best.palette.colors || []).length + ' colores. ' +
    (itemOf(c, best.slot) ? 'Cambia ' + fromText(c, best.slot) + ' por ' : 'Añade ') + garmentLabel(best.g) + ': el conjunto pasa a representarla (similitud ' + SIMILARITY_LABEL[best.a.level].toLowerCase() + ').';
  best.p.palette = best.palette;
  return best.p;
};
/* ── Dos prendas a la vez (auditoría CS-22) ──
   Solo cuando el conjunto aún no se lee en la dirección y ningún cambio de UNA prenda real lo consigue.
   Poda: en cada hueco ocupado se prueban como mucho PAIR_K prendas reales, las más prometedoras para la
   dirección (minimalista: las más apagadas; equilibrada: las que repiten un color de otra zona; creativa:
   las más intensas sin pasarse del contexto), y como mucho PAIR_MAX combinaciones. De las que alcanzan la
   lectura, gana la que menos cambia la intensidad media; los empates se resuelven por orden de prueba. */
const PAIR_K = 4, PAIR_MAX = 240;
function pairCandidates(c, dir, slot) {
  const others = c.items.filter((it) => it.slot !== slot).flatMap((it) => (it.colors || []).map((x) => x.hex));
  const key = (g) => {
    const f = colorFacts(g.primary_color);
    if (dir === 'minimal') return (f.neutral ? 0 : 100) + f.C;
    if (dir === 'balanced') return others.length ? Math.min(...others.map((h) => colorDistance(h, g.primary_color))) : f.C;
    return f.C > CHROMA_CAP[c.formality] + 25 ? 1000 : -f.C;
  };
  return realFor(c, slot).map((g) => ({ g, k: key(g) })).sort((a, b) => a.k - b.k).slice(0, PAIR_K).map((x) => x.g);
}
function pairMove(c, dir) {
  if (c.before.reading === dir) return null;
  const slots = c.items.filter((it) => !it.lost).map((it) => it.slot);
  const cands = Object.fromEntries(slots.map((s) => [s, pairCandidates(c, dir, s)]));
  let best = null, tried = 0;
  for (let i = 0; i < slots.length && tried < PAIR_MAX; i++) {
    for (let j = i + 1; j < slots.length && tried < PAIR_MAX; j++) {
      for (const ga of cands[slots[i]]) {
        for (const gb of cands[slots[j]]) {
          if (++tried > PAIR_MAX) break;
          const next = JSON.parse(JSON.stringify(c.slots));
          [[slots[i], ga], [slots[j], gb]].forEach(([s, g]) => { next[s] = { weight: next[s].weight, garment_id: g.id, hex: null }; });
          const a = analyzeOutfit(buildItems(next, c.garments));
          if (!a.valid || a.reading !== dir) continue;
          const cost = Math.abs(a.weightedC - c.before.weightedC);
          if (!best || cost < best.cost) best = { cost, a, changes: [{ slot: slots[i], garment: ga }, { slot: slots[j], garment: gb }] };
        }
      }
    }
  }
  if (!best) return null;
  const a = best.a, [x, y] = best.changes;
  const why = dir === 'minimal' ? 'quedan neutros o tonos apagados, sin acentos que compitan.'
    : dir === 'balanced' ? 'un color manda' + (a.repetitions.length ? ' y el ' + a.repetitions[0].name + ' se repite entre prendas.' : ' y como mucho queda un acento.')
    : a.accents.length ? 'el ' + a.accents[0].name + ' queda como acento deliberado.' : 'aparece un contraste de tono entre superficies grandes.';
  return proposal(c, dir, 'par-prendas', best.changes,
    'Con un solo cambio de tu armario el conjunto no llega a leerse ' + READING_LABEL[dir] + '. Cambia ' + fromText(c, x.slot) + ' por ' + garmentLabel(x.garment) +
    ' y ' + fromText(c, y.slot) + ' por ' + garmentLabel(y.garment) + ': ' + why);
}
const ORDER = { minimal: ['biblioteca', 'min-apagar', 'min-tonal'], balanced: ['biblioteca', 'eq-reducir', 'eq-repetir', 'eq-apoyo'], creative: ['biblioteca', 'cr-paleta', 'cr-acento', 'cr-repetir'] };

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
// la tarjeta de dirección y «Qué prenda te falta» piden lo mismo en cada repintado: se recuerda el último resultado por dirección
const dirMemo = new Map();
export function proposeDirection(direction, input) {
  const key = directionOf(direction) + '#' + JSON.stringify(input.slots || {}) + '#' + (input.formality || '') + '#' +
    (input.garments || []).map((g) => g.id + g.category + g.primary_color + (g.secondary_colors || []).join('') + (g.color_shares || []).join(',')).join('|') + '#' +
    (input.palettes || []).map((p) => p.id + (p.colors || []).map((c) => c.hex).join('')).join('|');
  if (dirMemo.has(key)) return dirMemo.get(key);
  const r = proposeDirectionRaw(direction, input);
  if (dirMemo.size > 12) dirMemo.clear();
  dirMemo.set(key, r);
  return r;
}
function proposeDirectionRaw(direction, input) {
  const dir = directionOf(direction);
  const c = context(input);
  if (!c.before.valid) return { direction: dir, kept: false, proposals: [], note: 'Elige al menos una prenda para explorar direcciones.' };
  const out = [];
  const fresh = (p) => p && !sameSlots(p.slots, c.slots, c.garments) && !out.some((q) => sameSlots(q.slots, p.slots, c.garments));
  for (const move of ORDER[dir]) {
    if (out.length >= 2) break;
    const p = MOVE_FNS[move](c, dir);
    if (fresh(p)) out.push(p);
  }
  // dos prendas reales a la vez si ningún cambio de una prenda real alcanza la dirección; ocupa un hueco libre
  // o sustituye a una propuesta hipotética (las prendas que tienes van antes que un color que no tienes)
  if (!out.some((p) => !p.hypothetical && p.after.reading === dir)) {
    const pair = pairMove(c, dir);
    if (fresh(pair)) {
      const hypo = out.findIndex((p) => p.hypothetical);
      if (out.length < 2) out.push(pair); else if (hypo >= 0) out.splice(hypo, 1, pair);
    }
  }
  const already = c.before.reading === dir;
  // referencia de la Biblioteca de cada propuesta (la misma medida que las sugerencias y los calcetines)
  out.forEach((p) => { if (!p.reference) p.reference = libraryReference(outfitColorsOf(p.after), c.palettes); });
  return {
    direction: dir, reading: c.before.reading, kept: !out.length, reference: libraryReference(outfitColorsOf(c.before), c.palettes),
    note: out.length ? (already ? 'El conjunto ya se lee ' + READING_LABEL[dir] + '; estas son variaciones dentro de la misma dirección.' : null)
      : already ? MOVES.mantener : 'Con tu armario actual no hay un cambio de una o dos prendas que lleve el conjunto en esta dirección sin inventar prendas.',
    proposals: out
  };
}

/* ═══════════ QUÉ PRENDA TE FALTA (auditoría CS-22) ═══════════
   Se deduce de las propuestas HIPOTÉTICAS de las tres direcciones para este conjunto: cada una es un color que
   no tienes en ese tipo de prenda y que haría posible la propuesta. Se agrupan por hueco y color (ΔE00 ≤ 10).
   No valora el armario ni sugiere comprar: dice qué color, en qué hueco, desbloquearía qué dirección y por qué. */
export function wardrobeGaps(input) {
  const out = [];
  DIRECTIONS.forEach((d) => {
    proposeDirection(d.id, input).proposals.forEach((p) => p.changes.filter((ch) => ch.hypothetical).forEach((ch) => {
      const g = out.find((x) => x.slot === ch.slot && colorDistance(x.hex, ch.hex) <= 10);
      if (g) { if (!g.directions.includes(d.id)) g.directions.push(d.id); return; }
      out.push({ slot: ch.slot, label: ch.label, hex: ch.hex, name: ch.name, directions: [d.id], move: p.move, rule: p.rule, explanation: p.explanation });
    }));
  });
  return out.sort((a, b) => (b.directions.length - a.directions.length));
}

/* ═══════════ PALETAS COMO INSPIRACIÓN ═══════════ */
/* Relación por familia (auditoría CS-07): con un armario sobrio, pocas paletas tienen colores a ΔE00 ≤ 10 de las
   prendas. Esta relación más laxa empareja cada color del conjunto con un color de la paleta de la MISMA familia
   cromática y luminosidad parecida (|ΔL| ≤ 15). Exige al menos dos colores emparejados (con colores distintos
   de la paleta) y siempre se presenta como «relación por familia», nunca como coincidencia de color. */
export const FAMILY_DL = 15;
export function rankPalettesByFamily(colors, palettes, opts = {}) {
  const outfit = (colors || []).map((c) => normalizeHex(c.hex)).filter(Boolean).map((hex) => colorFacts(hex));
  const exclude = new Set((opts.exclude || []).map((p) => p.id));
  return (palettes || []).filter((p) => !exclude.has(p.id)).map((p) => {
    const pc = (p.colors || []).map((c, i) => ({ f: colorFacts(c.hex), i, name: c.name })).filter((x) => x.f);
    const links = [];
    outfit.forEach((o) => {
      let best = null;
      pc.forEach((x) => {
        const dL = Math.abs(x.f.L - o.L);
        if (x.f.family !== o.family || dL > FAMILY_DL) return;
        const dE = colorDistance(o.hex, x.f.hex);
        if (!best || dE < best.dE) best = { hex: o.hex, paletteIndex: x.i, paletteHex: x.f.hex, paletteName: x.name || x.f.name, dE, dL, sameFamily: true, family: o.family };
      });
      if (best) links.push(best);
    });
    const indexes = [...new Set(links.map((l) => l.paletteIndex))];
    return { palette: p, match: { kind: 'family', links, connected: indexes.length, paletteIndexes: indexes.sort((a, b) => a - b),
      meanDE: links.length ? links.reduce((t, l) => t + l.dE, 0) / links.length : Infinity } };
  }).filter((r) => r.match.connected >= 2)
    .sort((x, y) => (y.match.connected - x.match.connected) || (x.match.meanDE - y.match.meanDE))
    .slice(0, opts.limit || 50);
}
/** Frases que explican una relación por familia. */
export function explainFamilyMatch(match) {
  return match.links.map((l) => colorFacts(l.hex).name + ' (' + l.hex + ') y el ' + l.paletteName + ' de la paleta (' + l.paletteHex + ') son de la misma familia con luminosidad parecida; no son el mismo color (ΔE00 ' +
    l.dE.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ').');
}

export const PALETTE_ROLE = { tonal: 'Tonal', apoyo: 'De apoyo', contraste: 'De contraste' };

/* ═══════════ COLORES → PRENDAS DE TU ARMARIO ═══════════
   Para reproducir una referencia (una inspiración o una paleta) con tu ropa no basta con la prenda de color más próximo:
   el color del pantalón tiene que buscarse entre tus pantalones, no entre tus zapatillas. Reglas:
   · Si el color lleva la prenda escrita (etiqueta del cuentagotas: «Pantalón», «Calzado», «Camisa bajo el jersey»…), solo
     se busca en ese tipo de prenda (slotFromLabel). Sin una prenda de ese tipo y color, se dice: no se cambia de tipo.
   · Sin etiqueta, se monta un conjunto coherente: cada prenda una sola vez y como mucho una por hueco (no dos calzados),
     emparejando primero lo más próximo (ΔE00 ≤ 12). Un color con mucha presencia en la foto (≥ 12 %) no se asigna a
     calcetines ni a accesorios, que ocupan poco; los colores etiquetados se reparten antes que los demás. */
const LABEL_RULES = [
  ['socks', /calcet/],
  ['inner', /interior|debajo|bajo (el|la) /],
  ['outer', /abrigo|chaquet|cazadora|american|blazer|gabardin|parka|plum[ií]fero|sobrecamisa|chaleco|anorak|trenca/],
  ['shoes', /calzado|zapat|bota|botin|deportiv|sneaker|mocas[ií]n|sandalia|n[aá]utic|alpargat|oxford|derby|loafer|tenis/],
  ['bottom', /pantal[oó]n|vaquer|jean|chino|falda|bermuda|short|jogger|cargo/],
  ['accessory', /accesorio|cintur[oó]n|bufanda|gorr|sombrero|bolso|mochila|corbata|pañuelo|reloj|gafas|cartera|guante/],
  ['top', /camis|jersey|su[eé]ter|polo|sudadera|blusa|top\b|c[aá]rdigan|rebeca|punto|cuello/]
];
/** Hueco del Studio que corresponde a lo escrito en una etiqueta («Pantalón» → bottom). null si no se reconoce. */
export function slotFromLabel(text) {
  const info = garmentTypeInfo(text);                 // un tipo de la lista fija: correspondencia exacta
  if (info) return info.slot;
  const t = String(text || '').toLowerCase().normalize('NFC');
  if (!t.trim()) return null;
  const hit = LABEL_RULES.find(([, re]) => re.test(t));
  return hit ? hit[0] : null;
}
/**
 * Empareja colores con prendas reales respetando el tipo de prenda.
 * colors: [{ hex, label?, weight? }] · garments: armario · opts.exclude: ids de prendas que no se pueden usar
 * → por cada color, en el mismo orden: { hex, slot (pedido por la etiqueta o el de la prenda elegida), bySlot ('label' | null),
 *   candidate: { garment, slot, label, dE } | null }
 */
export function matchColorsToWardrobe(colors, garments, opts = {}) {
  const exclude = new Set(opts.exclude || []), tol = opts.tolerance || SIMILARITY.RELATED;
  const rows = (colors || []).map((c) => ({ hex: normalizeHex(c.hex), wanted: slotFromLabel(c.label), type: (garmentTypeInfo(c.label) || {}).label || null, weight: Number(c.weight) || 0 }));
  const pairs = [];
  rows.forEach((r, i) => {
    if (!r.hex) return;
    (garments || []).forEach((g) => {
      if (exclude.has(g.id) || !normalizeHex(g.primary_color)) return;
      const d = colorDistance(g.primary_color, r.hex);
      if (d > tol) return;
      SLOTS.filter((s) => s.categories.includes(g.category)).forEach((s) => {
        if (r.wanted && s.id !== r.wanted) return;                                   // la etiqueta manda
        if (!r.wanted && r.weight >= 12 && (s.id === 'socks' || s.id === 'accessory')) return;
        // sin etiqueta, una camisa o camiseta va antes como parte superior que como interior, y lo pequeño, al final
        // con un tipo de la lista (Deportiva, Mocasín…), una prenda de ese mismo tipo va antes que otra del mismo hueco
        const cost = d + (r.wanted ? (r.type && garmentType(g) !== r.type ? 6 : 0) : (s.id === 'inner' ? 2 : 0) + (s.id === 'socks' || s.id === 'accessory' ? 4 : 0));
        pairs.push({ i, g, slot: s.id, d, cost, labeled: !!r.wanted });
      });
    });
  });
  pairs.sort((a, b) => (b.labeled - a.labeled) || (a.cost - b.cost));
  const done = new Set(), usedG = new Set(), usedS = new Set(), pick = {};
  pairs.forEach((p) => {
    if (done.has(p.i) || usedG.has(p.g.id) || usedS.has(p.slot)) return;
    done.add(p.i); usedG.add(p.g.id); usedS.add(p.slot);
    pick[p.i] = { garment: p.g, slot: p.slot, label: SLOT[p.slot].label, dE: p.d };
  });
  return rows.map((r, i) => ({ hex: r.hex, slot: r.wanted || (pick[i] ? pick[i].slot : null), bySlot: r.wanted ? 'label' : null, candidate: pick[i] || null }));
}

/**
 * Cada color de la paleta frente al conjunto: si ya está (y en qué prenda), qué prenda real de tu armario
 * podría representarlo (ΔE00 ≤ 12, respetando el tipo de prenda: ver matchColorsToWardrobe) y qué papel cumpliría
 * respecto al color dominante.
 */
export function adaptPalette(palette, input) {
  const c = context(input);
  const dom = c.before.valid ? c.before.dominant.hex : null;
  const entries = [];
  c.items.forEach((it) => (it.colors || []).forEach((col) => entries.push({ hex: col.hex, slot: it.slot, label: it.label })));
  const rows = (palette.colors || []).map((pc, i) => {
    const hex = normalizeHex(pc.hex);
    if (!hex) return null;
    let present = null;
    entries.forEach((e) => { const d = colorDistance(e.hex, hex); if (d <= 10 && (!present || d < present.dE)) present = Object.assign({ dE: d }, e); });
    if (!present && input.family) {          // relación por familia: misma familia y luminosidad parecida (no el mismo color)
      const f = colorFacts(hex);
      entries.forEach((e) => {
        const g = colorFacts(e.hex), d = colorDistance(e.hex, hex);
        if (g.family === f.family && Math.abs(g.L - f.L) <= FAMILY_DL && (!present || d < present.dE)) present = Object.assign({ dE: d, family: true }, e);
      });
    }
    let role = null;
    if (dom) {
      const r = relation(dom, hex);
      // tonos apagados con poca diferencia de luz acompañan aunque sus tonos se opongan (marino y marrón)
      role = r.kind === 'igual' || r.kind === 'tonal' ? 'tonal' : r.light === 'alto' || ((r.kind === 'complementaria' || r.kind === 'contraste-tono') && !r.muted) ? 'contraste' : 'apoyo';
    }
    return { index: i, hex, name: pc.name || nameOfHex(hex), original: pc.original || null, label: pc.label || null, weight: pc.weight, present, candidate: null, wanted: null, role };
  }).filter(Boolean);
  // los colores que el conjunto aún no tiene se reparten entre tus prendas como un conjunto: tipo de prenda respetado,
  // sin repetir prenda ni hueco, y sin las prendas que ya llevas
  const missing = rows.filter((r) => !r.present);
  const match = matchColorsToWardrobe(missing.map((r) => ({ hex: r.hex, label: r.label, weight: r.weight })), c.garments, { exclude: [...c.used] });
  missing.forEach((r, k) => { r.candidate = match[k].candidate; r.wanted = match[k].bySlot ? match[k].slot : null; });
  return rows;
}
/** Propuesta creativa a partir de una paleta concreta (para «Comparar» desde las referencias). */
export function proposeFromPalette(palette, input) {
  const c = context(input);
  if (!c.before.valid) return null;
  const p = MOVE_FNS['cr-paleta'](c, { palette, family: !!input.family });
  return p && !sameSlots(p.slots, c.slots, c.garments) ? p : null;
}

/* ═══════════ FIGURA DEL OUTFIT (figurín) ═══════════
   Una combinación de la Biblioteca no dice qué color va en qué prenda ni cuánto ocupa (el libro no da proporciones).
   El figurín propone un reparto y la persona lo cambia prenda a prenda:
   · Etiquetas primero: si un color se llama como una prenda (los que vienen de Inspiración llevan la etiqueta del
     cuentagotas: «Pantalón», «Calzado»…), va en esa prenda (slotFromLabel).
   · El resto, por sobriedad, la convención de «base, apoyo y acento»: el color con menos croma va en las prendas grandes
     y el más intenso en las pequeñas (un blanco o un crudo cuenta como apoyo, no como base).
   · Calcetines: siempre en el figurín; por defecto, del color del pantalón (continuidad), y se pueden cambiar.
   · Porcentajes = superficie aproximada de cada prenda en el dibujo (FIGURE_AREA), sumada por color. Son ILUSTRATIVOS. */
export const FIGURE_SLOTS = ['outer', 'top', 'bottom', 'socks', 'shoes', 'accessory'];
export const FIGURE_OPTIONAL = ['outer', 'accessory'];
// prenda → índice del color por sobriedad, según el número de colores (los calcetines siguen al pantalón)
const FIGURE_MAP = {
  1: { outer: 0, top: 0, bottom: 0, shoes: 0 },
  2: { outer: 0, top: 1, bottom: 0, shoes: 1 },
  3: { outer: 0, top: 2, bottom: 1, shoes: 0 },
  4: { outer: 0, top: 2, bottom: 1, shoes: 3 },
  5: { outer: 0, top: 2, bottom: 1, shoes: 3, accessory: 4 },
  6: { outer: 0, top: 2, bottom: 1, shoes: 3, accessory: 4, socks: 5 }
};
export const FIGURE_AREA = { outer: 34, top: 13, bottom: 33, socks: 3, shoes: 7, accessory: 3 };   // superficie dibujada (aprox.)
// calzado: además de los colores de la paleta, los habituales en un armario (no son de la combinación y se dice)
export const SHOE_COLORS = [{ name: 'negro', hex: '#1C1C1C' }, { name: 'blanco', hex: '#F3F2EE' }, { name: 'marrón', hex: '#5A3A24' }];
const SHOE_EXTRA = Object.fromEntries(SHOE_COLORS.map((c) => [c.hex, c]));
/**
 * Figurín de una paleta. assignment opcional: { slot: índice del color en la paleta | null } (null = sin esa prenda; solo
 * prenda exterior y accesorio son opcionales). Sin él, la propuesta automática (etiquetas y sobriedad).
 * → { garments: [{ slot, hex, share }], colors: [{ hex, name, share, slots, index }], assignment, auto, illustrative: true }
 */
export function paletteFigure(palette, assignment) {
  const cols = (palette && palette.colors || []).map((c, index) => { const f = colorFacts(c.hex); if (!f) return null; if (c.name) f.name = c.name; f.index = index; f.label = c.name || c.label || null; return f; }).filter(Boolean);
  if (!cols.length) return { garments: [], colors: [], assignment: {}, auto: true, illustrative: true };
  const auto = defaultAssignment(cols);
  const asg = {};
  FIGURE_SLOTS.forEach((slot) => {
    const v = assignment && slot in assignment ? assignment[slot] : auto[slot];
    // el calzado admite también negro, blanco o marrón (su HEX en lugar del índice de un color de la paleta)
    asg[slot] = v == null ? (FIGURE_OPTIONAL.includes(slot) ? null : auto[slot]) : cols.some((c) => c.index === v) || (slot === 'shoes' && SHOE_EXTRA[v]) ? v : auto[slot];
  });
  const byIndex = Object.fromEntries(cols.map((c) => [c.index, c]));
  if (SHOE_EXTRA[asg.shoes]) byIndex[asg.shoes] = Object.assign({ index: asg.shoes, extra: true }, SHOE_EXTRA[asg.shoes]);
  const area = Object.assign({}, FIGURE_AREA);
  if (asg.outer == null) { area.top += area.outer; area.outer = 0; }          // sin prenda exterior, la parte superior se ve entera
  const garments = FIGURE_SLOTS.filter((slot) => asg[slot] != null).map((slot) => ({ slot, hex: byIndex[asg[slot]].hex, index: asg[slot], area: area[slot] }));
  const total = garments.reduce((t, g) => t + g.area, 0) || 1;
  garments.forEach((g) => { g.share = g.area / total * 100; });
  const list = cols.concat(SHOE_EXTRA[asg.shoes] ? [byIndex[asg.shoes]] : []);
  const colors = list.map((f) => ({ hex: f.hex, name: f.name, index: f.index, extra: !!f.extra, share: garments.filter((g) => g.index === f.index).reduce((t, g) => t + g.share, 0), slots: garments.filter((g) => g.index === f.index).map((g) => g.slot) }));
  const isAuto = FIGURE_SLOTS.every((slot) => asg[slot] === auto[slot]);
  return { garments: garments.map((g) => ({ slot: g.slot, hex: g.hex, share: g.share })), colors, assignment: asg, auto: isAuto, illustrative: true };
}
function defaultAssignment(cols) {
  // sobriedad = croma; un blanco o un crudo (L > 85) cuenta como apoyo, no como base (convención: la camisa clara, no el abrigo)
  const sober = (f) => f.C + (f.L > 85 ? 25 : 0);
  const sorted = cols.slice().sort((a, b) => (sober(a) - sober(b)) || (a.L - b.L) || (a.index - b.index)).slice(0, 6);
  const map = FIGURE_MAP[sorted.length], asg = { outer: null, accessory: null };
  Object.keys(map).forEach((slot) => { asg[slot] = sorted[map[slot]].index; });
  // etiquetas: un color que se llama como una prenda va en ella (la parte de dentro cuenta como parte superior)
  let labeled = false;
  cols.forEach((f) => { let slot = slotFromLabel(f.label); if (slot === 'inner') slot = 'top'; if (slot && FIGURE_SLOTS.includes(slot)) { asg[slot] = f.index; labeled = labeled || {}; labeled[slot] = true; } });
  // con prendas etiquetadas, lo que no se etiquetó como prenda exterior o accesorio no se inventa
  if (labeled) FIGURE_OPTIONAL.forEach((slot) => { if (!labeled[slot]) asg[slot] = null; });
  if (asg.socks == null) asg.socks = asg.bottom;
  return asg;
}
/** Figura de un outfit real: cada prenda con su color principal y su superficie ESTIMADA (pesos del Studio). */
export function outfitFigure(items) {
  const est = estimateDistribution(items);
  if (!est.valid) return { garments: [], colors: [], illustrative: false };
  const garments = items.map((it, i) => ({ slot: it.slot, hex: it.hex, share: est.garments[i] ? est.garments[i].pct : 0 })).filter((g) => g.hex && g.share > 0);
  return { garments, colors: est.colors.map((c) => ({ hex: c.hex, share: c.pct, name: colorFacts(c.hex).name })), illustrative: false };
}

/* ═══════════ SUGERENCIAS DE OUTFITS (armario × Biblioteca) ═══════════
   Busca conjuntos completos con TUS prendas que representen una combinación de la Biblioteca:
   · Prendas: parte superior, pantalón y calzado (obligatorios); prenda exterior y prenda interior (opcionales; la interior
     solo bajo un jersey o una prenda exterior). Calcetines y accesorios quedan fuera: los decide la guía de calcetines.
   · Cada prenda tiene que estar cerca de un color de la paleta (ΔE00 ≤ 12, «relacionado»): ninguna fuera de la combinación.
   · La paleta tiene que quedar representada en conjunto: al menos 2 de sus colores (o todos si tiene 2), sin que una sola
     prenda lo explique todo; el color con más superficie ocupa al menos el 30 %.
   · Orden: más colores de la paleta representados, menor ΔE00 medio ponderado por superficie. Solo se enseñan las que
     quedan en «muy similar» o mejor (ΔE00 medio ≤ 6) o, si no hay, «relacionado» con ΔE00 medio ≤ 9. Mejor pocas que flojas.
   · Variedad: una prenda aparece como mucho en 2 sugerencias y no se repite el mismo conjunto con otra paleta.
   Se recalcula con el armario de cada momento: una prenda nueva entra sola en las siguientes sugerencias. */
export const SUGGEST = { PER_SLOT: 3, MAX_MEAN: 9, GOOD_MEAN: SIMILARITY.CLOSE, MAX_REUSE: 2, MIN_DOMINANT: 30 };
let suggestMemo = { key: null, value: null };
export function suggestOutfits(input = {}) {
  const garments = input.garments || [], palettes = (input.palettes || []).filter((p) => (p.colors || []).length >= 2), limit = input.limit || 6;
  const key = garments.map((g) => g.id + g.category + g.primary_color).join('|') + '#' + palettes.map((p) => p.id + (p.colors || []).map((c) => c.hex).join('')).join('|') + '#' + limit;
  if (suggestMemo.key === key) return suggestMemo.value;
  const bySlot = {};
  ['outer', 'top', 'inner', 'bottom', 'shoes'].forEach((slot) => { bySlot[slot] = garments.filter((g) => SLOT[slot].categories.includes(g.category) && normalizeHex(g.primary_color)); });
  const found = [];
  palettes.forEach((p) => {
    const P = (p.colors || []).map((c) => normalizeHex(c.hex)).filter(Boolean);
    const near = (g) => { let j = -1, d = Infinity; P.forEach((h, k) => { const x = colorDistance(g.primary_color, h); if (x < d) { d = x; j = k; } }); return { g, j, d }; };
    const cands = {};
    for (const slot of Object.keys(bySlot)) {
      cands[slot] = bySlot[slot].map(near).filter((x) => x.d <= SIMILARITY.RELATED).sort((a, b) => a.d - b.d).slice(0, SUGGEST.PER_SLOT);
      if (['top', 'bottom', 'shoes'].includes(slot) && !cands[slot].length) return;
    }
    let best = null;
    const outerOpts = [null].concat(cands.outer), innerOpts = [null].concat(cands.inner);
    cands.top.forEach((t) => cands.bottom.forEach((b) => cands.shoes.forEach((s) => outerOpts.forEach((o) => innerOpts.forEach((i) => {
      if (i && (i.g.id === t.g.id || (t.g.category !== 'jerseis' && !o))) return;      // la interior va debajo de algo
      const parts = [['top', t], ['bottom', b], ['shoes', s]].concat(o ? [['outer', o]] : [], i ? [['inner', i]] : []);
      const total = parts.reduce((x, [slot]) => x + SLOT[slot].weight, 0);
      const share = {}; let meanDE = 0;
      parts.forEach(([slot, x]) => { const w = SLOT[slot].weight / total; share[x.j] = (share[x.j] || 0) + w; meanDE += x.d * w; });
      const covered = Object.keys(share).length, dominant = Math.max(...Object.values(share)) * 100;
      if (covered < Math.min(2, P.length) || dominant < SUGGEST.MIN_DOMINANT || meanDE > SUGGEST.MAX_MEAN) return;
      const cand = { parts, covered, meanDE, coverage: covered / P.length };
      if (!best || (cand.covered - best.covered || best.meanDE - cand.meanDE) > 0) best = cand;
    })))));
    if (best) found.push(Object.assign(best, { palette: p }));
  });
  found.sort((a, b) => (b.covered - a.covered) || (a.meanDE - b.meanDE));
  const good = found.filter((f) => f.meanDE <= SUGGEST.GOOD_MEAN);
  const pool = good.length ? good : found;
  const out = [], uses = {}, seen = new Set();
  for (const f of pool) {
    if (out.length >= limit) break;
    const ids = f.parts.map(([, x]) => x.g.id), sig = ids.slice().sort().join();
    if (seen.has(sig) || ids.some((id) => (uses[id] || 0) >= SUGGEST.MAX_REUSE)) continue;
    seen.add(sig); ids.forEach((id) => { uses[id] = (uses[id] || 0) + 1; });
    const slots = {};
    f.parts.forEach(([slot, x]) => { slots[slot] = { garment_id: x.g.id, hex: null, weight: SLOT[slot].weight }; });
    const items = buildItems(slots, garments), analysis = analyzeOutfit(items);
    const affinity = paletteAffinity(f.palette, outfitColorsOf(analysis), { maxOff: 1 });
    out.push({ id: f.palette.id + ':' + sig, palette: f.palette, slots, items, analysis, affinity, meanDE: f.meanDE, level: similarityLevel(f.meanDE),
      covered: f.covered, paletteSize: (f.palette.colors || []).length, figure: outfitFigure(items) });
  }
  const value = { suggestions: out, considered: found.length, strict: good.length > 0 };
  suggestMemo = { key, value };
  return value;
}
