# Second Brain

Pestaña privada del área personal (`area-privada.html#/second-brain`) que muestra, en 3D, qué conocimiento
profesional se puede **respaldar con evidencias**, qué está **mencionado o pendiente de validar** y qué conviene
**desarrollar a continuación**.

> **La IA analiza; el grafo representa; tú exploras y decides.** El motor corre en tu equipo; la web solo dibuja
> un resultado ya calculado. Seleccionar un nodo, mover la cámara o filtrar no analiza nada ni llama a ningún modelo.

## Cómo encaja

```
 TU EQUIPO                                              SUPABASE (RLS)               NAVEGADOR (área privada)
 carpetas autorizadas ─► scan ─► extract ─► lexicon ─►  sb_snapshots  ─ api() ─►  area-privada-second-brain.js
   (.second-brain/config.json)   model ─► layout ─► validar contrato  sb_runs        └─► second-brain/viewer.js (Three.js)
        tools/second-brain/analyze.mjs  ──publish.mjs──►  (con TU sesión)            validan el snapshot (contract.js)
```

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| Ingesta | `scan.mjs` | Recorre solo las carpetas declaradas; sin enlaces simbólicos; caché incremental (tamaño+fecha, luego hash). |
| Extracción | `extract.mjs`, `zip.mjs` | Lee formatos como **datos** (nada se ejecuta). Segmenta en práctica / documentación / declarada. |
| Detección | `lexicon.mjs` + `framework.json` | Términos, patrones de código por lenguaje y artefactos. Determinista, sin red. |
| Modelo | `model.mjs` | Evidencia, estados, competencias, prioridad, recomendaciones, relaciones. |
| Distribución | `layout.mjs` | Posiciones 3D deterministas (la web no calcula nada de esto). |
| Contrato | `../../second-brain/contract.js` | Validación compartida: el motor valida antes de guardar y la web antes de dibujar. |
| Persistencia | `../../supabase/second-brain.sql`, `publish.mjs` | `sb_snapshots` y `sb_runs` con RLS; el motor escribe con tu sesión (sin `service_role`). |
| API privada | PostgREST + RLS | No hay servidor propio: solo un miembro autenticado lee o escribe. |
| Visor | `../../second-brain/viewer.js`, `../../area-privada-second-brain.js`, `../../css/second-brain.css` | Escena Three.js, filtros, búsqueda, panel contextual. |

## Puesta en marcha

1. **Base de datos** (una vez): ejecuta `supabase/second-brain.sql` en Supabase → SQL Editor. Requiere `area-privada.sql` previo.
2. **Configuración**: copia `tools/second-brain/config.example.json` a `.second-brain/config.json` (está en `.gitignore`) y declara tus carpetas.
   Cada fuente tiene un `kind`:
   - `proyectos`: código y documentación propios (puede demostrar práctica);
   - `manual`: apuntes de estudio (cuentan como documentación, nunca como práctica ni como respaldo de un proyecto);
   - `declarativo`: CV o listas de habilidades (lo que se afirma, no lo que se demuestra).
3. **Analizar**: `node tools/second-brain/analyze.mjs` → escribe `.second-brain/last-valid-snapshot.json`. Opciones: `--full` (ignora la caché), `--dry`.
4. **Publicar**: define `SB_PASSWORD` (la contraseña del área privada) **solo en el entorno** y ejecuta `node tools/second-brain/analyze.mjs --publish`.
   Sin base de datos todavía, prueba la interfaz con `#/second-brain/demo` (datos ficticios, rotulados como tales).
5. **Actualizar**: vuelve a ejecutar el paso 4 cuando cambien tus fuentes. Solo se reprocesan los archivos modificados; las relaciones y recomendaciones se recalculan siempre (es barato).
   Si cambia `framework.json` o el motor, la caché se descarta (actualización completa).

## Fuentes y formatos

| Formato | Qué se extrae | Límites |
|---|---|---|
| `.py`, `.sql`, `.dax`, `.tmdl`, `.pq`/`.m`, `.yml` | Código (práctica) | Patrones por lenguaje; no se analiza el flujo. |
| `.md`, `.txt`, `.html`, `.docx` | Prosa (documentación) y bloques de código con lenguaje (práctica) | `.docx` por su XML; sin tablas ni imágenes. |
| `.ipynb` | Celdas de código (práctica) y Markdown (documentación) | Las salidas no se leen. No se ejecuta nada. |
| `.pbix` | Existencia, páginas y referencias a medidas del informe | **El modelo (DAX/Power Query) no es legible**: compresión XPress9. |
| `.xlsx`, `.csv` | Solo presencia (`xlsx` cuenta como mención, no como práctica) | Los datos no se interpretan. |
| `.git`, `.gitignore`, `README`, workflows | Señales de práctica de Git, documentación y automatización | — |
| `.pdf`, `.pptx`, `.xls` | **No soportados en esta versión** (se cuentan en la cobertura) | Haría falta una dependencia o `pdftotext`. |

No hay conectores a GitHub, LinkedIn ni ofertas de empleo: solo carpetas locales. No se analiza ningún repositorio remoto.

**Proyectos de una fuente.** `projectDepth: N` toma como proyecto la carpeta de nivel N; `projectDepth: "auto"` toma la carpeta con
`README.md` más cercana por encima de cada archivo (útil en repositorios con muchos casos, como `DAP` o `DAX-LAB/Proyectos`).

**Taxonomía jerárquica (v7).** Área → disciplina → subdisciplina → técnica → proyecto. Sale de cómo organizas tus carpetas y de lo que el código confirma:
cada concepto de `framework.json` puede tener un `padre` y unas `rutas` (los nombres de carpeta con los que lo organizas). La carpeta declara el tema y solo cuenta como documentación;
el código lo confirma o no. Si una carpeta `random-forest/` no tiene `RandomForest*` en su código, el proyecto lo muestra como «la carpeta lo declara, el código no lo confirma».
La estructura completa está en [TAXONOMIA.md](TAXONOMIA.md) (se genera con `node tools/second-brain/analyze.mjs --doc` y un test comprueba que está al día).

**Un proyecto, una entidad (`identity.mjs`).** La carpeta del portfolio, el repositorio de su app y la página publicada son el mismo proyecto si sus README se enlazan de forma
explícita (o el catálogo declara el repositorio). No se une por parecido de nombre; un README que enlaza a varios proyectos es un índice y no identifica a ninguno; los títulos repetidos
sin vínculo se avisan como «posible duplicado». Cada proyecto guarda todas sus fuentes (enlaces https al repositorio, la carpeta, la página, el informe). El repositorio de una fuente
se toma de su `.git/config` (solo el nombre) o de `repo: "owner/nombre"` en la configuración.
Una carpeta con README que es índice de otras carpetas con README no se queda con el código de una subcarpeta sin README: esa subcarpeta es un proyecto sin documentar.

**Etapas de conocimiento.** Identificado → estudiado o documentado → aplicado → reforzado (≥ 2 proyectos) → evaluado → dominio. Las cuatro primeras salen de la clase de evidencia;
«evaluado» y «dominio» solo existen si las registras tú (`assessments` con `estado: "evaluado" | "dominio"`, `motivo` y `origen`, o «Lo domino» en la ficha). No es una nota de dominio.
Cada rama indica cuántas de sus técnicas tienen práctica, cuántas solo documentación y cuántas ninguna evidencia (cobertura, no dominio).

**Inventario.** Cada análisis escribe en `.second-brain/inventario.json` (local, no se versiona): fuentes inspeccionadas con su repositorio y sus archivos, proyectos con sus fuentes, lo unificado,
los índices ignorados, los posibles duplicados, lo que falta por revisar y las fuentes que no se han podido mirar (`inaccesibles` en la configuración: repositorios sin clon local).
`.second-brain/taxonomia-real.md` es el árbol con tus datos: etapa, proyectos y ejemplos por técnica.

**Catálogo publicado** (`kind: "catalogo"`, con la ruta de `portfolio-web`). Muchos proyectos de Power BI no tienen repositorio: existen como informe
publicado o `.pbix` descargable. `catalog.mjs` los lee, sin ejecutar nada, de tres sitios: los casos de estudio (JSON-LD `CreativeWork` con
genre «Caso de estudio»), el laboratorio (`ITEMS` de `descargas.html`) y el inventario `supabase/portfolio.sql` (gráficos de Power BI,
visualizaciones y manuales publicados; las ideas y lo archivado no cuentan). Cada entrada es un proyecto con su enlace (solo https) y su grupo.
Las tecnologías que el propio portfolio declara para un artefacto **publicado** cuentan como práctica, porque el artefacto existe y es público;
el título y la descripción cuentan como documentación. Se quitan duplicados por título (y por página entre casos de estudio).

## Cómo se decide (reglas explicables)

- **Evidencia = archivos distintos**, nunca líneas ni menciones. El volumen no indica dominio.
- Un **término** dentro de código es una mención; solo un **patrón de código** o un **artefacto** cuentan como práctica.
- Estados de un concepto:
  - `respaldado`: práctica detectable (o, en conceptos explicativos, ≥ 2 documentos dentro de proyectos). *No equivale a dominio.*
  - `mencionado`: solo documentación, apuntes de estudio o fuentes declarativas.
  - `pendiente`: sin evidencia y sin haber analizado las fuentes donde estaría.
  - `brecha_probable`: núcleo de una competencia con relevancia ≥ 2 para el nivel objetivo, sin evidencia, y **sí** se han analizado las fuentes
    adecuadas (con ≥ 5 archivos con práctica). Siempre lleva su motivo y la salvedad de que puede existir fuera de las fuentes.
  - `brecha_confirmada`: **solo** si la registras en `assessments` con `motivo` y `origen`. El motor nunca la deduce y el contrato rechaza una sin evaluación.
  - `oportunidad`: acción posible; no implica carencia.
- **Relaciones**: salen de `relaciones` en `framework.json` (cada una con su fundamento) y de «proyecto → concepto» con práctica detectada.
  La coocurrencia solo añade un dato de apoyo («aparecen juntos en N proyectos»), nunca crea una relación. Tope de 6 por proyecto.
- **Prioridad** = relevancia (0-3 para el nivel objetivo) × distancia al objetivo (respaldado 0,1 · ampliable 0,25, núcleo completo pero con facetas opcionales sin práctica · parcial 0,4 · documentado 0,6 · declarado 0,7 · pendiente 0,5 · brecha probable 0,9 · confirmada 1,0).
  Se ordena por prioridad × peso de confianza (alta 1 · media 0,8 · baja 0,6). *Ahora* = hasta 3 con prioridad ≥ 1,0; *Después* ≥ 0,5; *Todavía no* = el resto o relevancia < 2.
  El esfuerzo (bajo/medio/alto) es una estimación genérica del marco, no una medida.
- **Marco**: `framework.json` (niveles Junior / consolidado / Mid, competencias, conceptos, relaciones). Es un marco general editable,
  **no un estudio de mercado**: no se consultan ofertas ni se calculan porcentajes de demanda. Cambiarlo no requiere tocar el motor ni el visor.

## Visor

**Familias de color (v6).** Cada concepto y competencia declara su `familia` en `framework.json`; un proyecto toma como principal la familia
con más práctica (mismo voto que el área, con peso reducido para lo genérico como Python o Git) y guarda hasta cuatro `families` para mostrarlas como etiquetas sin duplicarlo.
Lo que no encaja se queda como «Sin clasificar» en gris, y los objetivos van en navy. Cada familia lleva un color de relleno y una *tinta* más oscura
que se usa en bordes, líneas y texto cuando el relleno es claro (el amarillo de Power BI, ratio 1,6:1 con el blanco); las tintas superan 4,5:1 y el glifo sobre el relleno 3:1
(un test lo comprueba). El verde de Python se ha oscurecido de #39A96B a #36A265 por esa regla. Un snapshot antiguo sin familias se sigue dibujando por áreas.
Desde la leyenda, un clic aísla una familia (otro clic la quita). Los shaders propios escriben el color sin conversión a sRGB, por lo que el visor guarda estos colores «crudos»
(si no, el mapa sale más oscuro que la leyenda).

**Geometría y calidad visual (v8).** Se midió en el navegador con el análisis real antes de tocar nada (`viewer.debugMetrics()`): 33 de 47 etiquetas tapaban algún nodo,
29 nodos quedaban bajo la barra o la leyenda, los logotipos pesaban el doble que los iconos de trazo y varios iconos estaban descentrados hasta un 6 % de su celda. Las causas y su arreglo:
- **Atlas de glifos normalizado** (`icons.js`): cada glifo se recorta a su caja real, se centra por esa caja y se escala al mismo lado óptico (60 % de la celda en iconos, 56 % en logotipos, que son rellenos y pesan más);
  los iconos de trazo mantienen el mismo grosor en píxeles. El shader dibuja el glifo al ~55 % del diámetro del nodo y lo omite cuando el nodo mide menos de ~6 px (queda una forma limpia en vez de una mancha).
- **Escala de tamaños única** (`SIZE` y `nodeRadius` en `viewer.js`): objetivo > competencia > concepto (crece con la raíz de sus proyectos) > proyecto.
- **Separación con los radios reales**: el reparto de conceptos por sector ya no es solo áureo; se relaja hasta que no se pisen, dentro de su cuña y su anillo, con la z comprimida (la perspectiva la acorta) y teniendo en cuenta
  dónde se ven las competencias elevadas. Los objetivos se apilan en el disco central, algo desplazados.
- **Etiquetas**: no tapan nodos ajenos ni otras etiquetas ni los controles superpuestos; se prueban ocho direcciones a tres distancias, los nombres largos se parten en hasta tres líneas, nada se sale del lienzo y las que no caben
  aparecen al acercar o al señalar (el tooltip y la lista siguen mostrando todo). Los nombres de área se desplazan a un hueco libre y, en pantallas anchas, se fuerzan si no hay ninguno.
- **Encuadre con zonas seguras**: la barra, las vistas rápidas y los filtros activos se miden (`setInsets`) y el mapa se encaja por debajo.
- **Leyenda**: cerrada por defecto, con la clave de color en una tira; se recuerda tu preferencia.
Pruebas de geometría en `e2e.mjs` (sección 4f): sin solapes de etiquetas, ninguna sobre un nodo, ningún nodo bajo los controles, jerarquía de tamaños y centrado/tamaño de los glifos del atlas.
Límites conocidos: la vista Lateral apila nodos por altura y se solapan por diseño; en el resumen hay menos etiquetas que antes (el resto aparece con zoom o al señalar); los iconos de las fichas HTML
(leyenda, detalle) no pasan por la normalización del atlas (desvío ≤ 1 px); las mediciones se hicieron con renderizado por software, no con una GPU real.

**Explorar (v7).** Bajo el mapa, «Qué conoces y dónde lo has aplicado» muestra el árbol (expandir, contraer, «Aislar» una rama con sus proyectos) y «Qué hay en cada área» la cobertura por área.
Las vistas rápidas (Python, Machine Learning, Power BI, IA y Big Data, SQL, pendiente de práctica, sin proyecto asociado, proyectos sin documentar…) se calculan con los datos y solo aparecen si tienen elementos.
Los filtros se combinan (familia, etapa, tipo de evidencia, estado, tipo, área, prioridad, rama), se ven como etiquetas con su aspa y pueden ocultar o solo atenuar lo que no coincide.
La ficha muestra la ruta en la jerarquía, la etapa con su escalera, la cobertura de la rama, los proyectos que lo aplican (o las técnicas que aplica un proyecto), las fuentes y las discrepancias.

**Lenguaje visual (v5).** Cada elemento se lee por cinco canales que no se pisan:

| Canal | Significa |
|---|---|
| Color | **Familia tecnológica** del elemento (Power BI, SQL, Python, ML e IA, Data Storytelling, UX/UI, Ingeniería, Negocio). Definida en `framework.json → familias[]` y la misma en el mapa, las fichas, la leyenda, los filtros, los resultados y la lista. El suelo pinta cada sector con el color de la familia principal de su área |
| Icono | Qué es: Power BI, SQL, Python, proyecto, competencia… (`second-brain/icons.js`, iconos de trazo propios, sin logotipos de marca) |
| Relleno | Evidencia: sólido = respaldado · claro = mencionado · contorno discontinuo = por validar |
| Anillo | Rojo = brecha · ámbar = prioridad ahora · tinta = seleccionado |
| Forma | Círculo = conocimiento · hexágono = competencia · ficha blanca con glifo de su tipo (informe, notebook, app, SQL, manual, web, gráfico) = proyecto · rombo navy = objetivo · ámbar = recomendación |
| Tamaño | Objetivo > competencia > concepto (crece con la raíz de su número de proyectos) > proyecto |

Las relaciones son **cintas** con anchura en píxeles (no líneas de 1 px): se estrechan del origen al destino y ganan opacidad hacia él, así que
se lee la dirección sin flechas; empiezan y terminan fuera de los nodos y el arco es bajo (más bajo dentro de una misma área).
Familias: continua navy (dependencia técnica), continua verde (mejora o habilita), la más gruesa y del color del área (proyecto que lo demuestra),
fina y gris (pertenece a / requerido por) y **la única discontinua**, ámbar (recomendación: aún no existe). La anchura depende de la confianza;
si el destino es una brecha, el último tramo es rojo. Al seleccionar, las cintas se trazan del origen al destino (260 ms, escalonadas; sin animación
con «reducir movimiento»). Un nodo con muchas relaciones (Power BI con 40+ proyectos) adelgaza y aclara su abanico.
Hover: ligero aumento y anillo fino; selección: anillo tinta con hueco blanco. Lo que no está en foco se desatura, pierde el icono y la sombra.
La búsqueda ilumina en el mapa todas las coincidencias y las cuenta; la lista de abajo se agrupa por familia, área o tipo en grupos plegables con contador y buscador propio.
Etiquetas por niveles: competencias y objetivos siempre; conceptos solo si su ficha es legible en pantalla; proyectos al acercarse, al pasar
por encima o como vecinos de la selección. Se colocan a la derecha, debajo o a la izquierda del nodo, la primera que no choque.
Los tallos al suelo solo se dibujan en la vista lateral o para el nodo seleccionado.
El suelo pinta cada área con su gama, más intensa en el anillo de lo respaldado. Al pasar el ratón aparece un tooltip con área, evidencia y descripción.
Todos los nodos se dibujan en **una sola llamada** con un shader instanciado y un atlas de iconos; la selección se resuelve en espacio de pantalla.

**Logotipos.** Las tecnologías con marca (Power BI, Python, SQL Server, pandas, NumPy, Jupyter, GitHub, Excel, scikit-learn,
Streamlit, Figma, HTML5, TensorFlow, Hugging Face, Spark, Azure, GitHub Actions) muestran su logotipo a color sobre una ficha blanca con el borde del color del área
(`second-brain/logos.js`, generado con `tools/second-brain/build-logos.cjs` a partir de SVG Logos y Simple Icons, CC0, y vscode-icons, MIT).
Lo que no tiene marca (DAX, Data Storytelling, IBCS…) usa los iconos propios de `icons.js`. Las etiquetas del mapa son texto negro sin fondo.

**Tu información.** Desde el detalle de cualquier elemento («Añadir tu información» / «Editar») puedes guardar tu valoración (lo domino, lo estoy practicando,
quiero aprenderlo, lo reconozco como brecha), una descripción propia, notas, enlaces que lo demuestren y relaciones con otros elementos.
Con «+ Añadir» creas elementos que el análisis no ha detectado. Se guarda en `public.sb_notas` (`supabase/second-brain-notas.sql`, RLS de miembro),
nunca se mezcla con lo que calcula el motor y siempre se muestra como «añadido por ti». «Lo reconozco como brecha» es la única vía, junto a
`assessments` en la configuración, por la que algo pasa a «brecha confirmada».

**Preguntas.** Bajo el mapa, «Pregunta a tu Second Brain» responde, calculando sobre el snapshot (sin IA ni red): qué está mejor demostrado,
qué falta para el objetivo, qué separa de Mid-Level, qué hacer ahora, qué solo está mencionado, dónde hay brechas, qué proyectos demuestran más
y qué conceptos conectan más áreas. También acepta un tema libre («DAX», «retail»…). Cada respuesta resalta sus elementos en el mapa.


Dos distribuciones del mismo snapshot, con transición animada entre ellas:

- **Mapa** (por defecto). La posición tiene significado y se lee sin leyenda: **sector** = área de conocimiento;
  **del centro al borde** = respaldado → mencionado → por validar (el grosor de cada anillo es proporcional a cuántos elementos tiene);
  **altura** = competencias por encima del plano, pines ámbar sobre lo que recomiendan y objetivos en el eje central;
  **cinturón exterior** (hasta tres anillos) = proyectos, junto al área que demuestran. Se calcula en el visor a partir de región, estado y tipo (representación, no análisis).
- **Red**: las posiciones de fuerzas que calcula el motor (`layout.mjs`), para seguir conexiones.

Puntos de vista: Perspectiva, Cenital (arrastrar desplaza, como un mapa; es la vista inicial en móvil) y Lateral (muestra las capas).
Las relaciones solo se dibujan para el elemento señalado (al pasar por encima o seleccionarlo), con arcos; el resto se atenúa.
Paleta del área privada sobre fondo blanco: navy (respaldado), acero (mencionado), gris claro (por validar), ámbar (recomendaciones),
anillo rojo (brecha, como las desviaciones negativas de IBCS) y verde para las relaciones de mejora.

Rotar, zoom, desplazar (ratón, táctil y teclado), seleccionar, centrar, vista general, búsqueda, filtros por estado, tipo, región, prioridad y tipo de relación,
panel contextual (significado, evidencia, incertidumbres, relaciones con su fundamento, recomendación), pestañas Recomendaciones y Lista (alternativa accesible al 3D).
Colores: **azul** respaldado · **gris** pendiente/mencionado · **ámbar** recomendación u oportunidad; el resto se distingue por forma y anillo.
Rendimiento: dibujo bajo demanda (0 fotogramas en reposo), un `InstancedMesh` por forma (≤ 14 llamadas de dibujo), ≤ 24 etiquetas HTML sin solaparse,
resolución ≤ 2× y recursos liberados al salir de la sección o cerrar sesión. Three.js se carga solo al abrir la pestaña
(`vendor/three-0.186.1-sb.min.js`, paquete recortado: `node tools/second-brain/build-three.mjs`).

## Seguridad y privacidad

- Autenticación y permisos: los de la web (Supabase Auth + `public.is_member()`). RLS activada, sin acceso `anon`.
- El snapshot **no está en el repositorio público**: vive en Supabase. `second-brain/demo-snapshot.json` es ficticio.
- Nada sale de tu equipo salvo el snapshot a tu Supabase. No hay proveedores de IA. `.second-brain/` (configuración, caché, snapshots) está en `.gitignore`.
- Las fuentes son datos: no se ejecutan, no se importan y sus instrucciones no alteran el análisis (hay un test con un documento «malicioso»).
- `SB_PASSWORD` solo se lee del entorno; no se guarda ni se imprime.

## Pruebas

```bash
node --test tools/second-brain/second-brain.test.mjs        # motor, contrato, seguridad (sin dependencias)
npm i --no-save playwright axe-core && npx playwright install chromium
node tools/second-brain/e2e.mjs [carpeta-capturas]          # navegador real con Supabase simulado
```

Las pruebas E2E **simulan** Supabase: comprueban la integración en la web, los estados y el visor, **no** las políticas RLS reales
(eso requiere ejecutar `second-brain.sql` en tu proyecto y probar con una sesión y sin ella).

## Límites conocidos

- La detección es léxica y de patrones: no «entiende» el código. Puede infravalorar práctica que no se expresa con esos patrones y sobrevalorar menciones.
- No hay análisis con un modelo de lenguaje: se podría añadir como paso opcional (requiere clave, configuración explícita y decidir qué texto sale del equipo).
- PBIX: el DAX y las consultas de Power Query no se leen. PDF: no soportado.
- `brecha_probable` depende de qué carpetas declares: si falta una fuente relevante (p. ej. el sitio web o un manual), el resultado puede ser injusto.
- La caché solo evita releer archivos; el modelo se recalcula completo en cada ejecución.
