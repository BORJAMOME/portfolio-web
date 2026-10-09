# Manual de Power BI

Se publica en **https://borjamora.es/pbi/** (GitHub Pages, desde `main`).

Manual visual e interactivo de Power BI construido a partir de **todos** mis apuntes de formación en Notion: los libros *Impacta con Power BI* y *A cuánto asciende tu factura…* (Salvador Ramos) y *Modelado de datos en Power BI* (Javier Sánchez Rivero), el temario y los exámenes de la certificación PL-300 (NamasData, ExamTopics, Microsoft Learn), los cursos de DAX (Ana María Bisbé, Javier Sánchez Rivero), lenguaje M y Power Query, modelado, informes financieros, Python y Microsoft Fabric, las masterclasses de visualización (Claudio Trombini, Paula García, Power UI), herramientas (DAX Studio, Bravo, grupos de cálculo con C#), gestión de proyectos, el Manual DataViz y mis proyectos publicados.

Sigue el mismo sistema de diseño que el [Manual de Machine Learning](../ml/) y la misma secuencia por ficha: entiéndelo, míralo en acción, úsalo en un proyecto, por dentro, ponte a prueba, nivel profesional y **apuntes completos** (todo lo que guardé sobre ese tema, agrupado por fuente, con sus preguntas de examen).

## Contenido

| Vista | Qué hay |
|---|---|
| Inicio | Ruta de aprendizaje en 7 bloques con progreso guardado |
| Método BI7 | El ciclo de 7 pasos y qué temas estudiar en cada uno |
| Temas | 37 fichas con buscador (también busca dentro de los apuntes) y filtros por bloque y nivel (`#tema/<id>`) |
| Referencia DAX | 54 funciones con sintaxis, uso y enlace a su tema |
| PL-300 | Dominios, trampas frecuentes, simulacro, banco de unas 200 preguntas filtrable y apuntes del curso |
| Proyectos | 8 dashboards propios: contexto, problema, modelo, decisiones y aprendizajes |
| Recursos | Enlaces de diseño, perfiles, libros, documentación, datasets, chuletas y tabla de fuentes |
| Glosario | 43 términos enlazados a su tema |

Ctrl + K (o `/`) abre el buscador global: temas, funciones, glosario, apuntes, preguntas, proyectos y recursos. El progreso y las respuestas se guardan en `localStorage` del navegador.

## Archivos

```
pbi/
├── index.html     estructura, barra superior y orden de carga de los scripts
├── styles.css     sistema de diseño (tokens del portfolio, claro y oscuro)
├── content.js     bloques y temas de Fundamentos, Modelado y Power Query
├── content-2.js   temas de DAX, Visualización y Service; referencia DAX, glosario y PL-300
├── viz.js         un visual interactivo por tema (HTML y SVG, sin dependencias)
├── content-3.js   bloque de ampliación y 10 temas nuevos (perfilado, M, funciones de tabla,
│                  consultas DAX, gráficos avanzados, financiero, herramientas, Python,
│                  Fabric, gestión de proyectos) con sus visuales
├── apuntes/       volcado de Notion, un archivo por fuente
│   └── *.js       NOTES (apuntes por tema), EXAM (preguntas), PROJ (proyectos), RES (recursos)
└── app.js         rutas, fichas, banco de preguntas, proyectos, recursos, buscador y progreso
```

No hay paso de compilación: se edita directamente.

- **Tema nuevo**: añade un objeto a `TOPICS` (campos documentados al principio de `content.js`) y, si lleva visual nuevo, una función `VIZ.<id>`.
- **Apunte nuevo**: en el archivo de su fuente dentro de `apuntes/`, `NOTES.push({t:"<id del tema>", s:"<fuente>", h:"<html>"})`. Con `t:"pl300"` aparece en la vista PL-300.
- **Pregunta nueva**: `EXAM.push({k:"<categoría>", t:"<id del tema>", s:"<fuente>", q:"…", a:"…"})`.
- **Archivo de apuntes nuevo**: añade su `<script>` en `index.html` antes de `app.js`.

Los apuntes que en Notion eran solo capturas de pantalla se resumen por su texto; las imágenes no se incluyen.
