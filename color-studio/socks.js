/* ═══════════════════════════════════════════════
   color-studio/socks.js: guía de calcetines (reglas explícitas, sin azar)
   ─────────────────────────────────────────────────
   El calcetín está ENTRE el pantalón y el calzado: su papel depende de los dos, del tipo de calzado
   y de la intención del conjunto. Tres propuestas, siempre distintas entre sí (ΔE00 > 10):
     safe        → Continuidad: prolonga el pantalón (un punto más oscuro si es claro o medio)
     coordinated → Coordinación: conecta el pie con otra zona (arriba, accesorio, estampado, deportivas)
     contrast    → Contraste: un acento deliberado (paleta de la biblioteca → secundario existente → calculado)
   La formalidad, la dirección (minimalista/equilibrada/creativa) y el tipo de calzado cambian el ORDEN,
   la intensidad y las notas; no prohíben nada. Cada propuesta lleva los identificadores de sus reglas (RULES).
   Fuentes de las convenciones: Permanent Style (por defecto, calcetín del color del pantalón; con pantalón
   claro, un tono o dos más oscuro) y Gentleman's Gazette (el mismo color exacto que el pantalón no es la
   opción más lograda; mejor que igualar el calzado; enlazar con la parte de arriba). Ver color-studio/README.md.
   ═══════════════════════════════════════════════ */
import { normalizeHex, colorDistance, describeColor, hexToLab, labToLch, lchToLab, labToHex, rankPalettes } from './engine.js?v=554dcefb20';
import { directionOf, relation } from './compose.js?v=3e7d3d81a2';

export const RULES = {
  'continuidad-pantalon': 'Calcetín en la familia del pantalón: la pierna se lee como una sola línea y el calzado queda como remate.',
  'separacion-sutil': 'Un punto más oscuro que el pantalón: evita que parezca un intento fallido de igualar dos tejidos distintos.',
  'pantalon-claro': 'Con pantalón claro, uno o dos tonos más oscuro: el calcetín pálido igualado tiende a lavarse.',
  'continuidad-calzado': 'Calcetín cercano al calzado: alarga el zapato. Válido, pero suele ser la segunda opción tras el pantalón.',
  'tono-sobre-tono': 'Un tono más oscuro o más claro de la misma familia: profundidad sin salir del color.',
  'conexion-superior': 'Un color presente arriba (camisa, jersey, chaqueta o accesorio) conecta visualmente la parte alta y la baja.',
  'secundario-estampado': 'Un color secundario de una prenda estampada: recoge el dibujo sin repetir su color principal.',
  'neutro-discreto': 'Un neutro que ya está en el conjunto mantiene la discreción.',
  'deportiva-blanca': 'Con deportivas blancas, el blanco o el crudo prolongan la zapatilla; es una convención informal muy extendida.',
  'deportiva-oscura': 'Con deportivas oscuras no hace falta negro: la continuidad con el pantalón o un tono cercano al calzado también funcionan.',
  'deportiva-color': 'Con deportivas de color, un color del calzado que también esté en otra prenda une el pie con el resto.',
  'deportiva-tecnica': 'Con calzado técnico, la convención es el calcetín deportivo (blanco, gris o del color del calzado).',
  'mocasin': 'Con mocasín el tobillo queda a la vista: o el calcetín no se ve (invisible) o se ve del todo; si se ve, cuenta como una prenda más.',
  'bota': 'Con bota el calcetín asoma poco de pie; se ve al sentarse. Los tonos tierra son una opción, no una obligación.',
  'calzado-formal': 'Con zapato formal, la continuidad con el pantalón es la referencia clásica; el contraste, mejor profundo que brillante.',
  'contraste-paleta': 'Color de una paleta de tu biblioteca (las de Sanzo Wada primero) que se relaciona con el outfit y que este aún no usa.',
  'contraste-secundario': 'Un color secundario que ya existe en alguna prenda del conjunto, llevado al tobillo como acento.',
  'contraste-opuesto': 'Tono opuesto al color con más presencia, con la saturación contenida para no romper el conjunto.',
  'contraste-analogo': 'Tono vecino del color principal, más intenso: un acento suave, coherente con una dirección discreta.',
  'formalidad': 'En un contexto formal la continuidad va primero y el contraste se suaviza.',
  'largo-formal': 'Con zapato formal, calcetín largo o de media caña alta y fino: al sentarte no debe verse la pierna.',
  'largo-mocasin': 'Con mocasín, invisible o de media caña; el tobillero que asoma a medias es lo que menos funciona.',
  'largo-bota': 'Con bota, más alto que la caña para que no roce, y algo más grueso (lana o algodón).',
  'largo-deportiva': 'Con deportivas, invisible o tobillero si no quieres que se vea; de media caña si quieres que se vea, con un aire más deportivo.',
  'largo-tecnica': 'Con calzado técnico, calcetín técnico tobillero o de media caña.',
  'largo-casual': 'Con náuticos, alpargatas o sandalias, la convención es el invisible o ir sin calcetín.',
  'largo-contexto': 'Sin tipo de calzado, el largo sigue a la formalidad: cuanto más formal, más largo y más fino.'
};
export const TYPES = { safe: 'Continuidad', coordinated: 'Coordinación', contrast: 'Contraste' };
export const EFFECT = {
  safe: 'Alarga la pierna y deja que el calzado cierre el conjunto.',
  coordinated: 'Conecta el tobillo con otra zona del conjunto.',
  contrast: 'Introduce un acento intencionado en el tobillo.'
};
export const FORMALITY = [['formal', 'Formal'], ['smart', 'Smart casual'], ['casual', 'Informal']];
export const PREFERENCE = [['discreet', 'Discreto'], ['balanced', 'Equilibrado'], ['contrast', 'Con contraste']];   // compatibilidad: hoy manda la dirección
export const SHOE_TYPES = [['formal', 'Zapato formal'], ['loafer', 'Mocasín'], ['boot', 'Bota'], ['sneaker', 'Deportiva'], ['technical', 'Deportiva técnica'], ['casual', 'Casual']];
export const SHOE_LABEL = Object.fromEntries(SHOE_TYPES);
export const SOCK_LENGTHS = [['invisible', 'Invisible'], ['tobillero', 'Tobillero'], ['media', 'Media caña'], ['largo', 'Largo']];
export const SOCK_LENGTH_LABEL = Object.fromEntries(SOCK_LENGTHS);
/* Largo y grosor por tipo de calzado (auditoría CS-21). Convenciones de estilismo, no reglas: el primero es la
   referencia y el resto, alternativas válidas. Sin tipo de calzado, decide la formalidad. */
const FIT = {
  formal: { lengths: ['largo', 'media'], weight: 'Fino (hilo de Escocia o merino fino)', rule: 'largo-formal' },
  loafer: { lengths: ['invisible', 'media'], weight: 'Fino', rule: 'largo-mocasin' },
  boot: { lengths: ['media', 'largo'], weight: 'Medio o grueso (lana, algodón)', rule: 'largo-bota' },
  sneaker: { lengths: ['tobillero', 'invisible', 'media'], weight: 'Algodón', rule: 'largo-deportiva' },
  technical: { lengths: ['tobillero', 'media'], weight: 'Técnico (transpirable)', rule: 'largo-tecnica' },
  casual: { lengths: ['invisible'], weight: 'Fino', rule: 'largo-casual' }
};
const FIT_BY_FORMALITY = {
  formal: { lengths: ['largo', 'media'], weight: 'Fino', rule: 'largo-contexto' },
  smart: { lengths: ['media', 'largo'], weight: 'Fino o medio', rule: 'largo-contexto' },
  casual: { lengths: ['tobillero', 'media', 'invisible'], weight: 'Algodón', rule: 'largo-contexto' }
};
/** Largo de un calcetín a partir de su subcategoría o nombre (null si no se reconoce). */
export function inferSockLength(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!t.trim()) return null;
  if (/invisible|pinkie|no ?show|bailarin|pinky/.test(t)) return 'invisible';
  if (/media cana|mediacana|cana media|crew|\bmid\b/.test(t)) return 'media';
  if (/tobiller|ankle|quarter|corto/.test(t)) return 'tobillero';
  if (/largo|ejecutivo|\balto\b|rodilla|knee|over.?the.?calf|\botc\b/.test(t)) return 'largo';
  return null;
}
const sockLength = (g) => (g ? inferSockLength([g.subcategory, g.name].join(' ')) : null);
/** Largo, grosor y regla para un tipo de calzado y una formalidad. */
export function sockFit(shoeType, formality) {
  const f = FIT[shoeType] || FIT_BY_FORMALITY[formality] || FIT_BY_FORMALITY.smart;
  return { lengths: f.lengths.slice(), weight: f.weight, rule: f.rule, why: RULES[f.rule], label: f.lengths.map((x) => SOCK_LENGTH_LABEL[x].toLowerCase()).join(' o '),
    hidden: f.lengths[0] === 'invisible' };
}
const MAX_CHROMA = { formal: 25, smart: 40, casual: 55 };   // convención práctica, no estándar: ver README
const DIR_SHIFT = { minimal: -10, balanced: 0, creative: 10 };
const CONTEXT = { formal: 'formal', smart: 'smart casual', casual: 'informal' };
const OWN_TOLERANCE = 12;                    // ΔE00 para decir «tienes uno parecido»
const OWN_SNAP = 8;                          // ΔE00 por debajo del cual la continuidad usa el calcetín que ya tienes
const DISTINCT = 10;                         // por debajo, dos propuestas cuentan como el mismo tono

const nameOf = (hex) => (describeColor(hex) || {}).name || hex;
const lchOf = (hex) => labToLch(hexToLab(hex));
const chroma = (hex) => lchOf(hex).C;
const isNeutral = (hex) => !!(describeColor(hex) || {}).neutral;

/** Tipo de calzado a partir de la subcategoría o el nombre que escribiste (null si no se reconoce). */
export function inferShoeType(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t.trim()) return null;
  if (/running|trail|tecnic|runner|trekking|deportivo tecnico/.test(t)) return 'technical';
  if (/deportiv|zapatill|sneaker|trainer|tenis|bamba/.test(t)) return 'sneaker';
  if (/mocas|loafer|penny|kiltie/.test(t)) return 'loafer';
  if (/bota|botin|boot|chelsea|chukka/.test(t)) return 'boot';
  if (/informal/.test(t)) return 'casual';                // antes que /formal/: «informal» contiene «formal»
  if (/oxford|derby|blucher|monk|brogue|zapato|formal|vestir/.test(t)) return 'formal';
  if (/nautic|alpargat|espadrill|sandal|naut/.test(t)) return 'casual';
  return null;
}
/** Tono de una deportiva según su color: blanca, oscura, de color o neutra. */
export function sneakerTone(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  const { L, C } = lchOf(n);
  if (L >= 85 && C < 12) return 'white';
  if (L < 35) return 'dark';
  return C >= 20 ? 'colored' : 'neutral';
}

/** El calcetín de tu armario más próximo a un color (si lo hay a ΔE00 ≤ 12). Con `lengths`, entre los de
    color parecido gana el de un largo adecuado (o desconocido) frente al que no encaja con el calzado. */
export function nearestOwned(hex, socks, lengths) {
  let best = null;
  const miss = (s) => { const l = sockLength(s); return lengths && l && !lengths.includes(l) ? 1 : 0; };
  (socks || []).forEach((s) => {
    const d = colorDistance(hex, s.primary_color);
    if (d > OWN_TOLERANCE) return;
    const m = miss(s);
    if (!best || m < best.miss || (m === best.miss && d < best.dE)) best = { garment: s, dE: d, miss: m };
  });
  if (!best) return null;
  const length = sockLength(best.garment);
  return { garment: best.garment, dE: best.dE, length, lengthOk: lengths && length ? lengths.includes(length) : null };
}
function shade(hex, dL) {
  const lch = lchOf(hex);
  return labToHex(lchToLab({ L: Math.max(8, Math.min(92, lch.L + dL)), C: lch.C, h: lch.h }));
}
function contrastLevel(hex, ref) {
  if (!ref) return null;
  const d = colorDistance(hex, ref);
  return d < 10 ? 'bajo' : d < 25 ? 'medio' : 'alto';
}

/**
 * input: {
 *   trousers, shoes: hex | null · trousersSecondary, shoesSecondary: [hex] · trousersPattern: 'liso' | …
 *   shoeType: 'formal' | 'loafer' | 'boot' | 'sneaker' | 'technical' | 'casual' | null
 *   others: [{ hex, label, share?, secondary?: [hex] }]   (parte superior, exterior, accesorios)
 *   formality: 'formal' | 'smart' | 'casual' · direction: 'minimal' | 'balanced' | 'creative' (o preference antigua)
 *   socks: [prendas de la categoría calcetines] · palettes: [paletas de la biblioteca]
 * }
 * → { proposals: [{ type, label, hex, name, explanation, effect, contrast (frente al pantalón; si no hay, al calzado), contrastTrousers, contrastShoes, rules, owned, origin, source }], notes, insufficient, shoeType,
 *     fit: { lengths, label, weight, rule, why, hidden } }   owned: { garment, dE, length, lengthOk } (largo deducido de su subcategoría)
 */
export function recommendSocks(input) {
  input = input || {};
  const trousers = normalizeHex(input.trousers), shoes = normalizeHex(input.shoes);
  const formality = MAX_CHROMA[input.formality] ? input.formality : 'smart';
  const direction = directionOf(input.direction || input.preference);
  const shoeType = SHOE_LABEL[input.shoeType] ? input.shoeType : null;
  const tone = shoeType === 'sneaker' ? sneakerTone(shoes) : null;
  const clean = (list) => (list || []).map(normalizeHex).filter(Boolean);
  const trSec = clean(input.trousersSecondary), shSec = clean(input.shoesSecondary);
  const others = (input.others || []).map((o) => ({ hex: normalizeHex(o.hex), label: o.label || '', share: Number(o.share) || 0, secondary: clean(o.secondary) })).filter((o) => o.hex);
  const notes = [];
  const fit = sockFit(shoeType, formality);
  if (!trousers && !shoes) {
    return { proposals: [], insufficient: true, shoeType, fit, notes: ['Elige al menos el pantalón o el calzado: sin ellos no hay una base sobre la que decidir el calcetín.'] };
  }
  if (!trousers) notes.push('Sin pantalón, la continuidad sigue al calzado.');
  if (!shoes) notes.push('Sin calzado no se puede comprobar si el calcetín conecta también con el zapato.');
  if (input.trousersPattern && input.trousersPattern !== 'liso' && trSec.length) notes.push('Pantalón con dibujo: la continuidad sigue a su color principal y la coordinación puede recoger uno de sus secundarios.');
  const outfit = [trousers, shoes, ...trSec, ...shSec].concat(...others.map((o) => [o.hex].concat(o.secondary))).filter(Boolean);
  const distinct = (hex, chosen) => chosen.every((p) => colorDistance(hex, p.hex) > DISTINCT);
  const owned = (input.socks || []);

  // ── Continuidad ──
  let safe;
  if (trousers) {
    const L = lchOf(trousers).L;
    const target = L > 65 ? shade(trousers, -12) : L < 22 ? trousers : shade(trousers, -6);
    const mine = owned.map((s) => ({ s, d: Math.min(colorDistance(s.primary_color, trousers), colorDistance(s.primary_color, target)) }))
      .filter((x) => x.d <= OWN_SNAP).sort((a, b) => a.d - b.d)[0];
    const hex = mine ? normalizeHex(mine.s.primary_color) : target;
    // las reglas describen el color que se propone de verdad (un calcetín propio puede ser idéntico al pantalón)
    const darker = L - lchOf(hex).L >= 3;
    const rules = ['continuidad-pantalon'].concat(darker ? [L > 65 ? 'pantalon-claro' : 'separacion-sutil'] : []);
    safe = { type: 'safe', hex, rules, origin: mine ? 'owned' : target === trousers ? 'outfit' : 'rule', source: 'Pantalón ' + nameOf(trousers),
      explanation: (mine ? 'Tu calcetín ' + (mine.s.name || nameOf(hex)) + ' prolonga' : target === trousers ? 'Del color del pantalón (' + nameOf(trousers) + '): prolonga' : 'Un punto más oscuro que el pantalón ' + nameOf(trousers) + ': prolonga') +
        ' la pierna' + (shoes ? ' y deja que el calzado ' + nameOf(shoes) + ' cierre el conjunto' : '') + '.' + (L > 65 && !mine ? ' Con un pantalón claro, el calcetín igualado tiende a lavarse.' : '') };
    if (shoes && colorDistance(shoes, trousers) <= DISTINCT) notes.push('Pantalón y calzado son casi del mismo color: la continuidad crea una línea entera del mismo tono.');
  } else {
    safe = { type: 'safe', hex: shoes, rules: ['continuidad-calzado'], origin: 'outfit', source: 'Calzado ' + nameOf(shoes),
      explanation: 'Del color del calzado (' + nameOf(shoes) + '): sin pantalón elegido, es la referencia más estable.' };
  }
  if (shoeType === 'formal') safe.rules = safe.rules.concat('calzado-formal');
  const chosen = [safe];

  // ── Coordinación ──
  const cands = [];
  const push = (hex, rules, source, explanation) => { if (hex) cands.push({ hex, rules, source, explanation }); };
  if (tone === 'white') push(shoes, ['deportiva-blanca'], 'Deportivas ' + nameOf(shoes), 'Recupera el ' + nameOf(shoes) + ' de las deportivas: prolonga la zapatilla y separa el tobillo del pantalón.');
  if (tone === 'colored' || (shoeType === 'sneaker' && shSec.length)) {
    [shoes].concat(shSec).forEach((h) => {
      const link = others.find((o) => [o.hex].concat(o.secondary).some((x) => colorDistance(x, h) <= 12));
      if (link) push(h, ['deportiva-color', 'conexion-superior'], 'Deportivas y ' + link.label.toLowerCase(), 'El ' + nameOf(h) + ' de las deportivas también está en ' + link.label.toLowerCase() + ': el calcetín une el pie con esa prenda.');
    });
  }
  const upper = others.slice().sort((a, b) => {
    const na = isNeutral(a.hex), nb = isNeutral(b.hex);
    return direction === 'minimal' ? (nb - na) || (b.share - a.share) : (na - nb) || (b.share - a.share);
  });
  upper.forEach((o) => push(o.hex, isNeutral(o.hex) ? ['conexion-superior', 'neutro-discreto'] : ['conexion-superior'], o.label,
    'Recoge el ' + nameOf(o.hex) + (o.label ? ' de ' + o.label.toLowerCase() : '') + ' y lo lleva al tobillo: une la parte de arriba con el pie.'));
  trSec.forEach((h) => push(h, ['secundario-estampado'], 'Dibujo del pantalón', 'Recoge el ' + nameOf(h) + ' del dibujo del pantalón sin repetir su color principal.'));
  upper.forEach((o) => o.secondary.forEach((h) => push(h, ['secundario-estampado', 'conexion-superior'], 'Dibujo de ' + o.label.toLowerCase(), 'Recoge el ' + nameOf(h) + ' del dibujo de ' + o.label.toLowerCase() + ': conecta con la parte de arriba de forma más sutil.')));
  if (trousers && shoes) {
    const r = relation(trousers, shoes);
    if (r.kind !== 'igual') push(shoes, ['continuidad-calzado'].concat(shoeType === 'boot' ? ['bota'] : shoeType === 'sneaker' && tone === 'dark' ? ['deportiva-oscura'] : []), 'Calzado ' + nameOf(shoes),
      'Cercano al calzado (' + nameOf(shoes) + '): alarga el zapato y marca más el corte con el pantalón que la continuidad.');
  }
  const base = trousers || shoes;
  // tono sobre tono a una distancia clara de la continuidad (que ya va 0, 6 o 12 puntos más oscura)
  const bL = lchOf(base).L;
  push(shade(base, bL > 65 ? -24 : bL < 22 ? 14 : -20), ['tono-sobre-tono'], 'Pantalón ' + nameOf(base),
    'El conjunto no tiene otro color que conectar: un tono ' + (bL < 22 ? 'más claro' : 'más oscuro') + ' que el ' + nameOf(base) + ' da profundidad sin salir de la familia.');
  const coord = cands.find((x) => distinct(x.hex, chosen));
  if (coord) chosen.push(Object.assign({ type: 'coordinated', origin: coord.rules[0] === 'tono-sobre-tono' ? 'rule' : 'outfit' }, coord));
  else notes.push('No hay un segundo color en el conjunto lo bastante distinto para una propuesta de coordinación.');

  // ── Contraste ──
  const limit = MAX_CHROMA[formality] + DIR_SHIFT[direction];
  const deepOnly = formality === 'formal' || shoeType === 'formal';
  const fits = (hex) => distinct(hex, chosen) && [trousers, shoes].filter(Boolean).every((r) => colorDistance(r, hex) > 15) && chroma(hex) >= 15;
  const pick = (list) => list.filter((c) => fits(c.hex)).sort((a, b) => {
    const pa = Math.abs(chroma(a.hex) - limit) + (deepOnly && lchOf(a.hex).L > 50 ? 25 : 0);
    const pb = Math.abs(chroma(b.hex) - limit) + (deepOnly && lchOf(b.hex).L > 50 ? 25 : 0);
    return pa - pb;
  })[0];
  let contrast = null;
  const ranked = rankPalettes(outfit.map((hex) => ({ hex, share: 1 })), input.palettes || [], { limit: 12 })
    .sort((a, b) => ((b.palette.source_type === 'book') - (a.palette.source_type === 'book')));
  for (const r of ranked) {
    const used = new Set(r.match.paletteIndexes);
    const free = (r.palette.colors || []).map((c, i) => ({ hex: normalizeHex(c.hex), i, name: c.name })).filter((c) => c.hex && !used.has(c.i) && outfit.every((o) => colorDistance(o, c.hex) > 15));
    const best = pick(free);
    if (best) {
      contrast = { type: 'contrast', hex: best.hex, rules: ['contraste-paleta'], origin: 'palette', palette: r.palette, source: 'Paleta «' + (r.palette.name || 'sin nombre') + '»',
        explanation: 'De la paleta «' + (r.palette.name || 'sin nombre') + '», que comparte ' + r.match.connected + ' color(es) con el outfit: el ' + (best.name || nameOf(best.hex)) +
          ' aún no aparece en el conjunto y contrasta con el pantalón sin salirse de la combinación.' };
      break;
    }
  }
  if (!contrast) {
    const sec = pick(trSec.concat(shSec, ...others.map((o) => o.secondary)).map((hex) => ({ hex })));
    if (sec) contrast = { type: 'contrast', hex: sec.hex, rules: ['contraste-secundario'], origin: 'outfit', source: 'Color secundario del conjunto',
      explanation: 'El ' + nameOf(sec.hex) + ' ya aparece como color secundario en el conjunto: llevarlo al tobillo crea un acento que tiene de dónde venir.' };
  }
  if (!contrast) {
    // ancla: el pantalón si tiene tono (croma ≥ 10); si no, el color más intenso del conjunto
    const anchor = trousers && chroma(trousers) >= 10 ? trousers : outfit.slice().sort((a, b) => chroma(b) - chroma(a))[0];
    const lch = lchOf(anchor);
    const analog = direction === 'minimal';
    const refL = lchOf(trousers || shoes).L;
    const L = deepOnly ? Math.max(25, Math.min(42, refL + 10)) : Math.max(30, Math.min(65, refL + (refL < 50 ? 15 : -15)));
    const C = Math.max(22, limit - 5);
    // candidatos en orden de preferencia; se propone el primero que cumple la regla (> 15 ΔE00 de pantalón y calzado)
    const L2 = L + (L < 50 ? 15 : -15), opp = (lch.h + 180) % 360;
    const cands = (analog ? [[(lch.h + 40) % 360, L, true], [(lch.h + 40) % 360, L2, true]] : [])
      .concat([[opp, L, false], [opp, L2, false], [(opp + 30) % 360, L, false], [(opp + 330) % 360, L, false], [(opp + 30) % 360, L2, false], [(opp + 330) % 360, L2, false]])
      .map((c) => ({ hex: labToHex(lchToLab({ L: c[1], C, h: c[0] })), analog: c[2] }));
    const found = cands.find((c) => fits(c.hex));
    if (found) {
      contrast = { type: 'contrast', hex: found.hex, rules: [found.analog ? 'contraste-analogo' : 'contraste-opuesto'], origin: 'rule', source: 'Regla calculada',
        explanation: (found.analog ? 'Vecino del ' : 'Opuesto al ') + nameOf(anchor) + ', con la saturación limitada (' + CONTEXT[formality] + (deepOnly ? ', tono profundo' : '') +
          '). Es una regla de partida, no una garantía: compruébalo con la prenda real.' };
    }
  }
  if (contrast && chroma(contrast.hex) > limit + 15) notes.push('El contraste propuesto es más saturado de lo habitual en un contexto ' + CONTEXT[formality] + '.');
  if (contrast && distinct(contrast.hex, chosen)) chosen.push(contrast);
  else notes.push('No se ha encontrado un contraste que se distinga de las otras propuestas con los datos actuales.');

  // ── Notas por tipo de calzado ──
  if (shoeType === 'loafer') notes.push(RULES.mocasin);
  if (shoeType === 'boot') notes.push(RULES.bota);
  if (shoeType === 'technical') notes.push(RULES['deportiva-tecnica']);
  if (shoeType === 'sneaker' && tone === 'dark') notes.push(RULES['deportiva-oscura']);
  if (shoeType === 'formal' && formality !== 'formal') notes.push(RULES['calzado-formal']);
  if (fit.hidden) notes.push('Con calcetín invisible el color no se ve: estas propuestas sirven si eliges uno que se vea (' + fit.lengths.filter((l) => l !== 'invisible').map((l) => SOCK_LENGTH_LABEL[l].toLowerCase()).join(' o ') + ').');

  // ── Orden según dirección y formalidad ──
  const order = direction === 'minimal' ? ['safe', 'coordinated', 'contrast'] : direction === 'creative' ? ['contrast', 'coordinated', 'safe'] : ['coordinated', 'safe', 'contrast'];
  if (formality === 'formal') {          // formal: la continuidad primero y el contraste al final, sea cual sea la dirección
    order.splice(0, order.length, 'safe', ...order.filter((t) => t !== 'safe' && t !== 'contrast'), 'contrast');
    chosen.forEach((p) => { if (p.type !== 'coordinated') p.rules = p.rules.concat('formalidad'); });
    notes.push(RULES.formalidad);
  }
  return {
    insufficient: false, notes, shoeType, direction, fit,
    proposals: order.map((t) => chosen.find((p) => p.type === t)).filter(Boolean).map((p) => Object.assign(p, {
      label: TYPES[p.type], name: nameOf(p.hex), effect: EFFECT[p.type], contrastTrousers: contrastLevel(p.hex, trousers), contrastShoes: contrastLevel(p.hex, shoes),
      contrast: contrastLevel(p.hex, trousers || shoes), owned: nearestOwned(p.hex, owned, fit.lengths)
    }))
  };
}
