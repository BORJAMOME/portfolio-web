/* ═══════════════════════════════════════════════
   tools/second-brain/build-three.mjs: genera el paquete recortado de Three.js
   ─────────────────────────────────────────────────
   Three.js ≥ r160 ya no publica un build minificado de un solo archivo, y los módulos sin
   recortar pesan ~2 MB. Este script empaqueta SOLO las clases que usa second-brain/viewer.js
   en vendor/three-<versión>-sb.min.js (un único módulo ES).

   Se ejecuta pocas veces (al actualizar Three.js), no en cada despliegue:
     npm i --no-save esbuild three@0.186.1
     node tools/second-brain/build-three.mjs
   Después: node tools/version-assets.mjs  (el nombre de vendor/ ya lleva la versión).
   ═══════════════════════════════════════════════ */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const { build } = require('esbuild');
const version = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'three', 'package.json'), 'utf8')).version;

/* Mantén esta lista alineada con lo que usa second-brain/viewer.js */
const USED = [
  'WebGLRenderer', 'Scene', 'PerspectiveCamera', 'Color', 'Fog', 'HemisphereLight', 'DirectionalLight',
  'SphereGeometry', 'IcosahedronGeometry', 'OctahedronGeometry', 'DodecahedronGeometry', 'BoxGeometry',
  'TorusGeometry', 'ConeGeometry', 'RingGeometry', 'MeshLambertMaterial', 'MeshBasicMaterial',
  'InstancedMesh', 'Mesh', 'DynamicDrawUsage', 'DoubleSide', 'Matrix4', 'Vector3', 'Vector2', 'Quaternion',
  'BufferGeometry', 'BufferAttribute', 'LineSegments', 'LineBasicMaterial', 'Raycaster',
];

const out = join(ROOT, 'vendor', `three-${version}-sb.min.js`);
mkdirSync(dirname(out), { recursive: true });
const r = await build({
  stdin: { contents: `export { ${USED.join(', ')} } from 'three';`, resolveDir: ROOT, loader: 'js' },
  bundle: true, minify: true, format: 'esm', target: 'es2020', write: false, legalComments: 'none',
});
const banner = `/* three.js r${version.split('.')[1]} (MIT, © three.js authors): paquete recortado para Second Brain. Ver tools/second-brain/build-three.mjs */\n`;
writeFileSync(out, banner + r.outputFiles[0].text);
console.log(`✓ ${out} (${Math.round(r.outputFiles[0].text.length / 1024)} KB) con ${USED.length} exportaciones`);
