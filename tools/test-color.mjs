/* ═══════════════════════════════════════════════
   tools/test-color.mjs: pruebas del motor de Color Studio
     node --test tools/test-color.mjs
   Sin dependencias ni red: importa los módulos ES de color-studio/ (motor, composición, calcetines, datos e inspiración).
   La interfaz se prueba aparte con tools/check-color.mjs.
   ═══════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../color-studio/engine.js';
import * as S from '../color-studio/socks.js';
import * as D from '../color-studio/data.js';
import * as C from '../color-studio/compose.js';
import * as I from '../color-studio/inspiration.js';

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
// Los 34 pares de prueba oficiales de CIEDE2000 (Sharma, Wu y Dalal, 2005: ciede2000testdata.txt)
const SHARMA = [
  [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
  [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
  [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
  [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0010, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0012, 7.2195],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
  [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
  [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
  [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
  [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
  [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
  [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082]
];
test('deltaE2000: los 34 pares de referencia publicados (Sharma, Wu y Dalal, 2005), simétrico', () => {
  assert.equal(SHARMA.length, 34);
  SHARMA.forEach((r, i) => {
    const a = { L: r[0], a: r[1], b: r[2] }, b = { L: r[3], a: r[4], b: r[5] };
    assert.ok(near(E.deltaE2000(a, b), r[6], 5e-5), 'par ' + (i + 1) + ': esperado ' + r[6] + ', obtenido ' + E.deltaE2000(a, b));
    assert.ok(near(E.deltaE2000(a, b), E.deltaE2000(b, a), 1e-12), 'par ' + (i + 1) + ' no simétrico');
  });
});
test('hexToLab: referencias sRGB D65 y ida y vuelta en una muestra amplia', () => {
  const ref = { '#FF0000': [53.2408, 80.0925, 67.2032], '#00FF00': [87.7347, -86.1827, 83.1793], '#0000FF': [32.2970, 79.1875, -107.8602], '#808080': [53.5850, 0, 0] };
  for (const [h, v] of Object.entries(ref)) { const l = E.hexToLab(h); assert.ok(near(l.L, v[0], 1e-3) && near(l.a, v[1], 1e-3) && near(l.b, v[2], 1e-3), h); }
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 20000; i++) { const h = E.rgbToHex(rnd() * 255, rnd() * 255, rnd() * 255); assert.equal(E.labToHex(E.hexToLab(h)), h); }
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
    '#6B4226': 'marron', '#C19A6B': 'marron', '#1B2A4A': 'marino', '#000080': 'azul', '#0000FF': 'azul', '#87CEEB': 'azul', '#4A6A8A': 'azul',
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

/* ── Fase 1 de la auditoría (color-studio/AUDITORIA-2026-10.md) ── */
test('CS-09: si la continuidad usa un calcetín propio idéntico al pantalón, no dice «un punto más oscuro»', () => {
  const r = S.recommendSocks({ trousers: '#8A8D91', shoes: '#202020', socks: [{ id: 's', name: 'Gris', primary_color: '#8A8D91' }] });
  const safe = r.proposals.find((p) => p.type === 'safe');
  assert.equal(safe.hex, '#8A8D91');
  assert.deepEqual(safe.rules, ['continuidad-pantalon']);
  const dark = S.recommendSocks({ trousers: '#8A8D91', shoes: '#202020', socks: [{ id: 's', name: 'Gris oscuro', primary_color: '#7E8185' }] }).proposals.find((p) => p.type === 'safe');
  assert.ok(dark.rules.includes('separacion-sutil'), 'un calcetín propio algo más oscuro sí es separación sutil');
});
test('CS-10: «informal» no se lee como zapato formal', () => {
  assert.equal(S.inferShoeType('Zapato informal'), 'casual');
  assert.equal(S.inferShoeType('Zapatilla informal'), 'sneaker');
  assert.equal(S.inferShoeType('Zapato formal'), 'formal');
  assert.equal(S.inferShoeType('Derby de vestir'), 'formal');
});
test('CS-11: el contraste propuesto siempre dista más de 15 ΔE00 del pantalón y del calzado', () => {
  let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const hx = () => E.rgbToHex(rnd() * 255, rnd() * 255, rnd() * 255);
  let bad = 0;
  for (let i = 0; i < 4000; i++) {
    const t = hx(), s = hx(), o = hx();
    const r = S.recommendSocks({ trousers: t, shoes: s, others: [{ hex: o, label: 'Camisa', share: 30 }], formality: ['formal', 'smart', 'casual'][i % 3], direction: ['minimal', 'balanced', 'creative'][(i >> 2) % 3] });
    const x = r.proposals.find((p) => p.type === 'contrast');
    if (x && (E.colorDistance(x.hex, t) <= 15 || E.colorDistance(x.hex, s) <= 15)) bad++;
    if (!x) assert.ok(r.notes.some((n) => /contraste/.test(n)), 'sin contraste y sin explicarlo');
  }
  assert.equal(bad, 0);
});
test('CS-12: el contraste se informa por separado frente al pantalón y frente al calzado', () => {
  const r = S.recommendSocks({ trousers: '#1F2A44', shoes: '#4A2E1F' });
  const coord = r.proposals.find((p) => p.type === 'coordinated');
  assert.equal(coord.hex, '#4A2E1F', 'coordina con el calzado');
  assert.equal(coord.contrastShoes, 'bajo');
  assert.notEqual(coord.contrastTrousers, 'bajo', 'frente al pantalón marino el marrón no es contraste bajo');
  assert.equal(coord.contrast, coord.contrastTrousers, 'el nivel principal es frente al pantalón');
  const noTr = S.recommendSocks({ shoes: '#4A2E1F' }).proposals[0];
  assert.equal(noTr.contrastTrousers, null);
  assert.equal(noTr.contrast, noTr.contrastShoes);
});

/* ── Fase 2 de la auditoría (color-studio/AUDITORIA-2026-10.md) ── */
const W = 96, H = 120;
function synth(fn) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = E.hexToRgb(fn(x, y)); const o = (y * W + x) * 4; d[o] = c.r; d[o + 1] = c.g; d[o + 2] = c.b; d[o + 3] = 255; }
  return d;
}
const inBox = (x, y, x0, y0, x1, y1) => x >= W * x0 && x < W * x1 && y >= H * y0 && y < H * y1;
test('CS-03: una prenda con media superficie en sombra da su color, no el de la sombra', () => {
  const r = E.extractDominantColors(synth((x, y) => inBox(x, y, .2, .15, .8, .85) ? (x > W / 2 ? '#B5452B' : '#76281A') : '#F0F0EE'), W, H, { k: 5 });
  assert.ok(E.colorDistance(r[0].hex, '#B5452B') <= 5, 'primer color ' + r[0].hex + ' (ΔE00 ' + E.colorDistance(r[0].hex, '#B5452B').toFixed(1) + ')');
  assert.ok(!r.some((c) => E.colorDistance(c.hex, '#76281A') <= 5), 'la sombra sigue como color aparte');
});
test('CS-03: dos colores reales de la misma familia pero distintos no se fusionan (camel y marrón; marino y azul claro)', () => {
  const two = (a, b) => E.extractDominantColors(synth((x, y) => inBox(x, y, .2, .15, .8, .85) ? (x > W / 2 ? a : b) : '#F0F0EE'), W, H, { k: 5 });
  const cb = two('#B48A5A', '#4A2E1F');
  assert.ok(cb.some((c) => E.colorDistance(c.hex, '#B48A5A') <= 5) && cb.some((c) => E.colorDistance(c.hex, '#4A2E1F') <= 5));
  const nb = two('#1F2A44', '#A9C1DC');
  assert.ok(nb.some((c) => E.colorDistance(c.hex, '#1F2A44') <= 5) && nb.some((c) => E.colorDistance(c.hex, '#A9C1DC') <= 5));
});
test('CS-04: un fondo de rayas de dos colores no se propone como color de la prenda', () => {
  const r = E.extractDominantColors(synth((x, y) => inBox(x, y, .25, .2, .75, .8) ? '#A9C1DC' : (Math.floor(x / 6) % 2 ? '#7A4E2D' : '#E9E2D0')), W, H, { k: 5 });
  assert.ok(E.colorDistance(r[0].hex, '#A9C1DC') <= 5, 'primer color ' + r[0].hex);
  const bg = r.filter((c) => E.colorDistance(c.hex, '#7A4E2D') <= 5 || E.colorDistance(c.hex, '#E9E2D0') <= 5);
  assert.ok(bg.every((c) => c.share < 0.12), 'el fondo pesa demasiado: ' + JSON.stringify(r));
});
test('CS-04: la prenda que llena la foto y la centrada sobre fondo liso siguen funcionando', () => {
  assert.equal(E.extractDominantColors(synth(() => '#6B1F2A'), W, H)[0].hex, '#6B1F2A');
  const r = E.extractDominantColors(synth((x, y) => inBox(x, y, .2, .15, .8, .85) ? '#1F2A44' : '#EDEDEB'), W, H, { k: 5 });
  assert.equal(r[0].hex, '#1F2A44');
});
test('CS-08: familias de colores frecuentes en ropa', () => {
  const cases = {
    '#808000': ['verde', 'verde oliva'], '#556B2F': ['verde', 'verde oliva oscuro'], '#BDB76B': ['beige', 'caqui claro'], '#A89F6E': ['beige', 'caqui claro'],
    '#E1AD01': ['amarillo', 'mostaza'], '#D4A017': ['amarillo', 'mostaza'], '#B8860B': ['amarillo', 'mostaza'], '#C9A23A': ['amarillo', 'mostaza'],
    '#CC7722': ['naranja', 'ocre'], '#000080': ['azul', 'azul marino intenso'], '#1F2A44': ['marino', 'azul marino'], '#008080': ['azul', 'azul petróleo'],
    '#C19A6B': ['marron', 'camel'], '#B9AE96': ['beige', 'piedra'], '#40E0D0': ['azul', 'turquesa'], '#FFD700': ['amarillo', 'amarillo'], '#B5452B': ['naranja', 'teja'], '#4A2E1F': ['marron', 'marrón oscuro'], '#6B1F2A': ['rojo', 'granate']
  };
  for (const [hex, [fam, name]] of Object.entries(cases)) { const d = E.describeColor(hex); assert.deepEqual([d.family, d.name], [fam, name], hex); }
  assert.equal(E.isNeutral('#BDB76B'), true, 'el caqui claro es un neutro de vestuario');
  assert.equal(E.isNeutral('#000080'), false, 'un marino muy saturado ya no cuenta como neutro');
  assert.equal(E.familyOf(E.labToHex(E.lchToLab({ L: 50, C: 8, h: 128 }))), 'gris', 'un gris verdoso muy apagado sigue siendo gris');
});
test('CS-16: un color fuera de gama conserva luminosidad y tono al pasar a HEX (reduce croma)', () => {
  for (const [L, C, h] of [[60, 120, 140], [40, 110, 300], [85, 90, 20], [20, 80, 250]]) {
    const back = E.labToLch(E.hexToLab(E.labToHex(E.lchToLab({ L, C, h }))));
    assert.ok(Math.abs(back.L - L) <= 1.5, 'L ' + L + ' → ' + back.L.toFixed(1));
    assert.ok(C3(back.h, h) <= 3, 'h ' + h + ' → ' + back.h.toFixed(1));
    assert.ok(back.C < C, 'debe reducir croma');
  }
  // los colores ya en gama no cambian
  for (const hex of ['#1F2A44', '#C9A23A', '#FF0000', '#00FF00', '#0000FF', '#FFFFFF', '#000000']) assert.equal(E.labToHex(E.hexToLab(hex)), hex);
});
function C3(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
test('CS-07: paletas relacionadas por familia cuando no hay colores próximos, señaladas como tales', () => {
  const outfit = [{ hex: '#1F2A44', share: 50 }, { hex: '#B9AE96', share: 40 }];
  const pal = { id: 'f', name: 'Familia', colors: [{ hex: '#004466', name: 'azul profundo' }, { hex: '#BB9988', name: 'arena rosada' }, { hex: '#9E2B25', name: 'rojo' }] };
  assert.equal(E.rankPalettes(outfit, [pal]).length, 0, 'por proximidad estricta no conecta');
  const r = C.rankPalettesByFamily(outfit, [pal]);
  assert.equal(r.length, 1);
  assert.equal(r[0].match.kind, 'family');
  assert.equal(r[0].match.links.length, 2);
  assert.ok(r[0].match.links.every((l) => l.sameFamily && l.dL <= 15));
  const far = { id: 'x', name: 'Lejos', colors: [{ hex: '#FFD700' }, { hex: '#00A86B' }] };
  assert.equal(C.rankPalettesByFamily(outfit, [far]).length, 0, 'sin relación de familia');
  const one = { id: 'o', name: 'Uno', colors: [{ hex: '#004466' }, { hex: '#FFD700' }] };
  assert.equal(C.rankPalettesByFamily(outfit, [one]).length, 0, 'una sola coincidencia de familia no basta');
});

/* ── Fase 3 de la auditoría ── */
test('CS-13: validateOutfit conserva la marca de color hipotético (solo en huecos con color, no con prenda)', () => {
  const v = D.validateOutfit({ name: 'X', items: [{ slot: 'accessory', hex: '#C9A23A', weight: 3, hypothetical: true }, { slot: 'bottom', garment_id: 'g1', weight: 35, hypothetical: true }, { slot: 'top', hex: '#FFFFFF', weight: 30 }] });
  assert.equal(v.ok, true);
  assert.equal(v.value.items[0].hypothetical, true);
  assert.equal('hypothetical' in v.value.items[1], false, 'una prenda real nunca es hipotética');
  assert.equal('hypothetical' in v.value.items[2], false, 'un color a mano no se marca como hipotético');
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

/* ═══════════ Fase 4 de la auditoría (CS-17, CS-21, CS-22) ═══════════ */
const img = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, c = f(x, y); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3] == null ? 255 : c[3]; } return d; };
test('CS-17 sampleColor: el color del punto elegido, medido en luz lineal', () => {
  const half = img(20, 20, (x) => (x < 10 ? [31, 42, 68] : [244, 242, 236]));
  assert.equal(E.sampleColor(half, 20, 20, 0.1, 0.5), '#1F2A44');
  assert.equal(E.sampleColor(half, 20, 20, 0.9, 0.5), '#F4F2EC');
  // trama blanco/negro: la media lineal da el gris que se percibe (~#BCBCBC), no el #808080 de promediar en sRGB
  const weave = img(10, 10, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
  const g = E.sampleColor(weave, 10, 10, 0.5, 0.5, 2);
  assert.ok(E.hexToRgb(g).r > 170 && E.hexToRgb(g).r < 200, g);
  // bordes: las coordenadas se acotan; zonas transparentes no cuentan
  assert.equal(E.sampleColor(half, 20, 20, -3, 5), '#1F2A44');
  assert.equal(E.sampleColor(img(4, 4, () => [0, 0, 0, 0]), 4, 4, 0.5, 0.5), null);
  assert.equal(E.sampleColor(null, 4, 4, 0.5, 0.5), null);
});
test('CS-21 inferSockLength y sockFit: largo según subcategoría y calzado', () => {
  assert.equal(S.inferSockLength('Calcetín invisible'), 'invisible');
  assert.equal(S.inferSockLength('tobillero algodón'), 'tobillero');
  assert.equal(S.inferSockLength('Media caña canalé'), 'media');
  assert.equal(S.inferSockLength('Crew'), 'media');
  assert.equal(S.inferSockLength('Ejecutivo hilo de Escocia'), 'largo');
  assert.equal(S.inferSockLength('Azul midnight'), null, '«midnight» no es «mid»');
  assert.equal(S.inferSockLength(''), null);
  assert.deepEqual(S.sockFit('formal', 'smart').lengths, ['largo', 'media']);
  assert.equal(S.sockFit('loafer').hidden, true);
  assert.equal(S.sockFit('boot').lengths[0], 'media');
  assert.equal(S.sockFit(null, 'casual').rule, 'largo-contexto');
  assert.ok(Object.values({ a: S.sockFit('sneaker'), b: S.sockFit('technical'), c: S.sockFit('casual') }).every((f) => S.RULES[f.rule] && f.label));
});
test('CS-21 recommendSocks: devuelve el largo, avisa si el invisible oculta el color y prefiere tu calcetín de largo adecuado', () => {
  const socks = [G('tob', 'calcetines', '#1F2A44', { subcategory: 'tobillero' }), G('eje', 'calcetines', '#1E2943', { subcategory: 'ejecutivo' })];
  const r = S.recommendSocks({ trousers: '#1F2A44', shoes: '#2B1A12', shoeType: 'formal', formality: 'smart', socks });
  assert.equal(r.fit.rule, 'largo-formal');
  const safe = r.proposals.find((p) => p.type === 'safe');
  assert.equal(safe.owned.garment.id, 'eje', 'con zapato formal gana el ejecutivo aunque el tobillero sea igual de color');
  assert.equal(safe.owned.lengthOk, true);
  const only = S.recommendSocks({ trousers: '#1F2A44', shoes: '#2B1A12', shoeType: 'formal', socks: [socks[0]] });
  assert.equal(only.proposals.find((p) => p.type === 'safe').owned.lengthOk, false);
  const loafer = S.recommendSocks({ trousers: '#B9AE96', shoes: '#4A2E1F', shoeType: 'loafer' });
  assert.ok(loafer.notes.some((n) => /invisible el color no se ve/.test(n)));
  const unknown = S.recommendSocks({ trousers: '#1F2A44', socks: [G('x', 'calcetines', '#1F2A44')] });
  assert.equal(unknown.proposals[0].owned.lengthOk, null, 'sin largo anotado no se juzga');
  assert.ok(S.recommendSocks({}).fit, 'también sin datos');
});
const wardrobe4 = wardrobe.concat([G('pantalon-naranja', 'pantalones', '#D9822B'), G('camisa-azulon', 'camisas', '#2E5FA8')]);
test('CS-22 proposeDirection: dos prendas reales a la vez cuando con una no basta', () => {
  const input = { slots: slotsOf({ bottom: 'pantalon-naranja', top: 'camisa-azulon', shoes: 'bota-marron' }), garments: wardrobe4, palettes: [], formality: 'smart' };
  const min = C.proposeDirection('minimal', input);
  const pair = min.proposals.find((p) => p.move === 'par-prendas');
  assert.ok(pair, min.proposals.map((p) => p.move).join());
  assert.equal(pair.changes.length, 2);
  assert.ok(pair.changes.every((ch) => ch.garment && !ch.hypothetical), 'solo prendas reales');
  assert.equal(pair.after.reading, 'minimal');
  assert.ok(min.proposals.every((p) => p.move === 'par-prendas' || p.after.reading !== 'minimal'), 'solo aparece si ningún cambio de una prenda real alcanza la dirección');
  assert.match(pair.explanation, /Con un solo cambio/);
  assert.equal(JSON.stringify(C.proposeDirection('minimal', input)), JSON.stringify(min), 'determinista');
  // en la equilibrada sustituye o acompaña a la hipotética, nunca la duplica
  const eq = C.proposeDirection('balanced', input);
  assert.ok(eq.proposals.length <= 2 && eq.proposals.some((p) => p.move === 'par-prendas'));
});
test('CS-22 proposeDirection: si el conjunto ya se lee en la dirección no se buscan parejas', () => {
  const input = { slots: slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca', shoes: 'bota-marron' }), garments: wardrobe4, palettes: [] };
  assert.ok(C.proposeDirection('minimal', input).proposals.every((p) => p.move !== 'par-prendas'));
});
test('CS-22 wardrobeGaps: colores hipotéticos de las tres direcciones, agrupados por hueco', () => {
  const few = wardrobe.filter((g) => ['chino-marino', 'camisa-blanca'].includes(g.id));
  const gaps = C.wardrobeGaps({ slots: slotsOf({ bottom: 'chino-marino', top: 'camisa-blanca' }), garments: few, palettes: [] });
  assert.ok(gaps.length >= 1);
  gaps.forEach((x) => {
    assert.ok(E.SLOT[x.slot] && E.normalizeHex(x.hex) && x.directions.length && C.MOVES[x.move]);
    assert.ok(!few.some((g) => E.SLOT[x.slot].categories.includes(g.category) && E.colorDistance(g.primary_color, x.hex) <= 12), 'no es una prenda que ya tienes');
  });
  const keys = gaps.map((x) => x.slot + x.hex);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(C.wardrobeGaps({ slots: {}, garments: few }), []);
});

/* ── Inspiración (color-studio/inspiration.js) ── */
// imagen sintética: fondo gris claro, «abrigo» camel a la izquierda, «pantalón» marino abajo y una franja blanca
function outfitSample(w = 80, h = 100) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    let c = [236, 236, 233];
    if (x > w * 0.2 && x < w * 0.8 && y > h * 0.1 && y < h * 0.5) c = [180, 138, 90];
    if (x > w * 0.42 && x < w * 0.58 && y > h * 0.12 && y < h * 0.45) c = [244, 242, 236];
    if (x > w * 0.25 && x < w * 0.75 && y >= h * 0.5 && y < h * 0.92) c = [31, 42, 68];
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
  }
  return { data, width: w, height: h };
}
test('Inspiración: sugerencias de una foto sin el fondo (ni la pared ni el suelo), variables en número y con pesos que suman 100', () => {
  const p = I.extractOutfitPalette(outfitSample());
  assert.ok(p.length >= 2 && p.length <= 8, 'número de colores: ' + p.length);
  assert.equal(sum(p.map((c) => c.weight)), 100);
  assert.ok(p.every((c) => /^#[0-9A-F]{6}$/.test(c.hex) && c.source === undefined), 'una sugerencia no lleva procedencia: no es una decisión');
  const fam = p.map((c) => E.familyOf(c.hex));
  assert.ok(fam.includes('marino'), 'falta el marino: ' + fam);
  assert.ok(fam.includes('marron') || fam.includes('beige') || fam.includes('naranja'), 'falta el camel: ' + fam);
  // la franja blanca es una prenda (camisa) casi del color de la pared: puede salir, pero solo con su superficie, sin sumar la pared
  assert.ok(p.filter((c) => E.colorDistance(c.hex, '#ECECE9') < 10).every((c) => c.weight <= 25), 'el fondo sigue en las sugerencias: ' + JSON.stringify(p));
  // una imagen lisa (sin persona) no se queda sin nada: vuelve al análisis de siempre
  const flat = { data: new Uint8ClampedArray(40 * 40 * 4).fill(120), width: 40, height: 40 };
  for (let i = 3; i < flat.data.length; i += 4) flat.data[i] = 255;
  assert.equal(I.extractOutfitPalette(flat).length, 1);
  assert.deepEqual(I.extractOutfitPalette(null), []);
});
test('Extracción: un pantalón que toca el borde de abajo es primer plano; la pared que rodea a la persona, fondo', () => {
  const s = outfitSample();
  const o = (x, y) => (y * 80 + x) * 4;
  for (let y = 92; y < 100; y++) for (let x = 20; x < 60; x++) { s.data[o(x, y)] = 31; s.data[o(x, y) + 1] = 42; s.data[o(x, y) + 2] = 68; }
  const fg = E.foregroundMap(s.data, 80, 100);
  assert.ok(fg[95 * 80 + 40] > 0.6, 'pantalón en el borde: ' + fg[95 * 80 + 40].toFixed(2));
  assert.ok(fg[5 * 80 + 5] < 0.3 && fg[50 * 80 + 4] < 0.3, 'pared: ' + fg[5 * 80 + 5].toFixed(2) + ' / ' + fg[50 * 80 + 4].toFixed(2));
  assert.ok(I.extractOutfitPalette(s).some((c) => E.familyOf(c.hex) === 'marino'), 'el pantalón que toca el borde se perdió');
});
// fotos más realistas: fondo con degradado y textura (ruido determinista), prenda con su sombra y piel
function rng(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }
function photo({ w = 100, h = 140, bg, bgEnd, noise = 0, figure }) {
  const data = new Uint8ClampedArray(w * h * 4), r = rng(7), a = E.hexToRgb(bg), b = E.hexToRgb(bgEnd || bg);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / (h - 1), n = (r() - 0.5) * noise;
    let c = { r: a.r + (b.r - a.r) * t + n, g: a.g + (b.g - a.g) * t + n, b: a.b + (b.b - a.b) * t + n };
    const f = figure(x / w, y / h); if (f) { const q = E.hexToRgb(f); const m = (r() - 0.5) * noise * 0.4; c = { r: q.r + m, g: q.g + m, b: q.b + m }; }
    const o = (y * w + x) * 4; data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b; data[o + 3] = 255;
  }
  return { data, width: w, height: h };
}
// persona: cara (piel), torso (abrigo con un lado en sombra), pantalón hasta el borde de abajo y zapatos
const person = (coat, shade, trousers, shoes) => (x, y) => {
  if (y > 0.06 && y < 0.16 && x > 0.44 && x < 0.56) return '#D9A88A';
  if (y >= 0.16 && y < 0.52 && x > 0.3 && x < 0.7) return x < 0.42 ? shade : coat;
  if (y >= 0.52 && y < 0.93 && ((x > 0.35 && x < 0.48) || (x > 0.52 && x < 0.65))) return trousers;
  if (y >= 0.93 && ((x > 0.33 && x < 0.49) || (x > 0.51 && x < 0.67))) return shoes;
  return null;
};
test('Extracción: fondo con degradado y textura fuera; sombra fundida con su prenda; la piel no pasa por delante de las prendas', () => {
  const s = photo({ bg: '#9FB3B4', bgEnd: '#D7DDDB', noise: 26, figure: person('#1A2C59', '#101B38', '#1A2C59', '#8B4A2B') });
  const p = I.extractOutfitPalette(s);
  const near = (hex, t = 12) => p.find((c) => E.colorDistance(c.hex, hex) <= t);
  assert.ok(near('#1A2C59'), 'falta el marino: ' + JSON.stringify(p));
  assert.equal(E.colorDistance(p[0].hex, '#1A2C59') <= 12, true, 'el primer color no es el traje: ' + p[0].hex);
  assert.ok(!p.some((c) => E.colorDistance(c.hex, '#9FB3B4') <= 10 || E.colorDistance(c.hex, '#D7DDDB') <= 10 || E.colorDistance(c.hex, '#BBC8C8') <= 10), 'el fondo sigue: ' + JSON.stringify(p));
  assert.ok(!near('#101B38', 5) || near('#101B38', 5) === near('#1A2C59'), 'la sombra sale como color aparte');
  const skin = p.findIndex((c) => E.colorDistance(c.hex, '#D9A88A') <= 10), shoe = p.findIndex((c) => E.colorDistance(c.hex, '#8B4A2B') <= 12);
  assert.ok(skin < 0 || (shoe >= 0 && shoe < skin) || p[skin].weight <= 6, 'la piel pesa como una prenda: ' + JSON.stringify(p));
});
test('Extracción: una prenda camel grande no se pierde aunque parezca piel; fondo de rayas fuera', () => {
  const stripes = photo({ bg: '#E9E2D0', figure: (x, y) => (x > 0.25 && x < 0.75 && y > 0.12 && y < 0.95 ? '#C8956B' : (Math.floor(x * 100 / 6) % 2 ? '#7A4E2D' : null)) });
  const p = I.extractOutfitPalette(stripes);
  assert.ok(E.colorDistance(p[0].hex, '#C8956B') <= 8, 'primer color ' + p[0].hex + ' en ' + JSON.stringify(p));
  assert.ok(p.filter((c) => E.colorDistance(c.hex, '#7A4E2D') <= 8 || E.colorDistance(c.hex, '#E9E2D0') <= 8).every((c) => c.weight < 12), 'rayas del fondo: ' + JSON.stringify(p));
});
test('Extracción: rápida, determinista y sin tonos casi repetidos', () => {
  const s = photo({ bg: '#B9775A', bgEnd: '#8E4E36', noise: 40, figure: person('#0B0B0B', '#050505', '#2B3F66', '#F2F2F0') });
  const t = performance.now(), a = I.extractOutfitPalette(s), ms = performance.now() - t;
  assert.deepEqual(I.extractOutfitPalette(s), a, 'dos análisis de la misma foto dan resultados distintos');
  assert.ok(ms < 1500, 'tarda ' + ms.toFixed(0) + ' ms');
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(!E.sameGarmentColor(E.hexToLab(a[i].hex), E.hexToLab(a[j].hex)), 'repetidos: ' + a[i].hex + ' y ' + a[j].hex);
});
test('Inspiración: máscara opcional (futura segmentación): solo cuenta lo que deja ver', () => {
  const s = outfitSample(), mask = new Uint8Array(80 * 100);
  for (let y = 50; y < 92; y++) for (let x = 20; x < 60; x++) mask[y * 80 + x] = 1;          // solo el pantalón
  const p = I.extractOutfitPalette(s, { mask });
  assert.deepEqual(p.map((c) => E.familyOf(c.hex)), ['marino']);
  assert.equal(s.data[3], 255, 'la máscara modificó la imagen original');
});
test('Inspiración: sugerencias normalizadas y paleta definitiva (orden, id, etiqueta, procedencia y compatibilidad)', () => {
  const n = I.normalizeSuggestions([{ hex: '1f2a44', weight: 30 }, { hex: '#1F2A44', weight: 10 }, { hex: 'nope', weight: 50 }, { hex: '#F4F2EC', weight: 60 }]);
  assert.deepEqual(n, [{ hex: '#1F2A44', weight: 40 }, { hex: '#F4F2EC', weight: 60 }]);
  const p = I.normalizePalette([{ id: 'abc', hex: '#1f2a44', source: 'manual', label: '  Pantalón ' }, { hex: '#1F2A44', source: 'manual', label: 'Calcetines' }, { hex: '#B48A5A', weight: 44, source: 'auto' }, { hex: 'x' }]);
  assert.deepEqual(p.map((c) => [c.hex, c.source, c.label || null, c.weight ?? null]), [['#1F2A44', 'manual', 'Pantalón', null], ['#1F2A44', 'manual', 'Calcetines', null], ['#B48A5A', 'auto', null, 44]]);
  assert.equal(p[0].id, 'abc');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(p[1].id) && p[1].id !== p[0].id);
  // referencia guardada antes del cuentagotas: [{ hex, weight, source }] se lee igual
  const old = I.normalizePalette([{ hex: '#B48A5A', weight: 60, source: 'auto' }, { hex: '#1F2A44', weight: 40, source: 'auto' }]);
  assert.deepEqual(old.map((c) => [c.hex, c.weight, c.source]), [['#B48A5A', 60, 'auto'], ['#1F2A44', 40, 'auto']]);
  assert.equal(I.normalizePalette(Array.from({ length: 15 }, () => ({ hex: '#111111' }))).length, 12);
  assert.deepEqual(I.bandWeights([{ hex: '#111111' }, { hex: '#222222', weight: 50 }]), [1, 1]);
  assert.deepEqual(I.bandWeights([{ weight: 30 }, { weight: 70 }]), [30, 70]);
  assert.deepEqual(I.effectivePalette({ palette: [], suggestions: [{ hex: '#111111', weight: 100 }] }).map((c) => c.hex), ['#111111']);
  assert.deepEqual(I.effectivePalette({ palette: [{ hex: '#222222' }], suggestions: [{ hex: '#111111', weight: 100 }] }).map((c) => c.hex), ['#222222']);
  assert.notEqual(I.newColorId(), I.newColorId());
});
test('Cuentagotas: mediana de 5 × 5 (resiste píxeles extremos), punto exacto, transparencias, bordes y zona mezclada', () => {
  const W = 20, H = 10, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; const left = x < 10; data[o] = left ? 31 : 180; data[o + 1] = left ? 42 : 138; data[o + 2] = left ? 68 : 90; data[o + 3] = 255; }
  const px = { data, width: W, height: H };
  assert.equal(I.pickColor(px, 4, 5).hex, '#1F2A44');
  assert.equal(I.pickColor(px, 15, 5).hex, '#B48A5A');
  // dos píxeles blancos (un reflejo) dentro de la zona no cambian la mediana; la media sí se habría ido
  [[3, 4], [5, 6]].forEach(([x, y]) => { const o = (y * W + x) * 4; data[o] = data[o + 1] = data[o + 2] = 255; });
  assert.equal(I.pickColor(px, 4, 5).hex, '#1F2A44');
  assert.equal(I.pickColor(px, 3, 4, true).hex, '#FFFFFF', 'el punto exacto toma ese píxel');
  assert.equal(I.pickColor(px, 4, 5).n, 25);
  assert.equal(I.pickColor(px, 0, 0).n, 9, 'en la esquina la zona se recorta a la imagen');
  assert.equal(I.pickColor(px, -1, 3), null);
  assert.equal(I.pickColor(px, 20, 3), null);
  assert.equal(I.pickColor(null, 1, 1), null);
  assert.ok(I.pickColor(px, 10, 5).mixed >= I.MIXED_WARN, 'la frontera entre dos prendas no se marca como mezclada');
  assert.equal(I.pickColor(px, 15, 5).mixed, 0);
  const clear = { data: new Uint8ClampedArray(9 * 4), width: 3, height: 3 };
  assert.equal(I.pickColor(clear, 1, 1), null, 'zona transparente');
});
test('Cuentagotas: de la pantalla a la imagen con la imagen escalada, desplazada y fuera de límites', () => {
  const rect = { left: 100, top: 50, width: 300, height: 400 };            // imagen de 1200 × 1600 mostrada a 300 × 400
  assert.deepEqual(I.toImagePoint(100, 50, rect, 1200, 1600), { x: 0, y: 0 });
  assert.deepEqual(I.toImagePoint(250, 250, rect, 1200, 1600), { x: 600, y: 800 });
  assert.deepEqual(I.toImagePoint(399.9, 449.9, rect, 1200, 1600), { x: 1199, y: 1599 });
  assert.equal(I.toImagePoint(400, 250, rect, 1200, 1600), null);
  assert.equal(I.toImagePoint(99, 250, rect, 1200, 1600), null);
  assert.deepEqual(I.toImagePoint(130, 90, { left: 100, top: 50, width: 600, height: 800 }, 300, 400), { x: 15, y: 20 }, 'imagen ampliada');
  assert.equal(I.toImagePoint(10, 10, { left: 0, top: 0, width: 0, height: 0 }, 10, 10), null);
});
test('Inspiración: información derivada y papeles por peso', () => {
  const c = I.colorInfo('#1f2a44');
  assert.deepEqual(c.rgb, { r: 31, g: 42, b: 68 });
  assert.equal(c.family, 'marino');
  assert.ok(Number.isInteger(c.lab.L));
  assert.equal(I.colorInfo('x'), null);
  const r = I.paletteRoles([{ hex: '#111111', weight: 50 }, { hex: '#222222', weight: 40 }, { hex: '#333333', weight: 10 }]);
  assert.deepEqual(r.map((x) => x.role), ['dominante', 'secundario', 'detalle']);
  assert.deepEqual(I.paletteRoles([{ hex: '#111111', source: 'manual' }, { hex: '#222222', weight: 40 }]).map((x) => x.role), [null, null], 'sin pesos no se inventan papeles');
});
test('Inspiración: huella de imagen estable ante el tamaño y distinta entre imágenes', () => {
  const a = I.imageHash(outfitSample(80, 100)), b = I.imageHash(outfitSample(160, 200));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.ok(I.hashDistance(a, b) <= I.HASH_NEAR, 'misma imagen a otro tamaño: ' + I.hashDistance(a, b));
  const flipped = outfitSample(); const d = flipped.data;
  for (let y = 0; y < 100; y++) for (let x = 0; x < 40; x++) for (let k = 0; k < 4; k++) { const o1 = (y * 80 + x) * 4 + k, o2 = (y * 80 + (79 - x)) * 4 + k, t = d[o1]; d[o1] = d[o2]; d[o2] = t; }
  const grad = { data: new Uint8ClampedArray(80 * 100 * 4), width: 80, height: 100 };
  for (let y = 0; y < 100; y++) for (let x = 0; x < 80; x++) { const o = (y * 80 + x) * 4; grad.data[o] = grad.data[o + 1] = grad.data[o + 2] = 255 - x * 3; grad.data[o + 3] = 255; }
  assert.ok(I.hashDistance(a, I.imageHash(grad)) > I.HASH_NEAR);
  assert.equal(I.hashDistance(a, null), Infinity);
  const blank = { data: new Uint8ClampedArray(40 * 40 * 4), width: 40, height: 40 };
  assert.equal(I.imageHash(blank), null, 'imagen transparente');
  const blocks = { data: new Uint8ClampedArray(40 * 40 * 4), width: 40, height: 40 };
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const o = (y * 40 + x) * 4, v = x < 20 ? 40 : 220; blocks.data[o] = blocks.data[o + 1] = blocks.data[o + 2] = v; blocks.data[o + 3] = 255; }
  assert.equal(I.imageHash(blocks), null, 'bloques planos: sin estructura para comparar');
});
test('Inspiración: enlaces comparables y fuente por dominio', () => {
  assert.equal(I.normalizeSourceUrl('https://www.Ejemplo.com/look/12/?utm_source=x&fbclid=y&talla=m#foto'), 'ejemplo.com/look/12?talla=m');
  assert.equal(I.normalizeSourceUrl('http://ejemplo.com/look/12'), 'ejemplo.com/look/12');
  assert.equal(I.normalizeSourceUrl('javascript:alert(1)'), null);
  assert.equal(I.sourceNameFromUrl('https://www.pinterest.es/pin/1'), 'pinterest.es');
  assert.equal(I.httpUrl('https://user:pass@ejemplo.com/'), null);
  assert.equal(I.httpUrl('https://ejemplo.com/' + 'a'.repeat(990)), null);
  assert.ok(I.httpUrl('https://ejemplo.com/' + 'a'.repeat(800)));
});
test('Inspiración: validar (basta imagen, enlace o título; nada más obligatorio)', () => {
  assert.equal(I.validateInspiration({}).ok, false);
  assert.equal(I.validateInspiration({ has_image: true }).ok, true);
  const v = I.validateInspiration({ source_url: 'https://www.zara.com/es/look', styles: ['Casual', ' casual ', 'Smart casual'], seasons: ['otono', 'nunca'], rating: 4, published_on: '2026-02-30' });
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /fecha/);
  const w = I.validateInspiration({ source_url: 'https://www.zara.com/es/look', styles: ['Casual', ' casual ', 'Smart casual'], seasons: ['otono', 'nunca'], rating: 4, published_on: '2026-02-03' });
  assert.equal(w.ok, true);
  assert.equal(w.value.source_name, 'zara.com');
  assert.deepEqual(w.value.styles, ['Casual', 'Smart casual']);
  assert.deepEqual(w.value.seasons, ['otono']);
  assert.equal(w.value.palette_status, 'none');
  assert.equal(I.validateInspiration({ title: 'x', source_url: 'ftp://a' }).ok, false);
  assert.equal(I.validateInspiration({ title: 'x', rating: 7 }).ok, false);
  assert.equal(I.validateInspiration({ title: 'x', palette_status: 'failed' }).value.palette_status, 'failed');
  assert.equal(I.validateInspiration({ title: 'x', palette: [{ hex: '#111111', weight: 1 }] }).value.palette_status, 'auto');
  assert.equal(I.validateInspiration({ title: 'x', palette: [{ hex: '#111111', weight: 1 }], palette_status: 'reviewed' }).value.palette_status, 'reviewed');
  assert.equal(I.validateInspiration({ title: 'x', suggestions: [{ hex: '#111111', weight: 1 }] }).value.palette_status, 'auto', 'solo sugerencias: por revisar');
  assert.equal(I.validateInspiration({ title: 'x', palette: [{ hex: '#111111', source: 'manual' }] }).value.palette_status, 'reviewed', 'un color elegido a mano es una decisión');
  assert.deepEqual(I.validateInspiration({ title: 'x', suggestions: [{ hex: '#111111', weight: 1 }] }).value.palette, [], 'las sugerencias nunca entran solas en la paleta');
});
const insp = (id, extra) => Object.assign({ id, title: null, source_url: null, source_name: null, styles: [], collections: [], seasons: [], palette: [], palette_status: 'none', is_favorite: false, rating: null, created_at: '2026-01-0' + id + 'T10:00:00Z', published_on: null }, extra);
test('Inspiración: duplicados por enlace normalizado o imagen casi igual', () => {
  const list = [insp(1, { source_url: 'https://ejemplo.com/a?utm_medium=x' }), insp(2, { image_hash: 'ffff0000ffff0000' })];
  assert.deepEqual(I.findDuplicateInspirations({ source_url: 'https://www.ejemplo.com/a/' }, list).map((d) => d.reason), ['url']);
  assert.deepEqual(I.findDuplicateInspirations({ image_hash: 'ffff0000ffff0003' }, list).map((d) => d.reason), ['image']);
  assert.deepEqual(I.findDuplicateInspirations({ id: 2, image_hash: 'ffff0000ffff0000' }, list), []);
  assert.deepEqual(I.findDuplicateInspirations({ image_hash: '0000ffff0000ffff' }, list), []);
});
test('Inspiración: buscar (sin tildes), filtrar y ordenar', () => {
  const list = [
    insp(1, { title: 'Abrigo camel en Milán', styles: ['Smart casual'], seasons: ['invierno'], palette: [{ hex: '#B48A5A', weight: 60 }, { hex: '#1F2A44', weight: 40 }], palette_status: 'auto', rating: 3 }),
    insp(2, { title: 'Lino', styles: ['Casual'], collections: ['Verano 26'], seasons: ['verano'], is_favorite: true, palette: [{ hex: '#F4F2EC', weight: 100 }], palette_status: 'reviewed', published_on: '2025-06-01' }),
    insp(3, { source_name: 'pinterest.com', notes: 'Ver el corte del pantalón', image_path: 'x', palette_status: 'failed', published_on: '2026-03-01', rating: 5 })
  ];
  const ids = (f) => list.filter((x) => I.matchesFilters(x, f)).map((x) => x.id);
  assert.deepEqual(ids({ q: 'milan' }), [1]);
  assert.deepEqual(ids({ q: 'pantalon corte' }), [3]);
  assert.deepEqual(ids({ q: 'marino' }), [1]);
  assert.deepEqual(ids({ q: 'invierno' }), [1]);
  assert.deepEqual(ids({ style: 'Casual' }), [2]);
  assert.deepEqual(ids({ collection: 'Verano 26' }), [2]);
  assert.deepEqual(ids({ season: 'verano' }), [2]);
  assert.deepEqual(ids({ family: 'marino' }), [1]);
  assert.deepEqual(ids({ fav: true }), [2]);
  assert.deepEqual(ids({ review: true }), [1, 3]);
  const order = (s) => I.sortInspirations(list, s).map((x) => x.id);
  assert.deepEqual(order('saved'), [3, 2, 1]);
  assert.deepEqual(order('saved-asc'), [1, 2, 3]);
  assert.deepEqual(order('published'), [3, 2, 1]);
  assert.deepEqual(order('favorites'), [2, 3, 1]);
  assert.deepEqual(order('rating'), [3, 1, 2]);
  assert.deepEqual(I.optionValues(['Casual', 'Formal'], list, 'styles'), ['Casual', 'Formal', 'Smart casual']);
});
test('Inspiración: referencias parecidas y paleta para la Biblioteca', () => {
  const a = insp(1, { palette: [{ hex: '#1F2A44', weight: 50 }, { hex: '#B48A5A', weight: 30 }, { hex: '#F4F2EC', weight: 20 }] });
  const b = insp(2, { palette: [{ hex: '#202B46', weight: 40 }, { hex: '#B38B5C', weight: 60 }] });
  const c = insp(3, { palette: [{ hex: '#C2185B', weight: 100 }] });
  const d = insp(4, { palette: [{ hex: '#1F2A44', weight: 100 }] });
  const sim = I.similarInspirations(a, [a, b, c, d]);
  assert.deepEqual(sim.map((s) => s.item.id), [2], 'solo cuenta la que comparte al menos dos colores');
  assert.deepEqual(I.similarInspirations(insp(5), [a, b]), []);
  const pal = I.paletteForLibrary(Object.assign({}, a, { title: 'Look', source_url: 'https://ejemplo.com/x', source_name: 'ejemplo.com', styles: ['Smart casual'] }));
  const v = D.validatePalette(pal);
  assert.equal(v.ok, true, v.errors.join());
  assert.deepEqual(v.value.colors.map((x) => x.hex), ['#1F2A44', '#B48A5A', '#F4F2EC']);
  assert.equal(v.value.source_type, 'web');
  assert.deepEqual(v.value.tags, ['inspiración', 'smart casual']);
  assert.equal(I.paletteForLibrary(insp(6, { palette: [{ hex: '#111111', weight: 100 }] })).source_type, 'photo');
});
test('Inspiración: título a mostrar', () => {
  assert.equal(I.displayTitle({ title: 'Mi look' }), 'Mi look');
  assert.match(I.displayTitle({ source_name: 'zara.com', created_at: '2026-10-01T10:00:00Z' }), /^zara\.com · 1 oct/);
  assert.match(I.displayTitle({ created_at: '2026-10-01T10:00:00Z' }), /^Referencia del 1/);
});

/* ── Evolución: Biblioteca como referencia común, prenda interior, figura y sugerencias ── */
const pal = (id, name, hexes, extra) => Object.assign({ id, name, source_type: 'book', colors: hexes.map((hex) => ({ hex, original: hex })) }, extra || {});
const garm = (id, category, primary_color, extra) => Object.assign({ id, category, primary_color, secondary_colors: [], name: id }, extra || {});
test('Similitud con una paleta: niveles por ΔE00 (sin exigir el mismo HEX) y una sola prenda no basta', () => {
  assert.equal(E.similarityLevel(2), 'identical'); assert.equal(E.similarityLevel(5), 'close'); assert.equal(E.similarityLevel(11), 'related'); assert.equal(E.similarityLevel(13), 'none');
  const p = pal('p', 'Marino y camel', ['#1F2A44', '#B48A5A', '#F4F2EC']);
  const a = E.paletteAffinity(p, [{ hex: '#22304D', share: 60 }, { hex: '#B98F60', share: 40 }]);
  assert.equal(a.covered, 2); assert.ok(a.valid); assert.ok(a.meanDE > 0 && a.meanDE <= 6, 'ΔE medio ' + a.meanDE);
  assert.notEqual(a.links[0].hex, a.links[0].paletteHex, 'no son el mismo HEX y aun así conectan');
  const one = E.paletteAffinity(p, [{ hex: '#1F2A44', share: 60 }, { hex: '#C0392B', share: 40 }]);
  assert.equal(one.valid, false, 'una sola prenda en la paleta y otra fuera no la representan');
  assert.ok(one.offShare >= 0.39);
});
test('Prenda interior: hueco propio tras la parte superior, entra en la estructura de datos y en las propuestas', () => {
  const i = E.SLOTS.findIndex((s) => s.id === 'inner');
  assert.equal(E.SLOTS[i - 1].id, 'top', 'va inmediatamente después de la parte superior');
  assert.deepEqual(E.SLOT.inner.categories, ['camisetas', 'camisas']);
  const v = D.validateOutfit({ name: 'Capas', items: [{ slot: 'top', hex: '#1F2A44', weight: 30 }, { slot: 'inner', hex: '#F4F2EC', weight: 10 }] });
  assert.ok(v.ok, JSON.stringify(v.errors)); assert.equal(v.value.items[1].slot, 'inner');
  const garments = [garm('jer', 'jerseis', '#1F2A44'), garm('cam', 'camisas', '#F4F2EC'), garm('naranja', 'camisetas', '#C86A3A'), garm('pan', 'pantalones', '#6B6B6B'), garm('zap', 'calzado', '#3B2A20')];
  const slots = { top: { garment_id: 'jer', weight: 30 }, inner: { garment_id: 'cam', weight: 10 }, bottom: { garment_id: 'pan', weight: 35 }, shoes: { garment_id: 'zap', weight: 10 } };
  const items = C.buildItems(slots, garments);
  assert.deepEqual(items.map((x) => x.slot), ['top', 'inner', 'bottom', 'shoes']);
  const r = C.proposeDirection('creative', { slots, garments, palettes: [] });
  assert.ok(r.proposals.some((p) => p.changes.some((ch) => ch.slot === 'inner')), 'la creativa puede usar la prenda interior como acento: ' + JSON.stringify(r.proposals.map((p) => p.changes.map((ch) => ch.slot))));
  const sock = S.recommendSocks({ trousers: '#6B6B6B', shoes: '#3B2A20', others: [{ hex: '#F4F2EC', label: 'Prenda interior', share: 8 }] });
  assert.ok(sock.proposals.length >= 2);
});
test('Figurín de una paleta: propuesta por sobriedad, calcetines siempre, superficie que suma 100 y prendas editables', () => {
  [2, 3, 4, 5, 6].forEach((n) => {
    const hexes = ['#1F2A44', '#C0392B', '#B48A5A', '#2E7D32', '#F1C40F', '#8E44AD'].slice(0, n);
    const f = C.paletteFigure(pal('p' + n, 'n' + n, hexes));
    assert.equal(f.illustrative, true); assert.equal(f.auto, true);
    assert.ok(f.garments.some((g) => g.slot === 'socks'), 'faltan los calcetines con ' + n + ' colores');
    assert.ok(Math.abs(f.garments.reduce((t, g) => t + g.share, 0) - 100) < 1e-6, 'la figura suma 100');
    assert.ok(Math.abs(f.colors.reduce((t, c) => t + c.share, 0) - 100) < 1e-6, 'los colores suman 100');
    assert.equal(f.assignment.outer, 0, 'el marino (el más sobrio) es la prenda exterior');
  });
  assert.notEqual(C.paletteFigure(pal('w', 'blanco', ['#FFFFFF', '#1F2A44', '#C0392B'])).assignment.outer, 0, 'un blanco es apoyo, no la base');
  const p = pal('mc', 'marino camel crudo', ['#1F2A44', '#B48A5A', '#F4F2EC']);
  const auto = C.paletteFigure(p);
  assert.equal(auto.assignment.socks, auto.assignment.bottom, 'por defecto, calcetines del color del pantalón');
  // la persona elige: sin prenda exterior y calcetines camel
  const mine = C.paletteFigure(p, Object.assign({}, auto.assignment, { outer: null, socks: 1 }));
  assert.equal(mine.auto, false);
  assert.ok(!mine.garments.some((g) => g.slot === 'outer'));
  assert.equal(mine.garments.find((g) => g.slot === 'socks').hex, '#B48A5A');
  assert.ok(mine.colors.find((c) => c.hex === '#B48A5A').share > auto.colors.find((c) => c.hex === '#B48A5A').share, 'sin abrigo la parte superior gana superficie');
  // un índice que no existe o quitar una prenda obligatoria vuelve a la propuesta
  const bad = C.paletteFigure(p, { bottom: 9, shoes: null });
  assert.equal(bad.assignment.bottom, auto.assignment.bottom); assert.equal(bad.assignment.shoes, auto.assignment.shoes);
  // colores con la prenda en el nombre (vienen de Inspiración): cada uno en su prenda y sin abrigo inventado
  const lab = C.paletteFigure({ colors: [{ hex: '#1F2A44', name: 'Jersey' }, { hex: '#EFEADF', name: 'Pantalón' }, { hex: '#9A6A41', name: 'Calzado' }] });
  assert.deepEqual(lab.assignment, { outer: null, top: 0, bottom: 1, socks: 1, shoes: 2, accessory: null });
});
test('Sugerencias de outfits: conjuntos completos con prendas reales, coherentes con la Biblioteca y que se actualizan con el armario', () => {
  const lib = [pal('mc', 'Marino, crudo y camel', ['#1F2A44', '#F2EEE3', '#9C6B3F']), pal('rv', 'Rojo y verde', ['#C0392B', '#27AE60'])];
  const base = [garm('jersey', 'jerseis', '#21304A'), garm('chino', 'pantalones', '#EFEADF'), garm('bota', 'calzado', '#9A6A41'), garm('fucsia', 'camisetas', '#E91E63')];
  const r = C.suggestOutfits({ garments: base, palettes: lib });
  assert.equal(r.suggestions.length, 1, JSON.stringify(r.suggestions.map((x) => x.palette.name)));
  const s = r.suggestions[0];
  assert.equal(s.palette.id, 'mc');
  assert.deepEqual(Object.keys(s.slots).sort(), ['bottom', 'shoes', 'top']);
  assert.ok(s.level === 'identical' || s.level === 'close', 'nivel ' + s.level);
  assert.ok(s.items.every((it) => it.garment && !it.hypothetical), 'solo prendas reales');
  assert.ok(!Object.values(s.slots).some((x) => x.garment_id === 'fucsia'), 'una prenda fuera de la combinación no entra');
  // sin una combinación que lo represente en conjunto, no se sugiere nada (mejor nada que algo flojo)
  assert.equal(C.suggestOutfits({ garments: [garm('a', 'camisetas', '#E91E63'), garm('b', 'pantalones', '#1F2A44'), garm('c', 'calzado', '#F1C40F')], palettes: lib }).suggestions.length, 0);
  // una prenda nueva entra sola: un abrigo marino se añade como prenda exterior
  const more = C.suggestOutfits({ garments: base.concat(garm('abrigo', 'chaquetas', '#1C2840')), palettes: lib });
  assert.ok(more.suggestions.some((x) => x.slots.outer && x.slots.outer.garment_id === 'abrigo'), 'el abrigo nuevo no aparece');
});
test('Dirección cromática: la Biblioteca propone completar una combinación con prendas reales y cada propuesta cita su referencia', () => {
  const lib = [pal('mc', 'Marino, crudo y camel', ['#1F2A44', '#F2EEE3', '#9C6B3F'])];
  const garments = [garm('gris', 'jerseis', '#6E6E6E'), garm('jersey', 'jerseis', '#21304A'), garm('chino', 'pantalones', '#EFEADF'), garm('bota', 'calzado', '#9A6A41')];
  const slots = { top: { garment_id: 'gris', weight: 30 }, bottom: { garment_id: 'chino', weight: 35 }, shoes: { garment_id: 'bota', weight: 10 } };
  const r = C.proposeDirection('balanced', { slots, garments, palettes: lib });
  const p = r.proposals.find((x) => x.move === 'biblioteca');
  assert.ok(p, 'sin propuesta de la Biblioteca: ' + JSON.stringify(r.proposals.map((x) => x.move)));
  assert.equal(p.changes[0].garment.id, 'jersey');
  assert.equal(p.reference.palette.id, 'mc');
  assert.ok(p.reference.affinity.valid);
});
test('Calcetines: la combinación que representa el outfit completo es la referencia y las propuestas lo citan', () => {
  const lib = [pal('mc', 'Marino, crudo y camel', ['#1F2A44', '#F2EEE3', '#9C6B3F', '#7A1F2B'])];
  const r = S.recommendSocks({ trousers: '#EFEADF', shoes: '#9A6A41', others: [{ hex: '#21304A', label: 'Parte superior', share: 40 }], palettes: lib,
    outfitColors: [{ hex: '#21304A', share: 40 }, { hex: '#EFEADF', share: 45 }, { hex: '#9A6A41', share: 15 }] });
  assert.equal(r.reference && r.reference.palette.id, 'mc');
  assert.ok(r.proposals.some((p) => p.reference && p.reference.palette.id === 'mc'), 'ninguna propuesta cita la combinación');
  const contrast = r.proposals.find((p) => p.type === 'contrast');
  assert.ok(contrast && contrast.palette && contrast.palette.id === 'mc', 'el contraste sale de la combinación de referencia: ' + JSON.stringify(contrast));
});
test('Inspiraciones relacionadas con una combinación: colores próximos (no idénticos) sí; sin relación suficiente, no', () => {
  const p = pal('mc', 'Marino, crudo y camel', ['#1F2A44', '#F2EEE3', '#9C6B3F']);
  const items = [
    { id: 'a', title: 'Casi igual', palette: [{ hex: '#22304B' }, { hex: '#EFEBE0' }, { hex: '#A06E42' }], suggestions: [] },
    { id: 'b', title: 'Dos de tres', palette: [], suggestions: [{ hex: '#24324F', weight: 50 }, { hex: '#A57446', weight: 30 }, { hex: '#C0392B', weight: 20 }] },
    { id: 'c', title: 'Uno solo', palette: [{ hex: '#1F2A44' }, { hex: '#E91E63' }], suggestions: [] },
    { id: 'd', title: 'Nada', palette: [{ hex: '#27AE60' }, { hex: '#F1C40F' }], suggestions: [] }
  ];
  const r = I.relatedInspirations(p, items);
  assert.deepEqual(r.map((x) => x.item.id), ['a', 'b']);
  assert.ok(['identical', 'close'].includes(r[0].level));
  assert.equal(r[1].covered, 2);
});
test('Con tu armario: el color del pantalón se busca entre pantalones (no entre zapatillas) y el conjunto no repite prenda ni tipo', () => {
  assert.equal(C.slotFromLabel('Pantalón'), 'bottom'); assert.equal(C.slotFromLabel('Vaquero'), 'bottom'); assert.equal(C.slotFromLabel('Calzado'), 'shoes');
  assert.equal(C.slotFromLabel('zapatillas blancas'), 'shoes'); assert.equal(C.slotFromLabel('Camisa bajo el jersey'), 'inner'); assert.equal(C.slotFromLabel('Camiseta interior'), 'inner');
  assert.equal(C.slotFromLabel('Jersey'), 'top'); assert.equal(C.slotFromLabel('Abrigo'), 'outer'); assert.equal(C.slotFromLabel('Calcetines'), 'socks'); assert.equal(C.slotFromLabel('Cinturón'), 'accessory');
  assert.equal(C.slotFromLabel('beige bonito'), null); assert.equal(C.slotFromLabel(''), null);
  const wardrobe = [garm('zapas', 'calzado', '#F1EEE6'), garm('chino', 'pantalones', '#E2DACB'), garm('jersey', 'jerseis', '#22304B'), garm('bota', 'calzado', '#6B4A33'), garm('calc', 'calcetines', '#23314C')];
  // caso del fallo: el color del pantalón está más cerca de las zapatillas que del chino
  const labeled = C.matchColorsToWardrobe([{ hex: '#F0ECE3', label: 'Pantalón' }, { hex: '#6A4934', label: 'Calzado' }, { hex: '#21304A', label: 'Jersey' }], wardrobe);
  assert.ok(E.colorDistance('#F0ECE3', '#F1EEE6') < E.colorDistance('#F0ECE3', '#E2DACB'), 'el caso de prueba reproduce el fallo');
  assert.deepEqual(labeled.map((r) => r.candidate && r.candidate.garment.id), ['chino', 'bota', 'jersey']);
  assert.deepEqual(labeled.map((r) => r.slot), ['bottom', 'shoes', 'top']);
  // con etiqueta y sin una prenda de ese tipo en ese color: no se cambia de tipo
  const none = C.matchColorsToWardrobe([{ hex: '#F1EEE6', label: 'Abrigo' }], wardrobe);
  assert.equal(none[0].candidate, null); assert.equal(none[0].slot, 'outer');
  // sin etiquetas: un conjunto coherente (no dos calzados; un color con mucha presencia no va a calcetines)
  const free = C.matchColorsToWardrobe([{ hex: '#F0ECE3', weight: 40 }, { hex: '#E6DED0', weight: 30 }, { hex: '#22304B', weight: 30 }], wardrobe);
  const slots = free.filter((r) => r.candidate).map((r) => r.candidate.slot);
  assert.equal(new Set(slots).size, slots.length, 'huecos repetidos: ' + slots);
  assert.equal(new Set(free.filter((r) => r.candidate).map((r) => r.candidate.garment.id)).size, slots.length, 'prenda repetida');
  assert.ok(!slots.includes('socks'), 'un color con el 30 % de presencia propuesto como calcetines');
  // la sección de Inspiración (adaptPalette sin outfit) usa las etiquetas
  const rows = C.adaptPalette({ colors: [{ hex: '#F0ECE3', label: 'Pantalón' }, { hex: '#6A4934', label: 'Calzado' }] }, { slots: {}, garments: wardrobe, palettes: [] });
  assert.deepEqual(rows.map((r) => r.candidate && r.candidate.garment.id), ['chino', 'bota']);
  assert.deepEqual(rows.map((r) => r.wanted), ['bottom', 'shoes']);
});
test('Tipos de prenda: lista fija común a Inspiración y Armario, guardada en la subcategoría y con cruce exacto por tipo', () => {
  assert.deepEqual(I.GARMENT_LABELS, E.GARMENT_TYPES.map((t) => t.label), 'Inspiración usa la misma lista que el armario');
  E.GARMENT_TYPES.forEach((t) => { assert.ok(E.CATEGORY_LABEL[t.category], t.label + ' sin categoría válida'); assert.ok(E.SLOT[t.slot], t.label + ' sin hueco'); assert.equal(C.slotFromLabel(t.label), t.slot, t.label); });
  assert.deepEqual(E.splitSubcategory('Deportiva · running'), { type: 'Deportiva', detail: 'running' });
  assert.deepEqual(E.splitSubcategory('Bota'), { type: 'Bota', detail: null });
  assert.deepEqual(E.splitSubcategory('chino'), { type: null, detail: 'chino' }, 'una subcategoría antigua se conserva como detalle');
  assert.equal(E.joinSubcategory('Bota', ' chelsea '), 'Bota · chelsea'); assert.equal(E.joinSubcategory('Camisa', ''), 'Camisa');
  // prendas anteriores (sin tipo guardado): el tipo se deduce
  assert.equal(E.garmentType({ category: 'calzado', subcategory: 'zapatillas blancas' }), 'Deportiva');
  assert.equal(E.garmentType({ category: 'calzado', subcategory: null, name: 'Oxford' }), 'Zapato');
  assert.equal(E.garmentType({ category: 'pantalones' }), 'Pantalón');
  assert.equal(E.garmentType({ category: 'calzado', subcategory: 'Mocasín · penny' }), 'Mocasín');
  assert.equal(S.inferShoeType('Deportiva · running'), 'technical', 'la guía de calcetines sigue leyendo el tipo de calzado');
  assert.equal(S.inferShoeType('Bota'), 'boot');
  // cruce exacto: el color «Deportiva» prefiere tus deportivas a un zapato del mismo color (aunque el zapato esté más cerca)
  const w = [garm('zapato', 'calzado', '#F1EFEA', { subcategory: 'Zapato' }), garm('depor', 'calzado', '#ECE8DF', { subcategory: 'Deportiva' })];
  assert.ok(E.colorDistance('#F2F0EB', '#F1EFEA') < E.colorDistance('#F2F0EB', '#ECE8DF'));
  assert.equal(C.matchColorsToWardrobe([{ hex: '#F2F0EB', label: 'Deportiva' }], w)[0].candidate.garment.id, 'depor');
  assert.equal(C.matchColorsToWardrobe([{ hex: '#F2F0EB', label: 'Zapato' }], w)[0].candidate.garment.id, 'zapato');
});
test('Figurín: el calzado admite negro, blanco y marrón además de los colores de la paleta (señalados como fuera de ella)', () => {
  const p = pal('mc', 'marino camel crudo', ['#1F2A44', '#B48A5A', '#F4F2EC']);
  assert.deepEqual(C.SHOE_COLORS.map((c) => c.name), ['negro', 'blanco', 'marrón']);
  const f = C.paletteFigure(p, { shoes: '#5A3A24' });
  assert.equal(f.garments.find((g) => g.slot === 'shoes').hex, '#5A3A24');
  const extra = f.colors.find((c) => c.extra);
  assert.ok(extra && extra.name === 'marrón' && extra.slots.join() === 'shoes');
  assert.ok(Math.abs(f.colors.reduce((t, c) => t + c.share, 0) - 100) < 1e-6);
  // solo el calzado: en otra prenda un HEX ajeno a la paleta no vale y vuelve a la propuesta
  const bad = C.paletteFigure(p, { bottom: '#1C1C1C' });
  assert.equal(bad.assignment.bottom, C.paletteFigure(p).assignment.bottom);
});
test('Figurín: los calcetines tienen siempre el blanco disponible, aunque la paleta no lo tenga', () => {
  const p = pal('mcr', 'marino camel teja', ['#1F2A44', '#B48A5A', '#C0392B']);
  assert.deepEqual(C.EXTRA_COLORS.socks.map((c) => c.name), ['blanco']);
  const f = C.paletteFigure(p, { socks: '#F3F2EE' });
  assert.equal(f.garments.find((g) => g.slot === 'socks').hex, '#F3F2EE');
  assert.ok(f.colors.find((c) => c.extra && c.slots.join() === 'socks'), 'el blanco no sale como color fuera de la paleta');
  // calcetines y calzado blancos: un solo color en la leyenda
  const both = C.paletteFigure(p, { socks: '#F3F2EE', shoes: '#F3F2EE' });
  assert.deepEqual(both.colors.filter((c) => c.extra).map((c) => c.slots.join()), ['socks,shoes']);
  // el marrón es solo de calzado: en calcetines no vale y vuelve a la propuesta
  assert.equal(C.paletteFigure(p, { socks: '#5A3A24' }).assignment.socks, C.paletteFigure(p).assignment.socks);
});
test('Corrección de la luz: un neutro tomado de la foto devuelve el gris y corrige el resto; un punto con color no sirve', () => {
  const g = E.neutralGains('#F2E6CF');                     // camisa blanca con luz cálida
  assert.ok(g && g.length === 3);
  const fixed = E.labToLch(E.hexToLab(E.applyGainsHex('#F2E6CF', g)));
  assert.ok(fixed.C < 1.5, 'el neutro no queda gris: C ' + fixed.C.toFixed(2));
  assert.ok(Math.abs(fixed.L - E.labToLch(E.hexToLab('#F2E6CF')).L) < 1.5, 'la corrección cambió la luminosidad del neutro');
  // el mismo desplazamiento cálido aplicado a un azul marino se deshace
  const warm = (hex) => { const c = E.hexToRgb(hex); const k = [1.06, 1.0, 0.86]; return E.rgbToHex(Math.min(255, c.r * k[0]), c.g * k[1], c.b * k[2]); };
  const g2 = E.neutralGains(warm('#E8E8E8'));
  assert.ok(E.colorDistance(E.applyGainsHex(warm('#2B4C7E'), g2), '#2B4C7E') < E.colorDistance(warm('#2B4C7E'), '#2B4C7E'), 'el azul no se acerca a su color real');
  assert.equal(E.neutralGains('#C0392B'), null, 'un rojo no es una referencia neutra');
  assert.equal(E.neutralGains('#050505'), null, 'casi negro no sirve');
  const px = { data: Uint8ClampedArray.from([242, 230, 207, 255, 10, 20, 30, 0]), width: 2, height: 1 };
  const out = E.applyGains(px, g);
  assert.equal(out.data[7], 0, 'la transparencia se conserva'); assert.equal(px.data[0], 242, 'la imagen original no cambia');
  assert.equal(E.applyGains(px, null), px);
});
test('Sugerencias: como mucho una prenda grande estampada (dos dibujos compiten)', () => {
  const lib = [pal('mc', 'Marino, crudo y camel', ['#1F2A44', '#F2EEE3', '#9C6B3F'])];
  const base = [garm('jersey', 'jerseis', '#21304A', { pattern: 'rayas' }), garm('chino', 'pantalones', '#EFEADF', { pattern: 'cuadros' }), garm('bota', 'calzado', '#9A6A41')];
  assert.equal(C.suggestOutfits({ garments: base, palettes: lib }).suggestions.length, 0, 'jersey de rayas con pantalón de cuadros');
  const one = base.map((g) => g.id === 'chino' ? Object.assign({}, g, { pattern: 'liso' }) : g);
  assert.equal(C.suggestOutfits({ garments: one, palettes: lib }).suggestions.length, 1, 'con un solo estampado sí');
});
test('Corrección de la luz: un azul marino no se acepta como neutro; un blanco con luz cálida, sí', () => {
  assert.equal(E.neutralGains('#2E4A6E'), null);
  assert.ok(E.neutralGains('#E9D9B8'));
});
test('Contexto: temporada y formalidad por prenda (vacío = todo el año / cualquier ocasión) y validación', () => {
  assert.equal(C.seasonOf(new Date(2026, 2, 21)), 'primavera'); assert.equal(C.seasonOf(new Date(2026, 6, 1)), 'verano');
  assert.equal(C.seasonOf(new Date(2026, 10, 4)), 'otono'); assert.equal(C.seasonOf(new Date(2026, 0, 15)), 'invierno'); assert.equal(C.seasonOf(new Date(2026, 11, 31)), 'invierno');
  const g = (seasons, formality) => ({ seasons, formality });
  assert.ok(C.fitsContext(g([], null), { season: 'invierno', occasion: 'formal' }), 'sin datos vale para todo');
  assert.ok(!C.fitsContext(g(['verano'], null), { season: 'invierno' }));
  assert.ok(C.fitsContext(g(['verano', 'invierno'], null), { season: 'invierno' }));
  assert.ok(!C.fitsContext(g([], 'casual'), { occasion: 'formal' })); assert.ok(!C.fitsContext(g([], 'formal'), { occasion: 'casual' }));
  assert.ok(C.fitsContext(g([], 'formal'), { occasion: 'smart' }) && C.fitsContext(g([], 'casual'), { occasion: 'smart' }), 'smart casual admite todo');
  assert.ok(C.fitsContext(g(['verano'], 'casual'), null), 'sin contexto no filtra');
  const ok = D.validateGarment({ category: 'camisas', primary_color: '#F4F2EC', seasons: ['otono', 'primavera', 'nada', 'otono'], formality: 'smart' });
  assert.ok(ok.ok); assert.deepEqual(ok.value.seasons, ['primavera', 'otono']); assert.equal(ok.value.formality, 'smart');
  assert.equal(D.validateGarment({ category: 'camisas', primary_color: '#F4F2EC', formality: 'gala' }).value.formality, null);
  assert.ok(!('seasons' in D.validateGarment({ category: 'camisas', primary_color: '#F4F2EC' }).value), 'sin el campo no se toca la columna');
});
test('Sugerencias con contexto y uso: filtra por temporada y ocasión, sube lo que gusta y baja lo llevado hace poco', () => {
  const lib = [pal('mc', 'Marino, crudo y camel', ['#1F2A44', '#F2EEE3', '#9C6B3F']), pal('gc', 'Gris, crudo y camel', ['#6E6E6E', '#F2EEE3', '#9C6B3F'])];
  const base = [garm('jersey', 'jerseis', '#21304A', { seasons: ['invierno'] }), garm('gris', 'jerseis', '#6F6F6F'), garm('chino', 'pantalones', '#EFEADF'), garm('bota', 'calzado', '#9A6A41', { formality: 'casual' })];
  const all = C.suggestOutfits({ garments: base, palettes: lib });
  assert.equal(all.suggestions.length, 2);
  const summer = C.suggestOutfits({ garments: base, palettes: lib, context: { season: 'verano' } });
  assert.deepEqual(summer.suggestions.map((x) => x.palette.id), ['gc'], 'el jersey de invierno no va en verano');
  assert.equal(C.suggestOutfits({ garments: base, palettes: lib, context: { occasion: 'formal' } }).suggestions.length, 0, 'la bota informal no va en formal');
  const today = new Date(2026, 10, 4, 12);
  const sigOf = (x) => x.garmentIds.slice().sort().join();
  const mc = all.suggestions.find((x) => x.palette.id === 'mc'), gc = all.suggestions.find((x) => x.palette.id === 'gc');
  const liked = C.suggestOutfits({ garments: base, palettes: lib, today, wear: [{ id: 'w1', kind: 'liked', garment_ids: gc.garmentIds.slice().reverse(), worn_on: '2026-10-01' }] });
  assert.equal(liked.suggestions[0].palette.id, 'gc', 'lo que gusta sube'); assert.equal(liked.suggestions[0].likedId, 'w1');
  const worn = C.suggestOutfits({ garments: base, palettes: lib, today, wear: [{ id: 'w2', kind: 'worn', garment_ids: liked.suggestions[0].garmentIds, worn_on: '2026-11-01' }, { id: 'w1', kind: 'liked', garment_ids: gc.garmentIds, worn_on: '2026-10-01' }] });
  assert.equal(worn.suggestions[0].palette.id, 'mc', 'lo llevado hace 3 días baja aunque guste');
  const g2 = worn.suggestions.find((x) => sigOf(x) === sigOf(gc));
  assert.equal(g2.lastWorn, 3); assert.ok(g2.recent && g2.liked);
  const idx = C.wearIndex([{ kind: 'worn', garment_ids: ['b', 'a'], worn_on: '2026-10-01' }, { kind: 'worn', garment_ids: ['a', 'b'], worn_on: '2026-11-04' }], today);
  assert.equal(idx['a,b'].lastWorn, 0, 'cuenta la vez más reciente');
  assert.ok(sigOf(mc));
});
