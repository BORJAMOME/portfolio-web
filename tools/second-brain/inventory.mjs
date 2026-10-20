/* ═══════════════════════════════════════════════
   tools/second-brain/inventory.mjs: inventario trazable de fuentes y proyectos
   ─────────────────────────────────────────────────
   Responde a: qué fuentes se han descubierto, cuáles se han inspeccionado y cuántos archivos,
   qué proyectos hay y de dónde sale cada uno, qué se ha unido, qué no se ha podido mirar y qué
   queda por revisar. Se escribe en .second-brain/inventario.json (local, no se versiona ni se publica:
   contiene rutas de tu equipo).
   ═══════════════════════════════════════════════ */

export function buildInventory({ scan, snapshot, config, now = new Date() }) {
  const repoOf = new Map();
  for (const p of scan.projects.values()) if (p.repo && !repoOf.has(p.source)) repoOf.set(p.source, p.repo.slug);
  const sources = scan.coverage.sources.map((s) => ({
    id: s.id, label: s.label, kind: s.kind, repo: repoOf.get(s.id) || null,
    files: s.files, supported: s.supported, ignored: s.ignored,
    path: (config.sources.find((x) => x.id === s.id) || {}).path || null,
    estado: 'inspeccionada',
  }));
  const notInspected = (Array.isArray(config.inaccesibles) ? config.inaccesibles : []).filter((x) => x && x.repo).map((x) => ({
    repo: String(x.repo), motivo: String(x.motivo || 'Sin clon local ni acceso desde el motor.').slice(0, 300), estado: 'no inspeccionada',
  }));
  const projects = snapshot.nodes.filter((n) => n.type === 'proyecto').map((n) => ({
    id: n.id, titulo: n.label, familia: n.family || null, tecnicaPrincipal: n.parent || null,
    fuentes: (n.sources || []).map((s) => ({ tipo: s.kind, url: s.url })), unificadoCon: n.merged || [],
    sinReadme: !!n.noReadme, carpetaSinConfirmar: n.docOnly || [],
  }));
  return {
    generatedAt: now.toISOString(), engine: snapshot.engine,
    resumen: {
      fuentes: sources.length, noInspeccionadas: notInspected.length, proyectos: projects.length,
      unificados: snapshot.quality.merged.length, indices: snapshot.quality.indexes.length,
      sinReadme: snapshot.quality.noReadme.length, carpetaSinConfirmar: snapshot.quality.docOnly,
      posiblesDuplicados: snapshot.quality.candidates.length,
    },
    fuentes: sources, noInspeccionadas: notInspected, proyectos: projects,
    identidad: { unificados: snapshot.quality.merged, indices: snapshot.quality.indexes, posiblesDuplicados: snapshot.quality.candidates },
    revisar: {
      sinReadme: snapshot.quality.noReadme, sinClasificar: snapshot.quality.unclassified,
      sinProyecto: snapshot.nodes.filter((n) => n.stage && n.type !== 'proyecto' && !n.branch && n.stage !== 'sin_evidencia' && !snapshot.edges.some((e) => e.type === 'demuestra' && e.target === n.id)).map((n) => ({ id: n.id, label: n.label, etapa: n.stage })),
    },
    nota: 'La trazabilidad concepto → archivo está en snapshot.trace (referencias por proyecto y archivo). Este inventario no se publica.',
  };
}

/* ── Documentación de la taxonomía ── */
const TIPO = { tecnologia: 'tecnología', concepto: 'concepto', tecnica: 'técnica' };

/** Árbol del marco (estructura, familia y carpetas que lo declaran). Determinista: un test comprueba que TAXONOMIA.md está al día. */
export function taxonomyDoc(framework) {
  const byParent = new Map();
  for (const c of framework.conceptos) { const p = c.padre || ''; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(c); }
  const fam = new Map(framework.familias.map((f) => [f.id, f.label]));
  const withKids = (byParent.get('') || []).filter((c) => byParent.has(c.id));
  const loose = (byParent.get('') || []).filter((c) => !byParent.has(c.id));
  const line = (c, d) => `${'  '.repeat(d)}- **${c.label}** _(${TIPO[c.tipo] || c.tipo}; ${fam.get(c.familia) || c.familia}${c.rutas && c.rutas.length ? '; carpeta: ' + c.rutas.map((r) => '`' + r + '`').join(', ') : ''})_`;
  const walk = (c, d, out) => { out.push(line(c, d)); for (const k of (byParent.get(c.id) || []).sort((a, b) => a.label.localeCompare(b.label, 'es'))) walk(k, d + 1, out); };
  const tree = [];
  for (const r of withKids.sort((a, b) => a.label.localeCompare(b.label, 'es'))) walk(r, 0, tree);
  return [
    '# Taxonomía del Second Brain',
    '',
    `> Generado con \`node tools/second-brain/analyze.mjs --doc\` desde \`framework.json\` (versión ${framework.version}). No se edita a mano: cambia el marco y regenera.`,
    '',
    '## De dónde sale',
    '',
    'La estructura **no se inventa**: sale de cómo organizas tus carpetas (por ejemplo `03-Machine-Learning/01-supervisado/clasificacion/random-forest/…`) y de lo que el código confirma.',
    'Cada concepto del marco puede tener un `padre` (la rama a la que pertenece) y unas `rutas` (los nombres de carpeta con los que lo organizas).',
    '',
    '- **Una carpeta declara el tema, el código lo confirma.** El nombre de la carpeta solo cuenta como documentación. Un proyecto en `random-forest/` cuyo código no usa `RandomForest*` aparece como _«la carpeta lo declara, el código no lo confirma»_ y no como práctica.',
    '- **La evidencia sube por la jerarquía.** Un área o una disciplina está respaldada si lo está alguna de sus técnicas, y cada rama indica cuántas de sus técnicas tienen práctica, cuántas solo documentación y cuántas ninguna evidencia. Es cobertura, no dominio.',
    '- **Un proyecto, una entidad.** La carpeta del portfolio, el repositorio de su app y la página publicada se unen en un solo proyecto cuando sus README (o el catálogo) se enlazan de forma explícita. No se une nada por parecido de nombre; los posibles duplicados sin vínculo se avisan.',
    '- **Posición en el árbol.** Cada proyecto cuelga de la técnica más específica que su carpeta declara y su código confirma; además se relaciona («demuestra») con todas las que aplica (hasta 10, las más específicas primero).',
    '- **Lo que no existe no se pinta.** Solo hay nodos para lo que aparece en tus materiales. Una rama sin evidencia cuenta como «sin evidencia» en la cobertura de su padre; no se inventa un nodo vacío.',
    '',
    '## Etapas de conocimiento',
    '',
    '| Etapa | Qué significa | Cómo se llega |',
    '|---|---|---|',
    '| Identificado | Aparece solo en listas o menciones declarativas | Evidencia declarativa |',
    '| Estudiado o documentado | Hay documentación o apuntes, sin práctica detectable | Evidencia explicativa |',
    '| Aplicado | Se ha usado en el código o los artefactos de un proyecto | Evidencia práctica |',
    '| Reforzado | Aplicado en más de un proyecto | Práctica en ≥ 2 proyectos |',
    '| Evaluado | Evaluado con una prueba o evidencia verificable | Solo si lo registras (`assessments`, con motivo y origen) |',
    '| Dominio confirmado | Confirmado con criterios definidos | Solo si lo registras tú («Lo domino» o `assessments`) |',
    '',
    'No es una puntuación: cinco proyectos no demuestran más dominio que uno complejo y bien evaluado, y la ausencia de evidencia no se interpreta como desconocimiento.',
    '',
    '## Árbol (áreas con ramas)',
    '',
    tree.join('\n'),
    '',
    '## Conceptos sueltos (sin ramas propias)',
    '',
    loose.sort((a, b) => a.label.localeCompare(b.label, 'es')).map((c) => `- ${c.label} _(${fam.get(c.familia) || c.familia})_`).join('\n'),
    '',
    '## Cómo añadir una técnica',
    '',
    '1. Añade el concepto a `framework.json` → `conceptos` con su `padre`, su `familia`, los `terminos` que lo nombran, `codigo` (patrones por lenguaje) y, si tus carpetas lo nombran, `rutas`.',
    '2. Si hay una relación transversal (no jerárquica), añádela a `relaciones` con su fundamento.',
    '3. `node tools/second-brain/analyze.mjs --demo` y `--doc`; ejecuta las pruebas. Si el concepto no aparece en tus materiales, no habrá nodo: es intencionado.',
    '',
    '## Compatibilidad y migración',
    '',
    '- Los identificadores existentes (`c:…`, `p:…`, `k:…`) no cambian, así que tus notas de `sb_notas` siguen apuntando al mismo elemento. `clasificacion-regresion` pasa a llamarse «Aprendizaje supervisado» sin cambiar de id.',
    '- La migración es aditiva (campos y nodos nuevos); un snapshot anterior sigue siendo válido. Para volver atrás basta con publicar de nuevo un snapshot anterior (cada publicación es una fila de `sb_snapshots`).',
    '- Tus valoraciones y notas no se tocan: se aplican encima del análisis, nunca dentro.',
    '',
  ].join('\n');
}

/** Informe local con tus datos reales (estructura, etapa, proyectos y ejemplos). No se versiona. */
export function realReport(snapshot, T) {
  const lines = [`# Taxonomía real · análisis ${snapshot.generatedAt.slice(0, 10)} (motor ${snapshot.engine.version})`, ''];
  const walk = (n, d) => {
    const ps = T.projectsOf(n.id, false);
    const ex = ps.slice(0, 3).map((p) => p.label).join('; ');
    lines.push(`${'  '.repeat(d)}- ${n.label} [${n.stage}]${n.branch ? ` · rama ${n.branch.aplicado}/${n.branch.leaves} con práctica` : ''} · ${ps.length} proyecto(s)${ex ? ' → ' + ex : ''}`);
    for (const k of T.kids.get(n.id) || []) walk(k, d + 1);
  };
  for (const r of T.roots.filter((x) => (T.kids.get(x.id) || []).length)) walk(r, 0);
  lines.push('', '## Conceptos sueltos', '', ...T.roots.filter((x) => !(T.kids.get(x.id) || []).length).map((n) => `- ${n.label} [${n.stage}]`));
  return lines.join('\n') + '\n';
}
