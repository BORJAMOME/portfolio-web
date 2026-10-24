/* ═══════════════════════════════════════════════
   color-studio/socks.js: guía de calcetines (reglas explícitas, sin azar)
   ─────────────────────────────────────────────────
   Tres propuestas a partir del pantalón, el calzado y el resto del outfit:
     safe        → Segura: continuidad con el pantalón (o con el calzado si no hay pantalón)
     coordinated → Coordinada: un color de la parte de arriba o de un accesorio que conecta piezas
     contrast    → Con contraste: un color de una paleta de la biblioteca que ya encaja con el outfit
                   o, si no hay ninguna, un tono opuesto con la saturación contenida según la formalidad
   La formalidad y la preferencia cambian el ORDEN y la intensidad, no prohíben nada.
   Cada propuesta lleva los identificadores de las reglas que la generan (RULES).
   ═══════════════════════════════════════════════ */
import { normalizeHex, colorDistance, describeColor, hexToLab, labToLch, lchToLab, labToHex, rankPalettes, MATCH } from './engine.js';

export const RULES = {
  'continuidad-pantalon': 'Calcetín del color del pantalón: la pierna se lee como una sola línea.',
  'continuidad-calzado': 'Calcetín del color del calzado: alarga el zapato. Válido, pero no siempre la primera opción.',
  'tono-sobre-tono': 'Un tono más oscuro que el pantalón: misma familia, algo más de profundidad.',
  'conexion-superior': 'Un color presente arriba (camisa, jersey, chaqueta o accesorio) conecta visualmente las prendas.',
  'neutro-discreto': 'Un neutro que ya está en el conjunto mantiene la discreción.',
  'contraste-paleta': 'Color de una paleta de tu biblioteca que se relaciona con el outfit y que este aún no usa.',
  'contraste-opuesto': 'Tono opuesto al color con más presencia, con la saturación contenida para no romper el conjunto.',
  'formalidad': 'En un contexto formal la continuidad va primero y el contraste se suaviza.'
};
export const TYPES = { safe: 'Segura', coordinated: 'Coordinada', contrast: 'Con contraste' };
export const FORMALITY = [['formal', 'Formal'], ['smart', 'Smart casual'], ['casual', 'Informal']];
export const PREFERENCE = [['discreet', 'Discreto'], ['balanced', 'Equilibrado'], ['contrast', 'Con contraste']];
const MAX_CHROMA = { formal: 25, smart: 40, casual: 55 };
const CONTEXT = { formal: 'formal', smart: 'smart casual', casual: 'informal' };
const OWN_TOLERANCE = 12;                    // ΔE00 para decir «tienes uno parecido»
const DISTINCT = MATCH.NEAR;                 // por debajo, dos colores cuentan como el mismo tono

const nameOf = (hex) => (describeColor(hex) || {}).name || hex;
function chroma(hex) { return labToLch(hexToLab(hex)).C; }

/** El calcetín de tu armario más próximo a un color (si lo hay a ΔE00 ≤ 12). */
export function nearestOwned(hex, socks) {
  let best = null;
  (socks || []).forEach((s) => {
    const d = colorDistance(hex, s.primary_color);
    if (d <= OWN_TOLERANCE && (!best || d < best.dE)) best = { garment: s, dE: d };
  });
  return best;
}

function shade(hex, dL) {
  const lch = labToLch(hexToLab(hex));
  return labToHex(lchToLab({ L: Math.max(8, Math.min(92, lch.L + dL)), C: lch.C, h: lch.h }));
}

/**
 * input: {
 *   trousers: hex | null, shoes: hex | null,
 *   others: [{ hex, label, share? }]   (parte superior, exterior, accesorios),
 *   formality: 'formal' | 'smart' | 'casual', preference: 'discreet' | 'balanced' | 'contrast',
 *   socks: [prendas de la categoría calcetines], palettes: [paletas de la biblioteca]
 * }
 * → { proposals: [{ type, label, hex, name, explanation, rules, owned, origin }], notes, insufficient }
 */
export function recommendSocks(input) {
  const trousers = normalizeHex(input.trousers), shoes = normalizeHex(input.shoes);
  const formality = MAX_CHROMA[input.formality] ? input.formality : 'smart';
  const preference = ['discreet', 'balanced', 'contrast'].includes(input.preference) ? input.preference : 'balanced';
  const others = (input.others || []).map((o) => ({ hex: normalizeHex(o.hex), label: o.label || '', share: Number(o.share) || 0 })).filter((o) => o.hex);
  const notes = [];
  if (!trousers && !shoes) {
    return { proposals: [], insufficient: true, notes: ['Elige al menos el pantalón o el calzado: sin ellos no hay una base sobre la que decidir el calcetín.'] };
  }
  if (!trousers) notes.push('Sin pantalón, la propuesta segura sigue al calzado.');
  if (!shoes) notes.push('Sin calzado no se puede comprobar si el calcetín conecta también con el zapato.');
  const outfit = [trousers, shoes, ...others.map((o) => o.hex)].filter(Boolean);
  const proposals = [];

  // ── Segura ──
  if (trousers) {
    proposals.push({ type: 'safe', hex: trousers, rules: ['continuidad-pantalon'], origin: 'outfit',
      explanation: 'Del color del pantalón (' + nameOf(trousers) + '): continuidad y bajo contraste.' });
  } else {
    proposals.push({ type: 'safe', hex: shoes, rules: ['continuidad-calzado'], origin: 'outfit',
      explanation: 'Del color del calzado (' + nameOf(shoes) + '): sin pantalón elegido, es la referencia más estable.' });
  }

  // ── Coordinada ──
  const base = proposals[0].hex;
  const upper = others.filter((o) => colorDistance(o.hex, base) > DISTINCT);
  const pick = upper.filter((o) => !(describeColor(o.hex) || {}).neutral).sort((a, b) => b.share - a.share)[0] ||
    upper.sort((a, b) => b.share - a.share)[0];
  if (pick) {
    const neutral = (describeColor(pick.hex) || {}).neutral;
    proposals.push({ type: 'coordinated', hex: pick.hex, rules: neutral ? ['conexion-superior', 'neutro-discreto'] : ['conexion-superior'], origin: 'outfit',
      explanation: 'Recoge el ' + nameOf(pick.hex) + (pick.label ? ' de ' + pick.label.toLowerCase() : '') + ' y lo lleva abajo: une la parte de arriba con el pie.' });
  } else if (trousers && shoes && colorDistance(shoes, trousers) > DISTINCT) {
    proposals.push({ type: 'coordinated', hex: shoes, rules: ['continuidad-calzado'], origin: 'outfit',
      explanation: 'Del color del calzado (' + nameOf(shoes) + '): conecta pie y zapato; la parte de arriba no aporta un color distinto.' });
  } else {
    const hex = shade(base, -12);
    proposals.push({ type: 'coordinated', hex, rules: ['tono-sobre-tono'], origin: 'rule',
      explanation: 'El conjunto no tiene otro color que conectar: un tono más oscuro que el ' + nameOf(base) + ' da profundidad sin salir de la familia.' });
  }

  // ── Con contraste ──
  const limit = MAX_CHROMA[formality];
  const ranked = rankPalettes(outfit.map((hex) => ({ hex, share: 1 })), input.palettes || [], { limit: 8 });
  let contrast = null;
  for (const r of ranked) {
    const used = new Set(r.match.paletteIndexes);
    const free = (r.palette.colors || []).map((c, i) => ({ hex: normalizeHex(c.hex), i, name: c.name }))
      .filter((c) => c.hex && !used.has(c.i) && outfit.every((o) => colorDistance(o, c.hex) > 15) && chroma(c.hex) >= 15)
      .sort((a, b) => (Math.abs(chroma(a.hex) - limit) - Math.abs(chroma(b.hex) - limit)));
    if (free.length) {
      contrast = { type: 'contrast', hex: free[0].hex, rules: ['contraste-paleta'], origin: 'palette', palette: r.palette,
        explanation: 'De la paleta «' + (r.palette.name || 'sin nombre') + '», que comparte ' + r.match.connected + ' color(es) con el outfit: el ' +
          (free[0].name || nameOf(free[0].hex)) + ' aún no aparece en el conjunto.' };
      if (chroma(contrast.hex) > limit + 15) notes.push('El contraste propuesto es más saturado de lo habitual en un contexto ' + CONTEXT[formality] + '.');
      break;
    }
  }
  if (!contrast) {
    const anchor = outfit.slice().sort((a, b) => chroma(b) - chroma(a))[0];
    const lch = labToLch(hexToLab(anchor));
    const L = Math.max(30, Math.min(65, labToLch(hexToLab(trousers || shoes)).L + (lch.L < 50 ? 8 : -8)));
    const hex = labToHex(lchToLab({ L, C: Math.min(limit, Math.max(18, lch.C)), h: (lch.h + 180) % 360 }));
    contrast = { type: 'contrast', hex, rules: ['contraste-opuesto'], origin: 'rule',
      explanation: 'Opuesto al ' + nameOf(anchor) + ', con la saturación limitada (' + CONTEXT[formality] +
        '). Es una regla de partida, no una garantía: compruébalo con la prenda real.' };
  }
  proposals.push(contrast);

  // ── Orden según formalidad y preferencia ──
  const order = preference === 'discreet' ? ['safe', 'coordinated', 'contrast'] : preference === 'contrast' ? ['contrast', 'coordinated', 'safe'] : ['coordinated', 'safe', 'contrast'];
  if (formality === 'formal') {          // formal: la segura primero y el contraste al final, sea cual sea la preferencia
    order.splice(0, order.length, 'safe', ...order.filter((t) => t !== 'safe' && t !== 'contrast'), 'contrast');
    proposals.forEach((p) => { if (p.type !== 'coordinated') p.rules = p.rules.concat('formalidad'); });
    notes.push(RULES.formalidad);
  }
  return {
    insufficient: false,
    notes,
    proposals: order.map((t) => proposals.find((p) => p.type === t)).map((p) => Object.assign(p, {
      label: TYPES[p.type], name: nameOf(p.hex), owned: nearestOwned(p.hex, input.socks)
    }))
  };
}
