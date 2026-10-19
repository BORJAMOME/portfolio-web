/* ═══════════════════════════════════════════════
   second-brain/icons.js: iconos de Second Brain
   ─────────────────────────────────────────────────
   Iconos de trazo propios (rejilla 24×24, trazo 2), dibujados para este visor:
   no son logotipos de marca. Se usan en dos sitios con el mismo dibujo:
     · en el mapa 3D, rasterizados una vez en un atlas (canvas → textura);
     · en la interfaz HTML, como <svg> (leyenda, detalle, tooltip).
   ═══════════════════════════════════════════════ */
const c = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const ICONS = {
  dot: c(12, 12, 3.5),
  // Business Intelligence
  powerbi: 'M6 20V12M10.5 20V8M15 20V4M19 20v-6',
  fx: 'M14 4h-1.5A2.5 2.5 0 0 0 10 6.5V20M7 10h6M15 13l5 6M20 13l-5 6',
  'fx-plus': 'M11 4h-1A2.5 2.5 0 0 0 7.5 6.5V20M5 10h5M14 9h7M17.5 5.5v7M14 15l5 5M19 15l-5 5',
  filter: 'M4 5h16l-6 7.5V19l-4 2v-8.5z',
  calendar: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2',
  transform: 'M4 7h11M12 4l3 3-3 3M20 17H9M12 14l-3 3 3 3',
  cloud: 'M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.6 9.3 4.35 4.35 0 0 0 7 18z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2',
  gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5M7 16h.01M17 16h.01',
  'star-schema': c(12, 12, 2.6) + 'M12 9.4V4M12 14.6V20M9.4 12H4M14.6 12H20M3 3h3v3H3zM18 3h3v3h-3zM3 18h3v3H3zM18 18h3v3h-3z',
  target: c(12, 12, 8) + c(12, 12, 4.5) + c(12, 12, 1),
  toggle: 'M3 12a5 5 0 0 1 5-5h8a5 5 0 0 1 0 10H8a5 5 0 0 1-5-5z' + c(16, 12, 2.6),
  // Datos
  database: 'M5 6c0-1.66 3.13-3 7-3s7 1.34 7 3-3.13 3-7 3-7-1.34-7-3zM5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3',
  venn: c(9, 12, 5.5) + c(15, 12, 5.5),
  window: 'M4 5h16v14H4zM4 9h16M4 13h16M4 17h16M9 5v14',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  braces: 'M8 4H7a2 2 0 0 0-2 2v3.5L3.5 12 5 14.5V18a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v3.5l1.5 2.5-1.5 2.5V18a2 2 0 0 1-2 2h-1',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14',
  notebook: 'M6 3h12v18H6zM9 3v18M12 8h4M12 12h4',
  pipeline: c(5, 12, 2) + c(19, 12, 2) + 'M7 12h3M14 12h3M10 9h4v6h-4z',
  'shield-check': 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6zM9 12l2 2 4-4',
  entities: 'M3 4h7v6H3zM14 14h7v6h-7zM6.5 10v4h7.5',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  plug: 'M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5',
  servers: 'M4 4h16v5H4zM4 10.5h16v5H4zM4 17h16v4H4zM7 6.5h.01M7 13h.01',
  // Análisis
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3V4M9 4h6M9 20h6',
  bell: 'M3 19c4 0 4-13 9-13s5 13 9 13M3 19h18M12 6v13',
  'search-chart': c(10, 10, 6) + 'M14.5 14.5L20 20M7.5 12V9.5M10 12V7.5M12.5 12v-1.5',
  nodes: c(6, 6, 2) + c(18, 6, 2) + c(12, 18, 2) + c(12, 11, 2) + 'M7.7 7.1l2.6 2.7M16.3 7.1l-2.6 2.7M12 13v3',
  tree: c(12, 5, 2) + c(6, 17, 2) + c(18, 17, 2) + c(12, 17, 2) + 'M12 7v4M6 15v-2.5h12V15M12 11v4',
  clusters: c(7, 8, 1.6) + c(10, 6, 1.6) + c(8.5, 11, 1.6) + c(16, 15, 1.6) + c(18.5, 18, 1.6) + c(15, 19, 1.6) + c(17, 6.5, 1.6),
  trend: 'M3 18l5-5 4 3 8-9M15 7h5v5M3 21h18',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  wrench: 'M14.5 6.5a4 4 0 0 0 5 5l1.5-1.5-3-1.5-1.5-3L18 4a4 4 0 0 0-5 5L4 18l2 2 9-9',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z' + c(12, 12, 3),
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0' + c(16, 6, 2) + c(10, 12, 2) + c(18, 18, 2),
  converge: 'M4 4l6 6M20 4l-6 6M4 20l6-6M20 20l-6-6' + c(12, 12, 2),
  network: c(5, 6, 1.6) + c(5, 12, 1.6) + c(5, 18, 1.6) + c(12, 9, 1.6) + c(12, 15, 1.6) + c(19, 12, 1.6) + 'M6.5 6.5l4 2M6.5 12l4-2.5M6.5 12l4 2.5M6.5 17.5l4-2M13.5 9.5l4 2M13.5 14.5l4-2',
  chat: 'M4 5h16v11H9l-5 4zM8 10h8M8 13h5',
  thumbs: 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2.5 2.5L12.5 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7',
  ab: 'M3 19l4-14 4 14M4.5 14h5M14 5h4a3 3 0 0 1 0 6h-4zM14 11h4.5a3.5 3.5 0 0 1 0 7H14zM14 5v13',
  // Visualización y UX
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6M7 9l4-3 4 2 5-4',
  story: 'M4 5h11a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4zM20 8v12M8 9h6M8 12h4',
  'bars-baseline': 'M3 20h18M6 20v-6M10 20V8M14 20v-9M18 20v-4M6 6h4',
  layout: 'M4 4h16v16H4zM4 9h16M10 9v11',
  a11y: c(12, 4.5, 1.6) + 'M5 8.5l7 1.5 7-1.5M12 10v4M12 14l-3 7M12 14l3 7',
  app: 'M3 5h18v14H3zM3 9h18M10 12.5v4l3.5-2z',
  cursor: 'M5 3l13 6-5.5 2L10 17zM13 13l5 5',
  'user-search': c(9, 8, 3.5) + 'M3 20c0-3.5 2.7-6 6-6 1.2 0 2.3.3 3.2.9' + c(17, 16, 3) + 'M19.2 18.2L21.5 20.5',
  sitemap: 'M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6zM12 7v5M6 17v-5h12v5',
  pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6' + c(11, 11, 2),
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  // Profesional
  branch: c(6, 5, 2) + c(6, 19, 2) + c(18, 7, 2) + 'M6 7v10M18 9c0 4-6 3-11 8',
  cycle: 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18 3v4.5h-4.5M6 21v-4.5h4.5',
  checklist: 'M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 15.5h6M9 9h2',
  briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18M11 13v2h2v-2',
  compass: c(12, 12, 9) + 'M15.5 8.5l-2 5-5 2 2-5z',
  // Negocio
  store: 'M4 9l1.5-5h13L20 9M4 9h16v11H4zM4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5' + c(9, 19, 1.5) + c(17, 19, 1.5),
  coin: c(12, 12, 9) + 'M15 8.5a4 4 0 1 0 0 7M7.5 11h6M7.5 13.5h6',
  megaphone: 'M3 10v4h3l8 5V5L6 10zM6 14l1.5 6h3L9 15M18 9a4 4 0 0 1 0 6',
  bed: 'M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6M7 12.5a1.5 1.5 0 1 0 0-.01',
  // Tipos
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  dashboard: 'M3 4h18v16H3zM3 9h18M8 9v11M11 17v-3M14 17v-5M17 17v-2',
  'notebook-book': 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 10h5',
  hexagon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z',
  flag: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
};

/* Glifo SVG para la interfaz HTML (los trazos se heredan de currentColor). */
export function iconSvg(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'sb-ico');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[id] || ICONS.dot);
  svg.appendChild(p);
  return svg;
}

/* Atlas: glifos blancos sobre transparente y, si se pasan, logotipos a color.
   Devuelve { canvas, cols, index(id), logo(key) → celda | -1, ready: Promise } (los logotipos
   se decodifican como imágenes data:, así que llegan un instante después). */
export function buildAtlas(cell = 128, logos = null) {
  const ids = Object.keys(ICONS);
  const logoIds = logos ? Object.keys(logos.LOGOS) : [];
  const cols = Math.ceil(Math.sqrt(ids.length + logoIds.length));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cols * cell;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ids.forEach((id, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    ctx.save();
    ctx.translate(x + cell * 0.14, y + cell * 0.14);
    const s = (cell * 0.72) / 24;
    ctx.scale(s, s);
    ctx.lineWidth = 2.1;
    ctx.stroke(new Path2D(ICONS[id]));
    ctx.restore();
  });
  const at = new Map(ids.map((id, i) => [id, i]));
  const logoAt = new Map(logoIds.map((id, i) => [id, ids.length + i]));
  const ready = Promise.all(logoIds.map((id) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = logoAt.get(id), x = (k % cols) * cell, y = Math.floor(k / cols) * cell;
      const box = cell * 0.78, ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
      const w = ratio >= 1 ? box : box * ratio, hh = ratio >= 1 ? box / ratio : box;
      ctx.drawImage(img, x + (cell - w) / 2, y + (cell - hh) / 2, w, hh);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = logos.logoUrl(id);
  })));
  return { canvas, cols, ready, index: (id) => (at.has(id) ? at.get(id) : at.get('dot')), logo: (key) => (logoAt.has(key) ? logoAt.get(key) : -1) };
}
