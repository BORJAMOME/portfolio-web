# Manual de Claude (área privada → Portfolio → Manuales privados)

Manual visual que crece con cada curso de Claude Academy que se estudia. Misma familia visual que los manuales de
[Power BI](../pbi/) y [Machine Learning](../ml/) (se creó con la skill `manual-borja`), ampliado con lo que necesita un manual
que **va a crecer durante meses**: relaciones entre temas, fuentes con fecha, estado de verificación, mapa mental y registro de cambios.

## Por qué el contenido no está en el repositorio

El repositorio y GitHub Pages son **públicos**: cualquier archivo de la web se puede leer con su URL (el `noindex` solo evita Google).
Para que el manual sea privado de verdad:

| Qué | Dónde | Quién lo ve |
|---|---|---|
| **Motor** (código, estilos, visuales genéricos; ningún tema) | repo: `area-privada-claude.js`, `claude-manual/`, `css/claude-manual.css` | cualquiera (no contiene contenido de cursos) |
| **Contenido** (bloques, fichas, cursos, glosario, registro) | Supabase, tabla `cm_docs` con RLS (`supabase/claude-manual.sql`) | solo tú, con sesión |
| **Tus fuentes de trabajo** de los cursos | `.claude-academy/` en tu equipo, **ignorada por git** | solo tú |
| **Progreso del lector** y tema claro/oscuro | `localStorage` del navegador (`bm_cm_*`) | solo ese navegador |

Se abre en `#/claude` (enlace en la pestaña **Portfolio**, sección «Manuales privados»). No hay página pública ni entrada en el Mapa público.

## Archivos

```
area-privada-claude.js     módulo del área privada (window.APClaude): datos, rutas, ficha, catálogo, glosario, Ctrl K, progreso.
                           Se pinta en un Shadow DOM; todo HTML del contenido pasa por clean() (lista blanca); sin estilos en línea (CSP)
css/claude-manual.css      sistema de diseño de los manuales (:host hace de :root/body) + ampliaciones (ca-, vz-, mn-)
claude-manual/
├── config.js              MANUAL, SRCKINDS, VERSTATES, RELTYPES (qué es el manual y qué tipos admite)
├── grafo.js               lógica pura: grafo de relaciones, ruta de aprendizaje, posiciones del mapa
├── mapa.js                vista del mapa (SVG con zoom + lista equivalente) y miniatura de Inicio
└── viz.js                 visuales interactivos: los genéricos (escala, pestanas, precedencia, con los datos en vizData de la ficha)
                           y los de la ficha de prueba. Solo clases, sin atributos style
supabase/claude-manual.sql             tabla cm_docs + RLS (claude-manual-rollback.sql la revierte)
tools/claude-academy/{load,validate,publish}.mjs   cargar, validar y subir el contenido
tools/claude-academy/fixtures/guia/    ficha de prueba (solo para las comprobaciones; nunca se publica). Su content.js documenta el formato de una ficha
tools/check-claude-academy.mjs         contenido, cableado, mapa, publicador y privacidad (CI)
tools/check-claude-manual.mjs          interfaz con Supabase simulado, CSP real y axe (CI)
.claude-academy/           (local, ignorada por git) tu contenido de los cursos: content.js (opcional) y temas/*.js
```

## Puesta en marcha (una vez)

1. Supabase → SQL Editor → ejecutar `supabase/claude-manual.sql` (necesita `area-privada.sql` y `entrevistas.sql` ya ejecutados).
2. Publicar tu contenido: `CM_PASSWORD=<tu contraseña del área privada> node tools/claude-academy/publish.mjs` (antes, con `--dry-run`).
3. Abrir el área privada → Portfolio → «Manual de Claude».

## Incorporar un curso nuevo

1. **Identificar el recurso** y leerlo entero. Si no se puede acceder (autenticación, vídeo, enlace roto), no se inventa su contenido: se anota qué falta.
2. **Buscar lo que ya existe** (catálogo de Temas, `Ctrl K`, `grep` en `.claude-academy/temas/`). Un concepto = una ficha: si ya existe, se amplía y se añade la fuente;
   si dos fuentes difieren, se muestran las dos, no se borra una.
3. **Registrar el curso** en `.claude-academy/content.js`: `export const COURSES = [{id, t, u (https), k, d (fecha de consulta AAAA-MM-DD)}]`
   (y, si hace falta, `BLOCKS`, `GLOSS`, `LOG`: van en el mismo archivo; `.claude-academy/` es lo único que se publica).
4. **Escribir las fichas** en `.claude-academy/temas/<curso>.js` con `export default [ {…}, … ]`. El esquema está en la cabecera de `tools/claude-academy/fixtures/guia/content.js`. Cada ficha:
   - `src:[{t, u, k, c:"<id del curso>", d}]`: fuente junto al concepto que explica. `k = oficial` exige URL.
   - `ver:{e, d, n}`: `verificado` / `parcial` solo si se **contrastó** con la fuente (con fecha); si no, `pendiente`.
   - `rel:[{t, a, w}]`: relaciones con temas que existen; `w` explica por qué (obligatorio). `necesita` marca orden de estudio y no admite ciclos.
   - `kw`: palabras sencillas por las que se buscaría («conectar Claude con herramientas externas»), además del nombre técnico.
   - Explicación en dos niveles: capítulos 1-2 (idea y ejemplo) sin jerga; el resto, para aplicar. `lab` (ejercicio paso a paso) y `ejer` (con solución explicada) solo si el tema lo permite.
     Nada de resultados de ejecución que no se hayan ejecutado.
5. **Bloque**: si el tema no encaja en uno existente, añadirlo a `BLOCKS` (`n` consecutivo desde 0; sin bloques vacíos).
6. **Visual** por tema: `viz` + `vizData` en la ficha. `claude-manual/viz.js` es público, así que solo lleva visuales **genéricos** y los datos viajan con la ficha (en la base):
   `escala` (niveles con barras: `{max, dims[], niveles[{n,d,m[]}]}`), `pestanas` (`{pestanas[{n,t?,items[],fin?}]}`) y `precedencia` (capas con desplegables: `{vacio, capas[{t,d,v[]|fija}]}`).
   El validador comprueba la forma de `vizData`. Un visual nuevo y genérico se añade a `viz.js` y a `GENERIC` en `validate.mjs`; nunca uno con texto de un curso
   (`check-claude-academy` falla si `viz.js` o `config.js` mencionan el tema de un curso).
7. **Registrar el cambio** en `LOG` (`{d, r, curso, nuevo[], mod[], mapa, pend[]}`): cada tema nuevo debe aparecer en algún `nuevo`.
8. **Comprobar y publicar**:
   ```bash
   node tools/claude-academy/publish.mjs --dry-run        # valida (ids, relaciones, ciclos, fuentes, LOG) y cuenta
   node tools/check-claude-academy.mjs                    # + cableado, mapa sin solapes, publicador, privacidad
   CM_PASSWORD=… node tools/claude-academy/publish.mjs    # sube (upsert por id); --prune borra lo que ya no está en los archivos
   ```
   El manual cachea los datos 5 minutos: recargar la pestaña. Si se cambia el **motor** (no el contenido): `node tools/version-assets.mjs`, `node tools/mapa/build-mapa.mjs`
   y la comprobación `node tools/check-claude-manual.mjs`.

## Decisiones y desvíos respecto a la skill `manual-borja`

- `BLOCKS[].n` empieza en **0** (el primer bloque del manual). Sin bloques vacíos: la estructura prevista (Fundamentos, Claude Code, Skills, Agentes, MCP, …) es una hipótesis.
- Campos nuevos por ficha: `kw`, `tags`, `upd`, `ver`, `rel`, `lab`, `ejer`; `src` admite objetos. Búsqueda por todas las palabras (sin tildes ni mayúsculas).
- Mapa: a partir de 40 temas las ramas salen plegadas (`MAX_ALL` en `grafo.js`). Las relaciones se distinguen por **trazo** además de por texto; la lista equivalente es la vista por defecto en móvil.
- Seguridad: los ids se admiten solo en formato slug; todo HTML del contenido se sanea con lista blanca (sin `script`, `iframe`, `img`, manejadores ni `style`; solo enlaces `https:` o internos); los títulos se escapan.
  Si llegara HTML hostil, el navegador avisa en consola de lo que la CSP bloquea: es esperado.

## Lo que NO está verificado

- El contenido de los cursos se contrasta con la página del curso en la fecha que indica cada ficha; nada se ha probado todavía en una sesión real de Claude Code.
- Contra la base real: la prueba E2E usa un Supabase simulado; falta ejecutar el SQL y publicar en tu proyecto (pasos de arriba).
- Zoom con dos dedos en un táctil real, Safari y Firefox.
