/* tools/second-brain/build-logos.cjs: genera second-brain/logos.js con los logotipos que usa el mapa.
   Se ejecuta pocas veces (al cambiar la lista):
     npm i --no-save @iconify-json/logos @iconify-json/simple-icons @iconify-json/vscode-icons
     node tools/second-brain/build-logos.cjs
   Después: recalcular el ?v= de second-brain/logos.js en area-privada.html. */
const fs = require('fs');
const path = require('path');
const B = path.join(__dirname, '..', '..', 'node_modules', '@iconify-json');
const sets = {
  logos: require(path.join(B, 'logos/icons.json')),
  si: require(path.join(B, 'simple-icons/icons.json')),
  vs: require(path.join(B, 'vscode-icons/icons.json')),
};
// concepto → [set, icono, color para iconos monocromo de Simple Icons]
const MAP = {
  powerbi: ['logos', 'microsoft-power-bi'],
  sql: ['si', 'microsoftsqlserver', '#CC2927'],
  python: ['logos', 'python'],
  pandas: ['logos', 'pandas-icon'],
  'numpy-scipy': ['logos', 'numpy'],
  jupyter: ['logos', 'jupyter'],
  git: ['logos', 'github-icon'],
  excel: ['vs', 'file-type-excel'],
  'scikit-learn': ['si', 'scikitlearn', '#F7931E'],
  streamlit: ['logos', 'streamlit'],
  figma: ['logos', 'figma'],
  'desarrollo-web': ['logos', 'html-5'],
  'deep-learning': ['logos', 'tensorflow'],
  'ia-generativa': ['si', 'huggingface', '#FF9D00'],
  'big-data': ['logos', 'apache-spark'],
  'cloud-datos': ['logos', 'microsoft-azure'],
  automatizacion: ['logos', 'github-actions'],

};
const LIC = { logos: 'SVG Logos (gilbarbara/logos), CC0-1.0', si: 'Simple Icons, CC0-1.0', vs: 'vscode-icons, MIT (© Roberto Huertas)' };
const out = {};
for (const [id, [set, name, color]] of Object.entries(MAP)) {
  const j = sets[set];
  let ic = j.icons[name];
  if (!ic && j.aliases && j.aliases[name]) ic = j.icons[j.aliases[name].parent];
  if (!ic) throw new Error('falta ' + set + ':' + name);
  const w = ic.width || j.width || 16, h = ic.height || j.height || 16;
  let body = ic.body;
  if (color) body = body.replace(/currentColor/g, color);
  out[id] = { vb: `0 0 ${w} ${h}`, body, src: LIC[set] + ' · ' + name };
}
const header = `/* ═══════════════════════════════════════════════
   second-brain/logos.js: logotipos de tecnologías para Second Brain (generado)
   ─────────────────────────────────────────────────
   Marcas registradas de sus respectivos propietarios; se usan solo para identificar
   la tecnología de cada concepto en un panel privado (uso nominativo).
   Procedencia y licencia de los dibujos:
     · SVG Logos (github.com/gilbarbara/logos) — CC0-1.0
     · Simple Icons (simpleicons.org) — CC0-1.0
     · vscode-icons (github.com/vscode-icons/vscode-icons) — MIT, © Roberto Huertas
   Se cargan en el mapa como imágenes data: (img-src 'self' data: en la CSP) y nunca como HTML.
   ═══════════════════════════════════════════════ */
`;
const js = header + 'export const LOGOS = ' + JSON.stringify(out, null, 1) + ';\n\n' +
`/** URL data: de un logotipo (para <img> y para rasterizarlo en el atlas del mapa). */
export function logoUrl(id) {
  const l = LOGOS[id];
  if (!l) return null;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + l.vb + '">' + l.body + '</svg>');
}
`;
fs.writeFileSync(path.join(__dirname, '..', '..', 'second-brain', 'logos.js'), js);
console.log(Object.keys(out).length, 'logos ·', Math.round(js.length / 1024), 'KB');
