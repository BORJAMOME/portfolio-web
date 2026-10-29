# Manual de Claude (`claude-academy/`)

Manual visual que crece con cada curso de Claude Academy que se estudia. Misma familia visual que los manuales de
[Power BI](../pbi/) y [Machine Learning](../ml/) (se creó con la skill `manual-borja`), ampliado con lo que necesita un manual
que **va a crecer durante meses**: relaciones entre temas, fuentes con fecha, estado de verificación, mapa mental y registro de cambios.

URL: `/claude-academy/` · Sin build: scripts clásicos que se editan directamente · **`noindex` hasta que tenga contenido de cursos**
(para indexarlo: quitar `<meta name="robots" content="noindex">` de `index.html` y añadir la URL a `sitemap.xml`).

## Archivos

```
claude-academy/
├── index.html        estructura y orden de carga de los scripts
├── styles.css        sistema de diseño del manual de Power BI, sin tocar, + sección «AMPLIACIONES» al final (ca-, vz-)
├── content.js        MANUAL, BLOCKS, COURSES, SRCKINDS, VERSTATES, RELTYPES, GLOSS, LOG  (todo lo que no es una ficha)
├── temas/
│   └── 00-guia.js    fichas del bloque 0 (la guía del propio manual). Un archivo por curso: temas/<curso>.js
├── viz.js            un visual interactivo por tema: VIZ.<id> = function(f){…}
├── grafo.js          lógica pura (sin DOM): grafo de relaciones, ruta de aprendizaje, posiciones del mapa
├── mapa.js           vista #mapa (SVG con zoom y desplazamiento + lista equivalente) y miniatura de Inicio
└── app.js            rutas, ficha, catálogo, glosario, buscador (Ctrl K), progreso y quiz
```

## Una sola fuente de verdad

Todo sale de `TOPICS` (las fichas) y de `COURSES`. Cada ficha declara sus relaciones (`rel`) y sus fuentes (`src`);
de ahí se **derivan** la sección «Dónde encaja» de la ficha, la ruta de aprendizaje, el mapa mental, el índice, el buscador
y los filtros por curso. No hay un segundo mapa ni un segundo índice que mantener a mano.

Rutas: `#` · `#temas` · `#mapa` · `#mapa/<id>` (nodo seleccionado) · `#glosario` · `#tema/<id>`.
El `id` de un tema **no se cambia nunca** (el título sí): rutas, relaciones, glosario, registro y progreso guardado se enlazan por él.

## Incorporar un curso nuevo (procedimiento)

1. **Identificar el recurso** y leerlo entero. Si no se puede acceder (autenticación, vídeo, enlace roto), no se inventa su contenido:
   se anota qué falta y se pide el texto o las capturas.
2. **Buscar lo que ya existe** (`#temas`, buscador, `grep` en `temas/`). Un concepto = una ficha. Si ya existe: se amplía y se añade la fuente
   (y lo propio de este curso dentro de esa ficha); si dos fuentes difieren, se muestran las dos diferencias, no se borra una.
3. **Registrar el curso** en `COURSES` en `content.js`: `{id, t, u (https), k, d (fecha de consulta AAAA-MM-DD)}`.
4. **Escribir las fichas** en `temas/<curso>.js` con `TOPICS.push({...})` siguiendo el esquema de la cabecera de `content.js`
   y la voz de la skill (`references/voz-editorial.md`). Cada ficha:
   - `src:[{t, u, k, c:"<id del curso>", d}]`: fuente junto al concepto que explica. `k = oficial` exige URL.
   - `ver:{e, d, n}`: `verificado` / `parcial` solo si se **contrastó** con la fuente (con fecha); si no, `pendiente`.
   - `rel:[{t, a, w}]`: relaciones con temas que existen; `w` explica por qué (obligatorio). `necesita` marca orden de estudio y no puede formar ciclos.
   - `kw`: palabras sencillas por las que se buscaría («conectar Claude con herramientas externas»), además del nombre técnico.
   - Explicación en dos niveles: capítulo 1-2 (idea y ejemplo) sin jerga; el resto, para aplicar. `lab` (ejercicio paso a paso) y `ejer` (ejercicios con solución
     explicada) solo si el tema lo permite. Nada de ejemplos de ejecución que no se hayan ejecutado.
5. **Bloque**: si el tema no encaja en uno existente, añadir su bloque a `BLOCKS` (`n` consecutivo; sin bloques vacíos).
6. **Cargar** `temas/<curso>.js` en `index.html` (antes de `mapa.js`), añadir los términos nuevos a `GLOSS` y un visual por tema en `viz.js` (o `viz-<curso>.js`).
7. **Registrar el cambio** en `LOG` (`content.js`): `{d, r, curso, nuevo[], mod[], mapa, pend[]}`. Cada tema nuevo debe aparecer en algún `nuevo`.
8. **Comprobar**:
   ```bash
   node tools/check-claude-academy.mjs      # datos, relaciones, ciclos, fuentes, LOG, solapes del mapa
   node tools/version-assets.mjs            # versiones ?v= de los scripts y del CSS
   node tools/mapa/build-mapa.mjs           # pestaña Mapa del área privada (si cambian archivos del repo)
   node tools/version-assets.mjs --check && node tools/check-links.mjs
   node tools/check-a11y.mjs "claude-academy/index.html#mapa"   # axe; requiere playwright + axe-core
   ```
   Después, mirar el mapa y una ficha en el navegador (escritorio y móvil).

## Decisiones y desvíos respecto a la skill `manual-borja`

- `BLOCKS[].n` empieza en **0** (la Guía es el bloque 0); la skill pide 1. Sin bloques vacíos: la estructura prevista (Fundamentos, Claude Code, Skills, Agentes, MCP, …) es una hipótesis; un bloque nace con su primer tema.
- Campos nuevos por ficha: `kw`, `tags`, `upd`, `ver`, `rel`, `lab`, `ejer`; `src` admite objetos. Búsqueda por todas las palabras (sin tildes ni mayúsculas), no por frase exacta.
- `styles.css` conserva el sistema de diseño tal cual; lo nuevo va al final en una sección marcada y solo con tokens.
- Mapa: a partir de 40 temas las ramas salen plegadas (`MAX_ALL` en `grafo.js`). Las relaciones se distinguen por **trazo** además de por texto; la lista equivalente es la vista por defecto en móvil.
- El progreso del lector vive en `localStorage` (`claudeacademy_*`); no hay cuenta ni servidor.
- Para añadir una vista, seguir `references/extender.md` de la skill.

## Lo que NO está verificado

- El contenido de los cursos: todavía no hay ninguno. Las fichas actuales describen el propio manual y se comprobaron contra su interfaz.
- Tema oscuro: se ha revisado a ojo, no con axe (axe corre en claro).
- Pantallas táctiles reales (zoom con dos dedos): implementado con Pointer Events, sin probar en un dispositivo.
