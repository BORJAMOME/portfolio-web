# Estado del Manual de Claude

Última actualización: 29 de octubre de 2026 · Fase 1: primer tutorial incorporado (el detalle del contenido vive en `.claude-academy/ESTADO.md`, local) y Guía de prueba retirada del manual.

## Hecho y cómo se comprobó

| Qué | Cómo se comprobó |
|---|---|
| Manual dentro del área privada (`#/claude`), enlazado desde Portfolio → «Manuales privados»; contenido en Supabase (`cm_docs`, RLS), nada de cursos en el repo | `node tools/check-claude-manual.mjs`: 12 comprobaciones con Supabase simulado y **CSP real** (Portfolio, inicio, temas, ficha, mapa, glosario, `Ctrl K`, saneado de HTML hostil, visuales genéricos, tabla sin crear/vacía, móvil, oscuro y axe) |
| Primer tutorial de Claude Academy incorporado (fichas, términos, curso y relaciones: ver `.claude-academy/ESTADO.md`, local) | Leído entero en el navegador, incluidos los explorables. `publish.mjs --dry-run` sin errores ni avisos; la prueba «Contenido real» del E2E pinta cada ficha, con visual y axe, **solo si existe `.claude-academy/`** (en CI se omite) |
| Visuales genéricos (`escala`, `pestanas`, `precedencia`) con datos en `vizData` de cada ficha | E2E (escapado, interacción, sin estilos en línea, ficha sin `vizData`) + validador de forma en `validate.mjs`; `check-claude-academy` falla si el código público menciona el tema de un curso |
| Guía de prueba retirada del manual: ahora es fixture de pruebas (`tools/claude-academy/fixtures/guia/`), sin ningún tema real en el repo | `check-claude-academy` (no existe `claude-manual/seed/`); la base se limpia al publicar (ver pendiente) |
| Bloque de código: un flag `--x` ya no se pinta como comentario SQL y el `<code>` interior no hereda el fondo de las etiquetas en línea (contraste 6,17:1) | E2E con mutaciones (quitando cada arreglo, el test falla) |
| Publicador, privacidad, mapa a escala | `check-claude-academy` (fetch simulado, sin `service_role`, `.claude-academy/` ignorada y sin archivos rastreados, mapa sintético de 139 temas sin solapes) |

## Decisiones que hay que mantener

- El contenido de los cursos **no se versiona** ni va a la web pública. El texto de un visual vive en `vizData` (base de datos); `viz.js` solo lleva código genérico.
- Un concepto = una ficha; ids estables; relaciones con `w` y sin ciclos en `necesita`.
- `ver.e = verificado | parcial` solo con contraste real y fecha. Nada de ejemplos de ejecución sin ejecutar; los ejemplos propios llevan «ejemplo mío, no del tutorial».
- Sin bloques vacíos: la estructura prevista es una hipótesis. `BLOCKS[].n` consecutivo desde 0 dentro del manual real.
- Sin estilos en línea ni HTML sin sanear (CSP del área privada).
- El contenido se publica con la sesión del usuario (`CM_PASSWORD`), nunca con la `service_role`. Desde Claude Code también se puede subir con el MCP de Supabase (`execute_sql`) generando el SQL desde `toRows`.

## Siguiente tarea

1. **Siguiente tema de Claude Academy** (enlace o texto). Criterio de validación: `publish.mjs --dry-run` y `check-claude-academy` en verde; cada tema con `src` (curso, URL, fecha) y `ver` honesto; mapa con relaciones justificadas; si el concepto ya existe, se amplía su ficha.
2. Cuando haya más de un tema por bloque, revisar la estructura de bloques (hoy solo «Coste y uso»).

## Pendiente y no verificado

- Lo pendiente de cada curso (qué no se consultó, qué no se probó) está en su entrada `pend` del `LOG` y en `.claude-academy/ESTADO.md` (local).
- Nada de lo que describen los cursos se ha probado todavía en una sesión real de Claude Code.
- Abierto con una sesión real en el navegador (login) todavía no. Zoom con dos dedos en táctil real, Safari y Firefox.
- Mejoras posibles: sincronizar el progreso del lector entre dispositivos (hoy `localStorage`).

## Prompt para continuar

> Retoma el Manual de Claude: lee `claude-manual/ESTADO.md` y `claude-manual/README.md`, comprueba que `node tools/check-claude-academy.mjs` sigue en verde y espera mi siguiente enlace de Claude Academy para incorporarlo siguiendo el procedimiento (el contenido va en `.claude-academy/`, nunca en el repo; si el concepto ya tiene ficha, se amplía).
