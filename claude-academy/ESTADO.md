# Estado del Manual de Claude

Última actualización: 29 de octubre de 2026 · Fase 0 cerrada (estructura y motor, sin cursos).

## Hecho y cómo se comprobó

| Qué | Cómo se comprobó |
|---|---|
| Motor del manual (inicio, temas, mapa mental, glosario, ficha de 6 capítulos, buscador `Ctrl K`, progreso, quiz) | En el navegador, escritorio (1440) y móvil (375): sin errores de consola, sin scroll horizontal en las seis vistas, teclado en el mapa (Intro selecciona, Intro otra vez abre la ficha) |
| Bloque 0 «Guía del manual»: 5 fichas con 5 visuales, 5 relaciones, 10 términos | `node tools/check-claude-academy.mjs` (esquema, relaciones, ciclos, fuentes, LOG, solapes) y lectura de las afirmaciones de cada ficha contra la interfaz (búsquedas, rutas, porcentajes) |
| Mapa con muchos nodos | Manual sintético temporal de 144 temas, 9 bloques y 3 cursos (ramas plegadas, despliegue, cursos, zoom, filtro por curso). Ya borrado. Test de solapes permanente en el script (139 temas) |
| Accesibilidad | `node tools/check-a11y.mjs` sobre las 6 vistas (axe, WCAG 2.2 AA, tema claro): 0 infracciones |
| Integración | `version-assets --check`, `check-links`, `build-mapa --check` y el nuevo paso de CI `check-claude-academy` |

## Decisiones que hay que mantener

- Un concepto = una ficha; ids estables; relaciones con `w` (por qué) y sin ciclos en `necesita`.
- `ver.e = verificado | parcial` solo con contraste real y fecha. Nada de ejemplos de ejecución sin ejecutar.
- Sin bloques vacíos: la estructura prevista (Fundamentos, Claude Code, Skills, Agentes, MCP, …) es una hipótesis.
- Mapa derivado de los datos; nunca se dibuja ni se mantiene aparte.
- `styles.css` es el sistema de diseño de Power BI sin tocar; lo nuevo, al final y con tokens.

## Siguiente tarea

**Incorporar el primer curso de Claude Academy** (necesito el enlace o el texto/capturas).
Criterio de validación: `check-claude-academy` en verde; cada tema con `src` (curso, URL, fecha) y `ver` honesto; el curso en `COURSES` y en `LOG`;
el mapa muestra los temas nuevos conectados a la Guía o entre sí con relaciones justificadas; axe sin infracciones; el resumen indica qué no se pudo consultar.
Procedimiento: `README.md`.

## Pendiente y no verificado

- **No está publicado**: nada commiteado ni subido. Lleva `noindex` y no se enlaza desde el sitio (como `pbi/`); hay que decidir cuándo enseñarlo.
- Cero contenido de cursos. Las fichas actuales describen el propio manual.
- Sin probar: zoom con dos dedos en un táctil real, tema oscuro con axe, Safari y Firefox.
- Posible mejora, no hecha: exportar o sincronizar el progreso del lector entre dispositivos (hoy vive en `localStorage`).

## Prompt para continuar

> Retoma el Manual de Claude: lee `claude-academy/ESTADO.md` y `claude-academy/README.md`, comprueba que `node tools/check-claude-academy.mjs` sigue en verde y espera mi primer enlace de Claude Academy para incorporarlo siguiendo el procedimiento.
