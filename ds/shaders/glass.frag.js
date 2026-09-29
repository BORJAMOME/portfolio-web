/* Cristal del hero
   No refracta nada que no exista: es la superficie de un cristal sobre el
   dashboard. Un reflejo ancho y blando que sigue la luz (el cursor), bordes
   que captan algo más de luz arriba-izquierda (fresnel) y una banda diagonal
   tenue. Se compone con mix-blend-mode: soft-light, así aclara los medios
   tonos sin lavar el texto negro. */
export default /* glsl */`
precision mediump float;
uniform vec2 u_res;
uniform vec2 u_m;         // posición de la luz, 0–1, origen abajo-izquierda
uniform float u_i;        // intensidad (0 en reposo absoluto)
uniform float u_t;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 d = (uv - u_m) * vec2(aspect, 1.0);
  float spec = exp(-dot(d, d) * 5.0);

  vec2 e = min(uv, 1.0 - uv);
  float edge = 1.0 - smoothstep(0.0, 0.035, min(e.x * aspect, e.y));
  float fromTopLeft = 0.55 + 0.45 * dot(normalize(vec2(-0.6, 0.8)), normalize(uv - 0.5 + 1e-4));

  float s = (uv.x + uv.y * 0.6) - (u_m.x + u_m.y * 0.6) - 0.18;
  float band = exp(-s * s * 55.0) * 0.3;

  float grain = (hash(gl_FragCoord.xy + u_t) - 0.5) * 0.02;
  float a = clamp((spec * 0.55 + edge * 0.28 * fromTopLeft + band + grain) * u_i, 0.0, 1.0);
  gl_FragColor = vec4(vec3(a), a);
}
`;
