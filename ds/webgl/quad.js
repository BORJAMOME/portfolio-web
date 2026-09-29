/* ═══════════════════════════════════════════════
   quad.js — WebGL mínimo: un triángulo que cubre el canvas + un shader
   Por qué no Three.js: los dos materiales de esta página (cristal y
   linterna) son un único plano a pantalla completa. Three pesaría
   ~340 KB para dibujar un rectángulo; esto pesa ~2 KB y hace lo mismo.
   ═══════════════════════════════════════════════ */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[ds/webgl]', gl.getShaderInfoLog(s)); return null; }
  return s;
}

/**
 * Crea un pintor de shader sobre un <canvas>.
 * @returns {{u:Function, resize:Function, draw:Function, gl:WebGLRenderingContext}|null}
 *          null si no hay WebGL: el llamador simplemente no dibuja nada.
 */
export function createQuad(canvas, frag, { dprCap = 1.5 } = {}) {
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power', preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // Un solo triángulo sobredimensionado: cubre la pantalla sin la diagonal de dos triángulos.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const cache = {};
  const u = (name) => (name in cache ? cache[name] : (cache[name] = gl.getUniformLocation(prog, name)));

  let size = { w: 1, h: 1, dpr: 1 };
  function resize() {
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    gl.viewport(0, 0, W, H);
    size = { w, h, dpr };
    return size;
  }
  function draw() {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); canvas.style.display = 'none'; });
  return { gl, u, resize, draw, get size() { return size; } };
}
