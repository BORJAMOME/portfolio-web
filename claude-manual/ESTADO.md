# Estado del Manual de Claude

Última actualización: 29 de octubre de 2026 · Fase 0 cerrada (motor privado y Guía, sin cursos).

## Hecho y cómo se comprobó

| Qué | Cómo se comprobó |
|---|---|
| Manual dentro del área privada (`#/claude`), enlazado desde Portfolio → «Manuales privados»; contenido en Supabase (`cm_docs`, RLS), nada de cursos en el repo | `node tools/check-claude-manual.mjs`: 10 comprobaciones con Supabase simulado y **CSP real** (Portfolio, inicio, temas, ficha, mapa, glosario, `Ctrl K`, saneado de HTML hostil, tabla sin crear/vacía, móvil, oscuro y axe en claro y oscuro) |
| Guía del manual (5 fichas, 5 visuales, 5 relaciones, 10 términos) | `check-claude-academy` (esquema, relaciones, ciclos, fuentes, LOG) y lectura de las afirmaciones contra la interfaz |
| Publicador (`tools/claude-academy/publish.mjs`) | `check-claude-academy` con un `fetch` simulado: sesión del usuario, upsert por lotes, poda solo con `--prune`, sin `service_role` |
| Privacidad | `.claude-academy/` ignorada y sin archivos rastreados; no existe carpeta pública `claude-academy/` (también lo comprueba el script) |
| Mapa a escala | Manual sintético de 144 temas (ramas plegadas, cursos, zoom, filtro por curso) y test permanente de solapes con 139 |

## Decisiones que hay que mantener

- El contenido de los cursos **no se versiona** ni va a la web pública. Un visual específico de un curso revelaría contenido: de momento solo visuales genéricos en `viz.js`.
- Un concepto = una ficha; ids estables; relaciones con `w` y sin ciclos en `necesita`.
- `ver.e = verificado | parcial` solo con contraste real y fecha. Nada de ejemplos de ejecución sin ejecutar.
- Sin bloques vacíos: la estructura prevista es una hipótesis.
- Sin estilos en línea ni HTML sin sanear (CSP del área privada).

## Siguiente tarea

1. **Puesta en marcha en tu Supabase** (pendiente, requiere tu OK): ejecutar `supabase/claude-manual.sql` y publicar la semilla; abrir el manual en el área privada.
2. **Incorporar el primer curso de Claude Academy** (necesito el enlace o el texto/capturas).
   Criterio de validación: `publish.mjs --dry-run` y `check-claude-academy` en verde; cada tema con `src` (curso, URL, fecha) y `ver` honesto; curso en `COURSES` y en `LOG`;
   el mapa muestra los temas nuevos conectados con relaciones justificadas; el resumen dice qué no se pudo consultar.

## Pendiente y no verificado

- Contra la base real (solo simulada). Zoom con dos dedos en táctil real, Safari y Firefox.
- Mejora posible: visuales declarativos definidos en el dato (para diagramas propios de cada curso sin publicar código).
- Mejora posible: sincronizar el progreso del lector entre dispositivos (hoy `localStorage`).

## Prompt para continuar

> Retoma el Manual de Claude: lee `claude-manual/ESTADO.md` y `claude-manual/README.md`, comprueba que `node tools/check-claude-academy.mjs` sigue en verde y espera mi primer enlace de Claude Academy para incorporarlo siguiendo el procedimiento (el contenido va en `.claude-academy/`, nunca en el repo).
