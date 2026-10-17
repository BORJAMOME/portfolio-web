/* ═══════════════════════════════════════════════
   tools/second-brain/layout.mjs: posición de los nodos en el espacio 3D
   ─────────────────────────────────────────────────
   Se calcula UNA vez en el motor (determinista: misma entrada, mismas posiciones)
   para que el visor solo tenga que dibujar:
     1. las regiones se reparten sobre una esfera (espiral de Fibonacci);
     2. cada nodo nace cerca del centro de su región;
     3. una simulación de fuerzas corta (repulsión + muelles de las relaciones
        + atracción a su región) los asienta sin solaparse.
   ═══════════════════════════════════════════════ */
import { hash32, rng } from './text.mjs';

const REGION_RADIUS = 78;
const ITERATIONS = 260;
const EDGE_WEIGHT = { usa: 1, 'parte-de': 1.1, requiere: 1, mejora: 0.8, habilita: 0.8, demuestra: 0.55, agrupa: 0.35, necesita: 0.12, recomienda: 0.6 };

export function layout(regions, nodes, edges) {
  const n = regions.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  regions.forEach((r, i) => {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * golden;
    r.center = [Math.cos(th) * rad * REGION_RADIUS, y * REGION_RADIUS * 0.8, Math.sin(th) * rad * REGION_RADIUS];
  });
  const center = new Map(regions.map((r) => [r.id, r.center]));
  const index = new Map(nodes.map((nd, i) => [nd.id, i]));
  const P = nodes.map((nd) => {
    const rand = rng(hash32(nd.id));
    const c = center.get(nd.region) || [0, 0, 0];
    return [c[0] + (rand() - 0.5) * 26, c[1] + (rand() - 0.5) * 26, c[2] + (rand() - 0.5) * 26];
  });
  const V = nodes.map(() => [0, 0, 0]);
  const links = edges.map((e) => [index.get(e.source), index.get(e.target), EDGE_WEIGHT[e.type] ?? 0.5]).filter((l) => l[0] !== undefined && l[1] !== undefined);
  const radius = nodes.map((nd) => 3 + nd.size * 4);

  for (let it = 0; it < ITERATIONS; it++) {
    const cool = 1 - it / ITERATIONS;
    // repulsión entre pares
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], dz = P[i][2] - P[j][2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.01) { dx = 0.1; dy = 0.1; dz = 0.1; d2 = 0.03; }
        const d = Math.sqrt(d2);
        const minD = radius[i] + radius[j] + 3;
        const f = (260 / d2) + (d < minD ? (minD - d) * 0.5 : 0);
        const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
        V[i][0] += fx; V[i][1] += fy; V[i][2] += fz;
        V[j][0] -= fx; V[j][1] -= fy; V[j][2] -= fz;
      }
    }
    // muelles de las relaciones
    for (const [a, b, w] of links) {
      const dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1], dz = P[b][2] - P[a][2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const rest = 16 + radius[a] + radius[b];
      const f = (d - rest) * 0.02 * w;
      V[a][0] += (dx / d) * f; V[a][1] += (dy / d) * f; V[a][2] += (dz / d) * f;
      V[b][0] -= (dx / d) * f; V[b][1] -= (dy / d) * f; V[b][2] -= (dz / d) * f;
    }
    // atracción a la región
    for (let i = 0; i < nodes.length; i++) {
      const c = center.get(nodes[i].region) || [0, 0, 0];
      V[i][0] += (c[0] - P[i][0]) * 0.045; V[i][1] += (c[1] - P[i][1]) * 0.045; V[i][2] += (c[2] - P[i][2]) * 0.045;
    }
    for (let i = 0; i < nodes.length; i++) {
      const step = 0.55 * cool + 0.05;
      const mag = Math.hypot(V[i][0], V[i][1], V[i][2]) || 1;
      const cap = Math.min(mag, 14) / mag;
      P[i][0] += V[i][0] * cap * step; P[i][1] += V[i][1] * cap * step; P[i][2] += V[i][2] * cap * step;
      V[i][0] = V[i][1] = V[i][2] = 0;
    }
  }

  // recentrar en el origen y fijar decimales
  const mean = [0, 1, 2].map((k) => P.reduce((s, p) => s + p[k], 0) / (P.length || 1));
  nodes.forEach((nd, i) => { nd.pos = [0, 1, 2].map((k) => Math.round((P[i][k] - mean[k]) * 100) / 100); });
  for (const r of regions) {
    const own = nodes.filter((nd) => nd.region === r.id);
    r.center = own.length
      ? [0, 1, 2].map((k) => Math.round((own.reduce((s, nd) => s + nd.pos[k], 0) / own.length) * 100) / 100)
      : r.center.map((v, k) => Math.round((v - mean[k]) * 100) / 100);
  }
}
