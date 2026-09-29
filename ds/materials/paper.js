/* ═══════════════════════════════════════════════
   paper.js — grano de papel procedural
   Un azulejo de 200×200 generado una vez: ruido fino (fibra) + manchas
   de baja frecuencia (el papel nunca es uniforme). Se sirve como imagen
   estática y fija: coste de GPU ~0, nada se anima.
   ═══════════════════════════════════════════════ */

function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function initPaper() {
  const N = 200, c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d'); if (!ctx) return;
  const img = ctx.createImageData(N, N), d = img.data, rnd = mulberry(1987);

  // manchas: rejilla gruesa 8×8 interpolada (periódica para que el azulejo no tenga costuras)
  const G = 8, coarse = Array.from({ length: G * G }, () => rnd());
  const at = (x, y) => coarse[((y % G + G) % G) * G + ((x % G + G) % G)];
  const smooth = (t) => t * t * (3 - 2 * t);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const gx = x / N * G, gy = y / N * G, x0 = Math.floor(gx), y0 = Math.floor(gy);
      const tx = smooth(gx - x0), ty = smooth(gy - y0);
      const blot = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      const grain = rnd();
      const a = grain * 5 + blot * 2.5;          // alfa 0–7,5 de 255: se intuye, no se ve
      const i = (y * N + x) * 4;
      d[i] = 40; d[i + 1] = 36; d[i + 2] = 48; d[i + 3] = a; // tinta cálida, no negro puro
    }
  }
  ctx.putImageData(img, 0, 0);
  c.toBlob((blob) => {
    if (!blob) return;
    document.documentElement.style.setProperty('--paper', `url(${URL.createObjectURL(blob)})`);
  }, 'image/png');
}
