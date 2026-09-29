/* Linterna narrativa (cap. 05)
   Un velo tinta que oscurece el dashboard salvo en 1–3 rectángulos redondeados
   (los elementos que la frase señala). Borde con caída suave, un filo de luz
   violeta casi imperceptible (el "bloom" contenido) y grano para que el
   degradado no haga bandas. Coordenadas en píxeles de dispositivo, origen abajo-izquierda. */
export default /* glsl */`
precision mediump float;
uniform vec2 u_res;
uniform vec4 u_r[3];      // x, y, ancho, alto de cada foco
uniform float u_n;        // cuántos focos hay
uniform float u_k;        // 0 = sin velo, 1 = velo completo
uniform float u_dpr;
uniform float u_t;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float feather = 22.0 * u_dpr;
  float radius = 10.0 * u_dpr;
  float lit = 0.0;
  float rim = 0.0;
  for (int i = 0; i < 3; i++) {
    if (float(i) >= u_n) break;
    vec4 r = u_r[i];
    float d = sdRoundBox(p - (r.xy + r.zw * 0.5), r.zw * 0.5, radius);
    lit = max(lit, 1.0 - smoothstep(0.0, feather, d));
    rim = max(rim, exp(-abs(d - 1.5 * u_dpr) / (2.5 * u_dpr)));
  }
  float veil = u_k * (1.0 - lit) * 0.44;
  float grain = (hash(p + u_t) - 0.5) * 0.02 * u_k;
  float a = clamp(veil + grain, 0.0, 1.0);
  vec3 col = vec3(0.075, 0.068, 0.10) * a;           // tinta cálida, nunca negro puro
  float glow = rim * u_k * 0.07;                       // bloom extremadamente contenido
  col += vec3(0.42, 0.36, 0.65) * glow;
  gl_FragColor = vec4(col, max(a, glow));
}
`;
