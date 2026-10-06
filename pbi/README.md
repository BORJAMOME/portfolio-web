# Manual de Power BI

Se publica en **https://borjamora.es/pbi/** (GitHub Pages, desde `main`).

Manual visual e interactivo de Power BI construido a partir de mis apuntes de formación en Notion: el libro *Impacta con Power BI* (Salvador Ramos), el temario de la certificación PL-300 (NamasData), los cursos de DAX y las masterclasses de contextos, funciones Window, RLS, control de versiones y storytelling.

Sigue el mismo sistema de diseño que el [Manual de Machine Learning](../ml/) y la misma secuencia por ficha: entiéndelo, míralo en acción, úsalo en un proyecto, por dentro, ponte a prueba y nivel profesional.

## Contenido

| Vista | Qué hay |
|---|---|
| Inicio | Ruta de aprendizaje en 6 bloques con progreso guardado |
| Método BI7 | El ciclo de 7 pasos y qué temas estudiar en cada uno |
| Temas | 27 fichas con buscador y filtros por bloque y nivel (`#tema/<id>`) |
| Referencia DAX | 54 funciones con sintaxis, uso y enlace a su tema |
| PL-300 | Dominios del examen, 15 trampas frecuentes y simulacro de 10 preguntas |
| Glosario | 43 términos enlazados a su tema |

Ctrl + K (o `/`) abre el buscador global. El progreso y las respuestas se guardan en `localStorage` del navegador.

## Archivos

```
pbi/
├── index.html     estructura y barra superior
├── styles.css     sistema de diseño (tokens del portfolio, claro y oscuro)
├── content.js     bloques y temas de Fundamentos, Modelado y Power Query
├── content-2.js   temas de DAX, Visualización y Service; referencia DAX, glosario y PL-300
├── viz.js         un visual interactivo por tema (HTML y SVG, sin dependencias)
└── app.js         rutas, fichas, buscador, progreso y simulador
```

No hay paso de compilación: se edita directamente. Para añadir un tema, añade un objeto a `TOPICS` (los campos están documentados al principio de `content.js`) y, si lleva visual nuevo, una función `VIZ.<id>` en `viz.js`.
