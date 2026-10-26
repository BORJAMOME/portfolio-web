/* ═══════════════════════════════════════════════
   tools/test-color.mjs: pruebas del motor de Color Studio
     node --test tools/test-color.mjs
   Sin dependencias ni red: importa los módulos ES de color-studio/ (motor, composición, calcetines y datos).
   La interfaz se prueba aparte con tools/check-color.mjs.
   ═══════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../color-studio/engine.js';
import * as S from '../color-studio/socks.js';
import * as D from '../color-studio/data.js';
import * as C from '../color-studio/compose.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/* ── HEX ── */
test('normalizeHex: formatos válidos', () => {
  assert.equal(E.normalizeHex('#abc'), '#AABBCC');
  assert.equal(E.normalizeHex('abc'), '#AABBCC');
  assert.equal(E.normalizeHex('  #1f2a44 '), '#1F2A44');
  assert.equal(E.normalizeHex('1F2A44'), '#1F2A44');
});
test('normalizeHex: formatos no válidos', () => {
  for (const v of ['', '#ab', '#abcd', '#GGGGGG', 'rgb(1,2,3)', '##123456', '#1234567', null, undefined, 12, {}]) assert.equal(E.normalizeHex(v), null, String(v));
  assert.equal(E.isValidHex('#zzz'), false);
});
test('hexToRgb / rgbToHex ida y vuelta, con recorte', () => {
  assert.deepEqual(E.hexToRgb('#FF8000'), { r: 255, g: 128, b: 0 });
  assert.equal(E.rgbToHex(255, 128, 0), '#FF8000');
  assert.equal(E.rgbToHex(300, -4, 12.6), '#FF000D');
  for (const h of ['#000000', '#FFFFFF', '#1F2A44', '#C9A23A']) assert.equal(E.labToHex(E.hexToLab(h)), h);
});

/* ── Distancias ── */
test('deltaE2000: pares de referencia publicados (Sharma, Wu y Dalal, 2005)', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
    [[50, 2.5, 0], [73, 25, -18], 27.1492], [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373], [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082]
  ];
  for (const [a, b, exp] of pairs) assert.ok(near(E.deltaE2000({ L: a[0], a: a[1], b: a[2] }, { L: b[0], a: b[1], b: b[2] }), exp, 1e-4), String(exp));
});
test('colorDistance: idéntico 0, simétrico e Infinity con HEX no válido', () => {
  assert.equal(E.colorDistance('#abc', '#AABBCC'), 0);
  assert.ok(near(E.colorDistance('#1F2A44', '#B48A5A'), E.colorDistance('#B48A5A', '#1F2A44'), 1e-9));
  assert.equal(E.colorDistance('#xyz', '#000'), Infinity);
});
test('matchKind: umbrales', () => {
  assert.equal(E.matchKind(0), 'exact');
  assert.equal(E.matchKind(4.9), 'close');
  assert.equal(E.matchKind(9.9), 'near');
  assert.equal(E.matchKind(10.1), 'none');
});

/* ── Familias ── */
test('describeColor: familias de colores de referencia', () => {
  const cases = { '#111111': 'negro', '#FAFAFA': 'blanco', '#808080': 'gris', '#36393D': 'gris', '#D8C3A5': 'beige', '#F3EBDD': 'beige',
    '#6B4226': 'marron', '#C19A6B': 'marron', '#1B2A4A': 'marino', '#000080': 'marino', '#0000FF': 'azul', '#87CEEB': 'azul', '#4A6A8A': 'azul',
    '#008000': 'verde', '#708238': 'verde', '#8F8A5C': 'verde', '#FFFF00': 'amarillo', '#C9A227': 'amarillo', '#FFA500': 'naranja',
    '#FF0000': 'rojo', '#800020': 'rojo', '#FFC0CB': 'rosa', '#800080': 'morado', '#B57EDC': 'morado' };
  for (const [hex, fam] of Object.entries(cases)) assert.equal(E.familyOf(hex), fam, hex);
  assert.equal(E.describeColor('nope'), null);
  assert.equal(E.isNeutral('#1B2A4A'), true);
  assert.equal(E.isNeutral('#FF0000'), false);
});

/* ── Paletas ── */
test('normalizePaletteColors: conserva el original y el orden, descarta lo no válido', () => {
  const r = E.normalizePaletteColors(['#abc', { hex: '1f2a44', name: 'marino' }, 'nada', { original: ' 3e2723 ' }]);
  assert.deepEqual(r.colors.map((c) => c.hex), ['#AABBCC', '#1F2A44', '#3E2723']);
  assert.equal(r.colors[0].original, '#abc');
  assert.equal(r.colors[2].original, '3e2723');
  assert.equal(r.colors[1].name, 'marino');
  assert.equal(r.errors.length, 1);
});
test('paletas de 2, 3, 4, 5 y más colores', () => {
  for (const n of [2, 3, 4, 5, 7]) {
    const v = D.validatePalette({ colors: Array.from({ length: n }, (_, i) => E.rgbToHex(i * 30, 80, 200 - i * 20)) });
    assert.equal(v.ok, true, String(n));
    assert.equal(v.value.colors.length, n);
  }
  assert.equal(D.validatePalette({ colors: Array.from({ length: 13 }, () => '#000') }).ok, false);
  assert.equal(D.validatePalette({ colors: [] }).ok, false);
});
test('findDuplicates: idéntica, reordenada y casi idéntica', () => {
  const base = { id: 'a', colors: [{ hex: '#1F2A44' }, { hex: '#B48A5A' }, { hex: '#F4F2EC' }] };
  const lib = [base,
    { id: 'b', colors: [{ hex: '#1F2A44' }, { hex: '#B48A5A' }, { hex: '#F4F2EC' }] },
    { id: 'c', colors: [{ hex: '#F4F2EC' }, { hex: '#1F2A44' }, { hex: '#B48A5A' }] },
    { id: 'd', colors: [{ hex: '#1F2A45' }, { hex: '#B48A5B' }, { hex: '#F4F2ED' }] },
    { id: 'e', colors: [{ hex: '#1F2A44' }, { hex: '#B48A5A' }] }];
  const d = E.findDuplicates(base, lib);
  assert.deepEqual(d.map((x) => x.palette.id + ':' + x.kind), ['b:identical', 'c:reordered', 'd:near']);
});
test('matchColorsToPalette: exacta, aproximada y sin relación', () => {
  const pal = { colors: [{ hex: '#1F2A44' }, { hex: '#B48A5A' }, { hex: '#F4F2EC' }] };
  const exact = E.matchColorsToPalette([{ hex: '#1F2A44', share: 35 }, { hex: '#F4F2EC', share: 30 }], pal);
  assert.equal(exact.overall, 'exact');
  assert.equal(exact.connected, 2);
  const approx = E.matchColorsToPalette([{ hex: '#222D48', share: 35 }, { hex: '#FF0000', share: 10 }], pal);
  assert.equal(approx.overall, 'approx');
  assert.equal(approx.connected, 1);
  assert.ok(near(approx.coveredShare, 35 / 45));
  assert.equal(E.matchColorsToPalette([{ hex: '#00FF00' }], pal).overall, 'none');
  const lines = E.explainMatch(approx, pal);
  assert.match(lines[0], /se parece al color 1/);
  assert.match(lines[1], /no tiene equivalente/);
});
test('rankPalettes: más conexiones primero, sin paletas sin relación', () => {
  const colors = [{ hex: '#1F2A44', share: 35 }, { hex: '#B48A5A', share: 25 }];
  const p1 = { id: 1, colors: [{ hex: '#1F2A44' }, { hex: '#FF0000' }] };
  const p2 = { id: 2, colors: [{ hex: '#1F2A44' }, { hex: '#B48A5A' }] };
  const p3 = { id: 3, colors: [{ hex: '#00FF00' }] };
  assert.deepEqual(E.rankPalettes(colors, [p1, p2, p3]).map((r) => r.palette.id), [2, 1]);
});

/* ── Proporciones ── */
const item = (slot, weight, hex, extra) => Object.assign({ slot, label: slot, weight, colors: hex ? [{ hex, share: 1 }] : [] }, extra || {});
test('estimateDistribution: outfit sin prendas', () => {
  const d = E.estimateDistribution([]);
  assert.equal(d.valid, false);
  assert.deepEqual(d.colors, []);
});
test('estimateDistribution: pesos por defecto suman 100 y el negro se acumula', () => {
  const d = E.estimateDistribution([item('bottom', 35, '#111111'), item('top', 30, '#F4F2EC'), item('outer', 25, '#B48A5A'), item('shoes', 10, '#111111')]);
  assert.equal(d.valid, true);
  assert.ok(near(sum(d.colors.map((c) => c.pct)), 100));
  assert.ok(near(sum(d.garments.map((g) => g.pct)), 100));
  assert.equal(d.colors[0].hex, '#111111');
  assert.ok(near(d.colors[0].pct, 45));
  assert.equal(d.colors[0].sources.length, 2);
});
test('estimateDistribution: colores casi idénticos se agrupan y se avisa', () => {
  const d = E.estimateDistribution([item('bottom', 35, '#111111'), item('shoes', 10, '#141414')]);
  assert.equal(d.colors.length, 1);
  assert.equal(d.colors[0].hex, '#111111');
  assert.ok(d.warnings.some((w) => /agrupan/.test(w)));
  assert.equal(E.estimateDistribution([item('bottom', 35, '#111111'), item('shoes', 10, '#141414')], { mergeTolerance: 0 }).colors.length, 2);
});
test('estimateDistribution: pesos nulos, negativos y no válidos cuentan 0 sin dividir por cero', () => {
  const d = E.estimateDistribution([item('bottom', null, '#111111'), item('top', -5, '#FFFFFF'), item('shoes', 'abc', '#4A2E1F')]);
  assert.equal(d.valid, false);
  assert.equal(d.total, 0);
  assert.equal(d.warnings.length, 3);
  const ok = E.estimateDistribution([item('bottom', '35', '#111111'), item('top', -5, '#FFFFFF')]);
  assert.equal(ok.valid, true);
  assert.ok(near(ok.colors[0].pct, 100));
});
test('estimateDistribution: prenda multicolor reparte su superficie', () => {
  const parts = E.garmentColorParts({ primary_color: '#1F2A44', secondary_colors: ['#F4F2EC'], color_shares: [3, 1] });
  assert.deepEqual(parts.map((p) => p.share), [0.75, 0.25]);
  const d = E.estimateDistribution([{ slot: 'top', label: 'Camisa', weight: 50, colors: parts }, item('bottom', 50, '#B48A5A')]);
  assert.ok(near(d.colors.find((c) => c.hex === '#1F2A44').pct, 37.5));
  assert.deepEqual(E.garmentColorParts({ primary_color: '#1F2A44', secondary_colors: ['#F4F2EC'] }), [{ hex: '#1F2A44', share: 1 }]);
  assert.deepEqual(E.garmentColorParts({ primary_color: '#1F2A44', secondary_colors: ['#F4F2EC'], color_shares: [0, 0] }), [{ hex: '#1F2A44', share: 1 }]);
});
test('roundPercentages: enteros que suman 100', () => {
  assert.deepEqual(E.roundPercentages([33.333, 33.333, 33.334]), [33, 33, 34]);
  assert.equal(sum(E.roundPercentages([35, 30, 25, 10].map((x) => x / 0.97))), 100);
  assert.deepEqual(E.roundPercentages([]), []);
  assert.deepEqual(E.roundPercentages([0, 0]), [0, 0]);
  assert.equal(sum(E.roundPercentages([1, 1, 1, 1, 1, 1, 1])), 100);
});
test('setColorShare: edición manual mantiene el 100 % y reparte en proporción', () => {
  const base = [{ hex: '#111111', pct: 50 }, { hex: '#FFFFFF', pct: 30 }, { hex: '#B48A5A', pct: 20 }];
  const r = E.setColorShare(base, '#111111', 60);
  assert.ok(near(sum(r.map((x) => x.pct)), 100));
  assert.ok(near(r[0].pct, 60));
  assert.ok(near(r[1].pct, 24) && near(r[2].pct, 16));
  const zero = E.setColorShare([{ hex: '#111111', pct: 100 }, { hex: '#FFFFFF', pct: 0 }, { hex: '#B48A5A', pct: 0 }], '#111111', 40);
  assert.ok(near(zero[1].pct, 30) && near(zero[2].pct, 30));
  assert.ok(near(E.setColorShare(base, '#111111', 150)[0].pct, 100));
  assert.ok(near(E.setColorShare(base, '#111111', -3)[0].pct, 0));
  assert.deepEqual(E.setColorShare(base, '#000000', 10).map((x) => Math.round(x.pct)), [50, 30, 20]);
});
test('normalizeDistribution: descarta lo no válido y normaliza', () => {
  assert.deepEqual(E.normalizeDistribution([{ hex: '#111', pct: 1 }, { hex: 'x', pct: 5 }, { hex: '#FFF', pct: 3 }]).map((x) => x.pct), [25, 75]);
  assert.deepEqual(E.normalizeDistribution([{ hex: '#111', pct: 0 }]), []);
  assert.deepEqual(E.normalizeDistribution(null), []);
});

/* ── Extracción de color ── */
test('extractDominantColors: prenda centrada sobre fondo claro', () => {
  const W = 40, H = 40, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, inside = x > 8 && x < 32 && y > 6 && y < 34;
    const [r, g, b] = inside ? (y < 20 ? [31, 42, 68] : [180, 138, 90]) : [240, 240, 238];
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  const out = E.extractDominantColors(data, W, H, { k: 4 });
  assert.ok(out.length >= 2);
  assert.ok(E.colorDistance(out[0].hex, '#1F2A44') < 5 || E.colorDistance(out[0].hex, '#B48A5A') < 5, out[0].hex);
  assert.ok(out.every((c) => E.colorDistance(c.hex, '#F0F0EE') > 5 || c.share < 0.2), 'el fondo no domina');
  assert.ok(near(sum(out.map((c) => c.share)), 1, 0.1));
  assert.deepEqual(E.extractDominantColors(new Uint8ClampedArray(16), 2, 2), []);   // todo transparente
});

/* ── Calcetines ── */
const socks = [{ id: 's1', name: 'Calcetín marino', primary_color: '#1E2740' }, { id: 's2', name: 'Calcetín burdeos', primary_color: '#6E2230' }];
test('recommendSocks: sin pantalón ni calzado explica la limitación', () => {
  const r = S.recommendSocks({});
  assert.equal(r.insufficient, true);
  assert.equal(r.proposals.length, 0);
  assert.match(r.notes[0], /pantalón o el calzado/);
});
test('recommendSocks: tres propuestas, continuidad = pantalón (con el calcetín propio si es casi igual)', () => {
  const r = S.recommendSocks({ trousers: '#1F2A44', shoes: '#4A2E1F', others: [{ hex: '#6B1F2A', label: 'Jersey', share: 30 }], formality: 'smart', preference: 'discreet', socks });
  assert.deepEqual(r.proposals.map((p) => p.type), ['safe', 'coordinated', 'contrast']);
  const safe = r.proposals[0];
  assert.equal(safe.label, 'Continuidad');
  assert.equal(safe.hex, '#1E2740', 'usa el calcetín marino que ya tienes (ΔE00 ≤ 8)');
  assert.equal(safe.origin, 'owned');
  assert.deepEqual(safe.rules, ['continuidad-pantalon']);
  assert.equal(safe.owned.garment.id, 's1');
  assert.equal(r.proposals[1].hex, '#6B1F2A');
  assert.equal(r.proposals[1].owned.garment.id, 's2');
  r.proposals.forEach((p) => { assert.ok(p.explanation.length > 20); assert.ok(p.rules.every((id) => S.RULES[id])); });
});
test('recommendSocks: preferencia y formalidad cambian el orden', () => {
  const base = { trousers: '#B9AE96', shoes: '#4A2E1F', others: [{ hex: '#A9C1DC', label: 'Camisa' }] };
  assert.deepEqual(S.recommendSocks(Object.assign({ preference: 'contrast', formality: 'casual' }, base)).proposals.map((p) => p.type), ['contrast', 'coordinated', 'safe']);
  assert.deepEqual(S.recommendSocks(Object.assign({ preference: 'balanced', formality: 'casual' }, base)).proposals.map((p) => p.type), ['coordinated', 'safe', 'contrast']);
  const formal = S.recommendSocks(Object.assign({ preference: 'contrast', formality: 'formal' }, base));
  assert.deepEqual(formal.proposals.map((p) => p.type), ['safe', 'coordinated', 'contrast']);
  assert.ok(formal.proposals[0].rules.includes('formalidad'));
});
test('recommendSocks: sin colores arriba, coordina con el calzado o va tono sobre tono', () => {
  const shoe = S.recommendSocks({ trousers: '#1F2A44', shoes: '#4A2E1F' });
  assert.equal(shoe.proposals.find((p) => p.type === 'coordinated').rules[0], 'continuidad-calzado');
  const mono = S.recommendSocks({ trousers: '#1F2A44', shoes: '#1F2A44' });
  const c = mono.proposals.find((p) => p.type === 'coordinated');
  assert.equal(c.rules[0], 'tono-sobre-tono');
  assert.ok(E.hexToLab(c.hex).L > E.hexToLab('#1F2A44').L, 'un pantalón muy oscuro no admite un tono más oscuro: va uno más claro');
  const light = S.recommendSocks({ trousers: '#8A8D91', shoes: '#8A8D91' }).proposals.find((p) => p.type === 'coordinated');
  assert.ok(E.hexToLab(light.hex).L < E.hexToLab('#8A8D91').L);
});
test('recommendSocks: el contraste sale de una paleta de la biblioteca si encaja', () => {
  const pal = { id: 'p', name: 'Bosque', colors: [{ hex: '#1F2A44' }, { hex: '#4A2E1F' }, { hex: '#C9A23A', name: 'mostaza' }] };
  const r = S.recommendSocks({ trousers: '#1F2A44', shoes: '#4A2E1F', palettes: [pal], formality: 'casual' });
  const x = r.proposals.find((p) => p.type === 'contrast');
  assert.equal(x.origin, 'palette');
  assert.equal(x.hex, '#C9A23A');
  assert.match(x.explanation, /Bosque/);
  const noLib = S.recommendSocks({ trousers: '#1F2A44', shoes: '#4A2E1F', formality: 'formal' }).proposals.find((p) => p.type === 'contrast');
  assert.equal(noLib.origin, 'rule');
  assert.ok(E.labToLch(E.hexToLab(noLib.hex)).C <= 26, 'formal: saturación contenida');
});
test('recommendSocks: sin pantalón, la segura sigue al calzado y se avisa', () => {
  const r = S.recommendSocks({ shoes: '#4A2E1F' });
  assert.equal(r.proposals.find((p) => p.type === 'safe').rules[0], 'continuidad-calzado');
  assert.ok(r.notes.some((n) => /Sin pantalón/.test(n)));
});

/* ── Calcetines 2.0: casos representativos (ejemplos para probar reglas, no leyes de moda) ── */
const L = (hex) => E.labToLch(E.hexToLab(hex)).L, Ch = (hex) => E.labToLch(E.hexToLab(hex)).C;
const distinctAll = (ps) => ps.every((p, i) => ps.every((q, j) => i === j || E.colorDistance(p.hex, q.hex) > 10));
test('inferShoeType y sneakerTone: tipo desde el texto escrito y tono desde el color', () => {
  assert.equal(S.inferShoeType('Bota chelsea'), 'boot');
  assert.equal(S.inferShoeType('mocasín penny'), 'loafer');
  assert.equal(S.inferShoeType('Zapatilla blanca'), 'sneaker');
  assert.equal(S.inferShoeType('zapatillas de running'), 'technical');
  assert.equal(S.inferShoeType('Oxford negro'), 'formal');
  assert.equal(S.inferShoeType('Calzado'), null);
  assert.equal(S.inferShoeType(''), null);
  assert.equal(S.sneakerTone('#F4F4F2'), 'white');
  assert.equal(S.sneakerTone('#1A1A1A'), 'dark');
  assert.equal(S.sneakerTone('#C8452B'), 'colored');
});
test('calcetines: pantalón marino y zapato marrón formal → continuidad primero y contraste profundo', () => {
  const r = S.recommendSocks({ trousers: '#1F2A44', shoes: '#4A2E1F', shoeType: 'formal', formality: 'formal', others: [{ hex: '#F4F2EC', label: 'Camisa' }] });
  assert.equal(r.proposals[0].type, 'safe');
  assert.ok(r.proposals[0].rules.includes('calzado-formal'));
  const x = r.proposals.find((p) => p.type === 'contrast');
  assert.ok(L(x.hex) <= 50 && Ch(x.hex) <= 30, 'formal: contraste profundo y contenido');
  assert.ok(distinctAll(r.proposals));
});
test('calcetines: pantalón gris y calzado oscuro → continuidad un punto más oscura, no el mismo HEX', () => {
  const r = S.recommendSocks({ trousers: '#8A8D91', shoes: '#202020' });
  const safe = r.proposals.find((p) => p.type === 'safe');
  assert.notEqual(safe.hex, '#8A8D91');
  assert.ok(L(safe.hex) < L('#8A8D91') && E.colorDistance(safe.hex, '#8A8D91') < 10);
  assert.ok(safe.rules.includes('separacion-sutil'));
});
test('calcetines: pantalón claro y deportivas blancas → coordinación en blanco y continuidad más oscura', () => {
  const r = S.recommendSocks({ trousers: '#D9CFBA', shoes: '#F4F4F2', shoeType: 'sneaker', formality: 'casual', others: [{ hex: '#1F2A44', label: 'Jersey' }] });
  const coord = r.proposals.find((p) => p.type === 'coordinated'), safe = r.proposals.find((p) => p.type === 'safe');
  assert.deepEqual(coord.rules, ['deportiva-blanca']);
  assert.equal(coord.hex, '#F4F4F2');
  assert.ok(safe.rules.includes('pantalon-claro') && L(safe.hex) < L('#D9CFBA'));
  assert.match(coord.explanation, /deportivas/);
});
test('calcetines: pantalón oliva y deportivas neutras, dirección creativa → el contraste va primero', () => {
  const r = S.recommendSocks({ trousers: '#5E6B3A', shoes: '#B8B3A8', shoeType: 'sneaker', formality: 'casual', direction: 'creative', others: [{ hex: '#F4F2EC', label: 'Camiseta' }] });
  assert.deepEqual(r.proposals.map((p) => p.type), ['contrast', 'coordinated', 'safe']);
  assert.equal(r.direction, 'creative');
  assert.ok(distinctAll(r.proposals));
});
test('calcetines: pantalón negro y calzado que contrasta → continuidad negra y tres tonos distintos', () => {
  const r = S.recommendSocks({ trousers: '#151515', shoes: '#B5452B', others: [{ hex: '#9A9A97', label: 'Camiseta' }] });
  assert.equal(r.proposals.find((p) => p.type === 'safe').hex, '#151515');
  assert.equal(r.proposals.length, 3);
  assert.ok(distinctAll(r.proposals));
});
test('calcetines: pantalón estampado → la coordinación recoge un secundario del dibujo', () => {
  const r = S.recommendSocks({ trousers: '#3B4A5E', trousersSecondary: ['#B7472A'], trousersPattern: 'cuadros', shoes: '#4A2E1F' });
  const coord = r.proposals.find((p) => p.type === 'coordinated');
  assert.equal(coord.hex, '#B7472A');
  assert.ok(coord.rules.includes('secundario-estampado'));
  assert.ok(r.notes.some((n) => /dibujo/.test(n)));
});
test('calcetines: un acento arriba se lleva al tobillo en la coordinación', () => {
  const r = S.recommendSocks({ trousers: '#8A8D91', shoes: '#202020', others: [{ hex: '#F4F2EC', label: 'Camisa', share: 30 }, { hex: '#C9A23A', label: 'Accesorio', share: 3 }], direction: 'balanced' });
  assert.equal(r.proposals.find((p) => p.type === 'coordinated').hex, '#C9A23A', 'equilibrada/creativa: el color antes que el neutro');
  const min = S.recommendSocks({ trousers: '#8A8D91', shoes: '#202020', others: [{ hex: '#F4F2EC', label: 'Camisa', share: 30 }, { hex: '#C9A23A', label: 'Accesorio', share: 3 }], direction: 'minimal' });
  assert.equal(min.proposals.find((p) => p.type === 'coordinated').hex, '#F4F2EC', 'minimalista: el neutro antes que el color');
  assert.deepEqual(min.proposals.map((p) => p.type), ['safe', 'coordinated', 'contrast']);
});
test('calcetines: sin calcetines registrados no se inventa ninguno propio', () => {
  const r = S.recommendSocks({ trousers: '#1F2A44', shoes: '#4A2E1F', socks: [] });
  assert.ok(r.proposals.every((p) => p.owned === null));
  assert.ok(r.proposals.every((p) => p.origin !== 'owned'));
});
test('calcetines: con poca información no se inventa diversidad y se explica', () => {
  const r = S.recommendSocks({ trousers: '#1F2A44', shoes: '#1F2A44', others: [{ hex: '#1F2A44', label: 'Jersey' }] });
  assert.ok(distinctAll(r.proposals), 'nunca dos propuestas del mismo tono');
  assert.ok(r.proposals.length >= 2);
});
test('calcetines: la formalidad y la dirección cambian la intensidad del contraste calculado', () => {
  const base = { trousers: '#8A8D91', shoes: '#202020' };
  const formal = S.recommendSocks(Object.assign({ formality: 'formal', direction: 'minimal' }, base)).proposals.find((p) => p.type === 'contrast');
  const casual = S.recommendSocks(Object.assign({ formality: 'casual', direction: 'creative' }, base)).proposals.find((p) => p.type === 'contrast');
  assert.ok(Ch(formal.hex) < Ch(casual.hex), 'formal + minimalista más contenido que informal + creativo');
  assert.ok(['bajo', 'medio', 'alto'].includes(casual.contrast));
  assert.ok(casual.effect.length > 10);
});
test('calcetines: los calzados con nota propia la añaden sin cambiar las reglas de color', () => {
  ['loafer', 'boot', 'technical'].forEach((t) => {
    const r = S.recommendSocks({ trousers: '#1F2A44', shoes: '#4A2E1F', shoeType: t });
    assert.ok(r.notes.some((n) => n === S.RULES[{ loafer: 'mocasin', boot: 'bota', technical: 'deportiva-tecnica' }[t]]));
  });
});
test('calcetines: deterministas (mismo resultado en dos llamadas) y reglas conocidas', () => {
  const input = { trousers: '#5E6B3A', shoes: '#F4F4F2', shoeType: 'sneaker', others: [{ hex: '#6B1F2A', label: 'Jersey' }], palettes: [{ id: 'p', name: 'X', source_type: 'book', colors: [{ hex: '#5E6B3A' }, { hex: '#C9A23A' }] }] };
  assert.deepEqual(JSON.stringify(S.recommendSocks(input)), JSON.stringify(S.recommendSocks(input)));
  S.recommendSocks(input).proposals.forEach((p) => assert.ok(p.rules.every((id) => S.RULES[id]), p.rules.join()));
});

/* ── Composición y direcciones ── */
const G = (id, category, primary, extra) => Object.assign({ id, name: id, category, primary_color: primary, secondary_colors: [], color_shares: null, pattern: 'liso' }, extra || {});
const wardrobe = [
  G('chino-marino', 'pantalones', '#1F2A44'), G('chino-piedra', 'pantalones', '#B9AE96'),
  G('camisa-blanca', 'camisas', '#F4F2EC'), G('jersey-burdeos', 'jerseis', '#6B1F2A'), G('camiseta-gris', 'camisetas', '#9A9A97'), G('jersey-azul', 'jerseis', '#3A5078'),
  G('bota-marron', 'calzado', '#4A2E1F'), G('zapatilla-blanca', 'calzado', '#F2F1EE'),
  G('cal-burdeos', 'calcetines', '#6E2230'), G('panuelo-mostaza', 'accesorios', '#C9A23A'), G('sobrecamisa-oliva', 'chaquetas', '#5E6B3A')
];
const slotsOf = (map) => Object.fromEntries(Object.entries(map).map(([k, id]) => [k, { garment_id: id, hex: null, weight: E.SLOT[k].weight }]));
test('relation: tonal, análoga, complementaria, color sobre neutro e igual', () => {
  assert.equal(C.relation('#1F2A44', '#3A5078').kind, 'tonal');
  assert.equal(C.relation('#5E6B3A', '#C9A23A').kind, 'analoga');
  assert.equal(C.relation('#2E5FA8', '#D9822B').kind, 'complementaria');
  assert.equal(C.relation('#F4F2EC', '#6B1F2A').kind, 'base-neutra');
  assert.equal(C.relation('#1F2A44', '#1E2740').kind, 'igual');
  assert.equal(C.relation('#000000', '#FFFFFF').light, 'alto');
  assert.equal(C.relation('#1F2A44', 'nope'), null);
  assert.match(C.describeRelation(C.relation('#1F2A44', '#B48A5A')), /opuestos en versión apagada/);
});
test('temperatureOf: cálidos, fríos y neutros', () => {
  assert.equal(C.colorFacts('#B5452B').temperature, 'cálida');
  assert.equal(C.colorFacts('#2E5FA8').temperature, 'fría');
  assert.equal(C.colorFacts('#9A9A97').temperature, 'neutra');
});
test('analyzeOutfit: dominante, acento, repetición y lectura', () => {
  const items = C.buildItems(slotsOf({ bottom: 'chino-marino', top: 'jersey-burdeos', shoes: 'bota-marron', accessory: 'panuelo-mostaza', socks: 'cal-burdeos' }), wardrobe);
  const a = C.analyzeOutfit(items);
  assert.equal(a.dominant.hex, '#1F2A44');
  assert.deepEqual(a.accents.map((x) => x.hex), ['#C9A23A']);
  assert.ok(a.repetitions.some((r) => r.slots.includes('top') && r.slots.includes('socks')), 'el burdeos se repite arriba y en el tobillo');
  assert.equal(a.reading, 'balanced');
  const neutral = C.analyzeOutfit(C.buildItems(slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca', shoes: 'bota-marron' }), wardrobe));
  assert.equal(neutral.reading, 'minimal');
  assert.equal(neutral.accents.length, 0);
  const loud = C.analyzeOutfit(C.buildItems({ top: { hex: '#2E5FA8', weight: 30 }, bottom: { hex: '#D9822B', weight: 35 } }, []));
  assert.equal(loud.reading, 'creative');
  assert.equal(C.analyzeOutfit([]).valid, false);
});
test('analyzeOutfit: una distribución ajustada a mano cambia la jerarquía', () => {
  const items = C.buildItems(slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca' }), wardrobe);
  const manual = C.analyzeOutfit(items, { distribution: [{ hex: '#1F2A44', pct: 20 }, { hex: '#F4F2EC', pct: 80 }] });
  assert.equal(manual.dominant.hex, '#F4F2EC');
});
test('compareAnalyses: describe lo que cambia sin valorar', () => {
  const a = C.analyzeOutfit(C.buildItems(slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca' }), wardrobe));
  const b = C.analyzeOutfit(C.buildItems(slotsOf({ bottom: 'chino-marino', top: 'jersey-azul' }), wardrobe));
  const d = C.compareAnalyses(a, b);
  assert.ok(d.some((t) => /luminosidad: alto → (bajo|medio)/.test(t)), d.join(' | '));
  assert.ok(d.every((t) => !/mejor|peor|perfect|%/.test(t)));
});
test('proposeDirection: no toca el original, propone prendas reales y es determinista', () => {
  const slots = slotsOf({ bottom: 'chino-marino', top: 'jersey-burdeos', shoes: 'bota-marron', accessory: 'panuelo-mostaza' });
  const frozen = JSON.stringify(slots);
  const input = { slots, garments: wardrobe, palettes: [], formality: 'smart' };
  const min = C.proposeDirection('minimal', input);
  assert.equal(JSON.stringify(slots), frozen, 'el borrador original no cambia');
  assert.ok(min.proposals.length >= 1);
  const p = min.proposals[0];
  assert.equal(p.move, 'min-apagar');
  assert.ok(p.changes.every((ch) => ch.garment || ch.remove || ch.hypothetical));
  assert.ok(C.MOVES[p.move] && p.explanation.length > 30);
  assert.ok(p.after.weightedC < p.before.weightedC, 'minimalista: menos intensidad media');
  assert.equal(JSON.stringify(C.proposeDirection('minimal', input)), JSON.stringify(min));
  const eq = C.proposeDirection('balanced', input);
  const rep = eq.proposals.find((x) => x.move === 'eq-repetir');
  assert.ok(rep && rep.changes[0].garment.id === 'cal-burdeos', 'repite el burdeos del jersey con el calcetín que tienes');
});
test('proposeDirection: propuestas distintas entre sí y nunca iguales al original', () => {
  const input = { slots: slotsOf({ bottom: 'chino-marino', top: 'jersey-burdeos', shoes: 'bota-marron' }), garments: wardrobe, palettes: [], formality: 'smart' };
  ['minimal', 'balanced', 'creative'].forEach((d) => {
    const r = C.proposeDirection(d, input);
    assert.ok(r.proposals.length <= 2);
    const keys = r.proposals.map((p) => JSON.stringify(Object.entries(p.slots).map(([k, v]) => k + (v.garment_id || v.hex))));
    assert.equal(new Set(keys).size, keys.length, d + ': propuestas repetidas');
    r.proposals.forEach((p) => assert.notDeepEqual(p.slots, input.slots));
  });
});
test('proposeDirection: sin prenda real que encaje, la propuesta se marca como hipotética', () => {
  const r = C.proposeDirection('creative', { slots: slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca' }), garments: wardrobe.filter((g) => ['chino-marino', 'camisa-blanca'].includes(g.id)), palettes: [] });
  assert.ok(r.proposals.length);
  assert.ok(r.proposals.every((p) => p.hypothetical && p.changes.some((ch) => ch.hypothetical)));
  assert.match(r.proposals[0].explanation, /Hipótesis/);
});
test('proposeDirection: un conjunto ya minimalista sin alternativas no se fuerza', () => {
  const r = C.proposeDirection('minimal', { slots: slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca' }), garments: wardrobe.filter((g) => ['chino-marino', 'camisa-blanca'].includes(g.id)) });
  assert.equal(r.kept, true);
  assert.equal(r.note, C.MOVES.mantener);
  assert.match(C.proposeDirection('balanced', { slots: {}, garments: wardrobe }).note, /Elige al menos una prenda/);
});
test('proposeDirection creativa: usa primero una paleta de libro (Sanzo Wada) relacionada', () => {
  const own = { id: 'own', name: 'Mía', source_type: 'own', colors: [{ hex: '#1F2A44' }, { hex: '#F4F2EC' }, { hex: '#3A5078' }] };
  const wada = { id: 'w', name: 'Wada n.º 001', source_type: 'book', colors: [{ hex: '#1F2A44' }, { hex: '#F4F2EC' }, { hex: '#5E6B3A', name: 'oliva' }] };
  const r = C.proposeDirection('creative', { slots: slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca' }), garments: wardrobe, palettes: [own, wada] });
  const p = r.proposals.find((x) => x.move === 'cr-paleta');
  assert.equal(p.palette.id, 'w');
  assert.equal(p.changes[0].garment.id, 'sobrecamisa-oliva');
});
test('adaptPalette y proposeFromPalette: presente, prenda candidata y color que falta', () => {
  const pal = { id: 'p', name: 'Bosque', colors: [{ hex: '#1F2A44', name: 'marino' }, { hex: '#5E6B3A', name: 'oliva' }, { hex: '#7A3E9D', name: 'morado' }] };
  const input = { slots: slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca' }), garments: wardrobe };
  const rows = C.adaptPalette(pal, input);
  assert.equal(rows[0].present.slot, 'bottom');
  assert.equal(rows[1].candidate.garment.id, 'sobrecamisa-oliva');
  assert.ok(!rows[2].present && !rows[2].candidate);
  assert.ok(rows.every((x) => ['tonal', 'apoyo', 'contraste'].includes(x.role)));
  assert.ok(C.proposeFromPalette(pal, input));
  assert.equal(C.proposeFromPalette({ colors: [{ hex: '#1F2A44' }, { hex: '#F4F2EC' }] }, input), null, 'nada nuevo que aportar');
});

/* ── Validación, importación y exportación ── */
test('safeUrl: solo http(s)', () => {
  assert.equal(D.safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(D.safeUrl('javascript:alert(1)'), null);
  assert.equal(D.safeUrl('data:text/html,x'), null);
  assert.equal(D.safeUrl('no es url'), null);
});
test('validatePalette: origen, enlace y etiquetas', () => {
  const v = D.validatePalette({ name: '  Otoño ', colors: ['#111', '#eee'], tags: 'Otoño, neutros,otoño', source_type: 'book', source_url: 'https://x.org' });
  assert.equal(v.ok, true);
  assert.equal(v.value.name, 'Otoño');
  assert.deepEqual(v.value.tags, ['otoño', 'neutros']);
  assert.equal(D.validatePalette({ colors: ['#111'], source_url: 'ftp://x' }).ok, false);
  assert.equal(D.validatePalette({ colors: ['#111'], source_type: 'inventado' }).ok, false);
});
test('validateGarment: categoría, colores y reparto', () => {
  assert.equal(D.validateGarment({ category: 'camisas', primary_color: '#fff' }).ok, true);
  assert.equal(D.validateGarment({ category: 'sombreros', primary_color: '#fff' }).ok, false);
  assert.equal(D.validateGarment({ category: 'camisas', primary_color: 'blanco' }).ok, false);
  const v = D.validateGarment({ category: 'camisas', primary_color: '#fff', secondary_colors: ['#000', '#FFF', '#000'], color_shares: [] });
  assert.deepEqual(v.value.secondary_colors, ['#000000']);
  assert.equal(D.validateGarment({ category: 'camisas', primary_color: '#fff', secondary_colors: ['#000'], color_shares: [1] }).ok, false);
  assert.equal(D.validateGarment({ category: 'camisas', primary_color: '#fff', secondary_colors: ['#000'], color_shares: [-1, 2] }).ok, false);
});
test('validateOutfit: nombre, huecos y pesos', () => {
  assert.equal(D.validateOutfit({ name: 'Lunes', items: [{ slot: 'bottom', garment_id: 'g1', weight: 35 }] }).ok, true);
  assert.equal(D.validateOutfit({ name: '', items: [{ slot: 'bottom', garment_id: 'g1', weight: 35 }] }).ok, false);
  assert.equal(D.validateOutfit({ name: 'x', items: [] }).ok, false);
  assert.equal(D.validateOutfit({ name: 'x', items: [{ slot: 'bottom', garment_id: 'g1', weight: -1 }] }).ok, false);
  assert.equal(D.validateOutfit({ name: 'x', items: [{ slot: 'cabeza', garment_id: 'g1', weight: 1 }] }).ok, false);
  const manual = D.validateOutfit({ name: 'x', items: [{ slot: 'bottom', hex: '#111', weight: 1 }], distribution_override: [{ hex: '#111', pct: 2 }, { hex: '#fff', pct: 2 }] });
  assert.equal(manual.value.items[0].hex, '#111111');
  assert.deepEqual(manual.value.distribution_override.map((x) => x.pct), [50, 50]);
});
test('parseImportJSON: malformado, formato ajeno, versión futura y vacío', () => {
  assert.equal(D.parseImportJSON('{nope').ok, false);
  assert.equal(D.parseImportJSON('').ok, false);
  assert.equal(D.parseImportJSON('{"format":"otro","palettes":[]}').ok, false);
  assert.equal(D.parseImportJSON('{"format":"color-studio","version":9,"palettes":[]}').ok, false);
  assert.equal(D.parseImportJSON('{"a":1}').ok, false);
  assert.equal(D.parseImportJSON('"x"'.repeat(1)).ok, false);
});
test('parseImportJSON: exportación propia, lista de paletas y lista de listas', () => {
  const r = D.parseImportJSON(JSON.stringify([['#111', '#eee'], { name: 'B', colors: [{ hex: '#123456', name: 'azul' }] }, { colors: ['mal'] }]));
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0].errors.length, 0);
  assert.equal(r.rows[1].value.colors[0].name, 'azul');
  assert.ok(r.rows[2].errors.length > 0);
  const exp = D.buildExport({ palettes: [{ id: 'x', name: 'P', colors: [{ hex: '#111111', original: '#111' }], tags: [], source_type: 'own' }] }, new Date('2026-10-24T10:00:00Z'));
  const back = D.parseImportJSON(JSON.stringify(exp));
  assert.equal(back.ok, true);
  assert.equal(back.rows[0].value.colors[0].original, '#111');
});
test('parseImportCSV: cabecera en español, comillas y punto y coma', () => {
  const csv = 'nombre;colores;etiquetas;url\n"Otoño; urbano";#1F2A44 #B48A5A|#F4F2EC;otoño,neutros;https://ejemplo.org\nRota;nada;;\n';
  const r = D.parseImportCSV(csv);
  assert.equal(r.ok, true);
  assert.equal(r.rows[0].value.name, 'Otoño; urbano');
  assert.equal(r.rows[0].value.colors.length, 3);
  assert.equal(r.rows[0].value.source_url, 'https://ejemplo.org/');
  assert.equal(r.rows[1].errors.length > 0, true);
  assert.equal(D.parseImportCSV('name,tags\nA,b').ok, false);
});
test('reviewImport: duplicados frente a la biblioteca y dentro del archivo', () => {
  const lib = [{ id: 'l', name: 'Existente', colors: [{ hex: '#111111' }, { hex: '#EEEEEE' }] }];
  const rows = D.parseImportJSON(JSON.stringify([['#111', '#eee'], ['#eee', '#111'], ['#123456', '#654321'], ['#123456', '#654321'], ['mal']])).rows;
  const rev = D.reviewImport(rows, lib);
  assert.equal(rev[0].duplicates[0].kind, 'identical');
  assert.equal(rev[0].selected, false);
  assert.equal(rev[1].duplicates[0].kind, 'reordered');
  assert.equal(rev[1].selected, true);
  assert.equal(rev[2].duplicates.length, 0);
  assert.equal(rev[3].duplicates[0].where, 'archivo');
  assert.equal(rev[4].selected, false);
});
test('demoData: marcado como demo, sin fuentes reales y coherente con el motor', () => {
  const d = D.demoData();
  assert.ok(d.garments.every((g) => g.demo && D.validateGarment(g).ok));
  assert.ok(d.palettes.every((p) => p.demo && p.source_type === 'own' && !p.source_url && D.validatePalette(p).ok));
  assert.ok(d.palettes.every((p) => /inventado/.test(p.source_title)));
});
