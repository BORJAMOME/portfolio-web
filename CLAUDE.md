# CLAUDE.md: portfolio-web (borjamora.es)

Sitio estático (HTML/CSS/JS sin framework ni build) publicado con GitHub Pages desde `main`.
Contexto de producto y marca: `PRODUCT.md` (solo local). Mapa de archivos y comandos: `README.md`.

## Reglas
- Español de España en todo el contenido. Rol: «Data Analyst Junior». Lema: «Analizo datos. Diseño cómo se leen.»
- Las páginas de `en/` **se generan** (`node tools/build-en.mjs`); nunca se editan a mano. Traducciones en `i18n/`.
- Tras cambiar un CSS/JS propio: `node tools/version-assets.mjs` (versiones `?v=`; también en los imports entre módulos de `color-studio/`, para que cada uno se descargue una sola vez).
- Sin dependencias nuevas salvo que no haya alternativa nativa razonable.
- Manuales con sistema propio: `ds/` (Data Storytelling), `ml/` (se genera en otro repo), `pbi/`.
- **Manual de Claude** (`#/claude`, desde Portfolio → «Manuales privados»; privado de verdad: repo y GitHub Pages son públicos, así que **el contenido no está en el repo**).
  Motor público: `area-privada-claude.js` (Shadow DOM, sin estilos en línea por la CSP, todo HTML del contenido pasa por `clean()`), `claude-manual/` (`config`, `grafo`, `mapa`, `viz` como módulos ES; visuales genéricos con los datos en `vizData` de cada ficha) y `css/claude-manual.css`.
  Contenido: tabla `cm_docs` con RLS (`supabase/claude-manual.sql`, revertir con `claude-manual-rollback.sql`); los cursos se escriben en `.claude-academy/` (carpeta local, **ignorada por git**, mismo formato que la ficha de prueba de `tools/claude-academy/fixtures/guia/`, que solo usan las comprobaciones) y se suben con `node tools/claude-academy/publish.mjs` (`--dry-run`, `--diff`, `--prune --yes`), que **ejecuta el usuario en su terminal** (pide la contraseña sin mostrarla): una sesión de Claude Code no escribe en `cm_docs`. La fuente de cada tema se guarda cruda en `.claude-academy/fuentes/<curso>/` (`tools/claude-academy/dossier.mjs`) y `riesgos.mjs` lista lo que hay que contrastar con ella. Procedimiento: `claude-manual/README.md` y la skill local `cargar-tema`.
  Un concepto = una ficha, ids estables, `rel` (con `w`) y `src` (con fecha) de cada ficha alimentan el mapa, «Dónde encaja» y los filtros; `ver` nunca `verificado` sin contrastar; cada tema nuevo en `LOG`. Procedimiento: `claude-manual/README.md`.
  Pruebas: `node tools/check-claude-academy.mjs` (contenido, cableado, mapa, publicador y privacidad) y `node tools/check-claude-manual.mjs` (interfaz con Supabase simulado, CSP real y axe).

## Comprobaciones (CI en cada PR)
```bash
node tools/build-en.mjs --check
node tools/check-links.mjs
node tools/version-assets.mjs --check
node tools/check-a11y.mjs        # requiere: npm i --no-save playwright axe-core && npx playwright install chromium
```
En Windows, `build-en --check` puede marcar páginas como desactualizadas por los finales de línea CRLF; en CI (Linux) no.

## Área privada (`area-privada.html`)
Zona con contraseña real (Supabase Auth + Row Level Security), enlazada desde Laboratorio. Sin librerías: habla con la API de Supabase con `fetch`.
- `area-privada.js`: shell (sesión, `api`, rutas `#/…`, diálogo) y el drive (`#/archivos`). `supabase/area-privada.sql`: tablas y RLS.
- **Pestañas en módulos** que se cargan al abrirlas: `area-privada-<nombre>.js` define `window.AP<Nombre> = { render(ctx) → Promise<paint> }`
  y se declara en el HTML como `<link rel="prefetch" data-ap-module="<nombre>">` (así `version-assets` le pone el `?v=`).
  Para una pestaña nueva: el archivo, ese `<link>`, una entrada en `MODULES` (de ahí sale también la ruta) y el enlace en `.ap-tabs`.
- **Navegación móvil** (< 900 px): las pestañas `.ap-tabs` (única fuente de las secciones) se sustituyen por una barra inferior con Hoy, Apps, Calendario, Entrevistas y «Más»;
  «Más» abre una hoja (`<dialog>` modal) con el resto de pestañas y «Cerrar sesión». Las dos se **generan** en `area-privada.js` (`buildNav`, `BAR_TABS`, `NAV_ICONS`) a partir de `.ap-tabs`:
  una pestaña nueva aparece sola en la hoja (y necesita su icono en `NAV_ICONS`); para subirla a la barra, añadirla a `BAR_TABS`. La barra no se muestra en modo app. En móvil la cabecera es una sola fila
  (reloj + «Volver al Laboratorio»). Todo lo fijo abajo (barra, `.apk-toast`, `.mp-detail`) cuenta con la altura de la barra. Pruebas: `node tools/check-color.mjs` (flujos «Móvil»).
- **Apps** (`#/apps`): catálogo de las herramientas personales. El registro `APPS` de `area-privada.js` es la única fuente de nombre, descripción, icono y ruta;
  `area-privada-apps.js` (`window.APApps`) solo lo pinta (CSS con prefijo `apl-` al final de `css/area-privada.css`, fondo #FBFBFB con `body:has(.apl)`).
  **Modo app**: una entrada con `module` vive en esta página (su módulo va en `MODULES` con `tab: 'apps'`) y al abrirla el shell pone `body.ap-in-app`:
  oculta cabecera, pestañas, acciones y pie del área privada (el `h1` queda solo para lectores de pantalla) y enseña `#ap-appbar` «← Volver al área privada».
  La vuelta usa el índice que el shell guarda en `history.state`: si se entró desde `#/apps`, retrocede hasta esa entrada (sin apilar historial); si no (URL directa, recarga), navega a `#/apps`.
  Una entrada sin `module` es una página propia con su layout (Caesar III → `roma-aeterna/`, PWA) y su propia vuelta, en el mismo sitio (arriba a la izquierda) hacia `../area-privada.html#/apps`.
  App nueva: una entrada en `APPS` (orden alfabético) y, si vive aquí, su módulo. Iconos cuadrados y a sangre (la máscara la pone el catálogo), con la misma construcción:
  fondo con degradado suave, anillo fino y un emblema central (`roma-aeterna/icons/icon-192.png`, `img/apps/color-studio.svg`).
  Pruebas: los flujos de Apps y del modo app están en `node tools/check-color.mjs`.
- **Portfolio** (`#/portfolio`): inventario de manuales, proyectos, gráficos, apps de Streamlit, repos y visualizaciones.
  Tabla `public.portfolio` (`supabase/portfolio.sql`, con carga inicial generada desde las páginas del sitio).
  Los tipos son el grupo `portfolio.tipo` de `ap_opciones`.
- Formularios de las pestañas: `ctx.ui` (field, input, select, area, formDialog, invalid) en `area-privada.js`; no los dupliques.
- **Configuración** (`#/configuracion`): listas de opciones en `public.ap_opciones` (`supabase/opciones.sql`), hoy temas y formatos del Fichero.
  Renombrar/eliminar van por RPC y actualizan también los enlaces. Lista nueva: entrada en `GROUPS` de `area-privada-configuracion.js`.
- **Hoy** (`#/`): arriba el **Centro de trabajo** (módulo `kanban`, ver abajo) y debajo «Agenda y seguimiento»: próximos 7 días,
  entrevistas programadas y procesos parados (solo lee).
- **Centro de trabajo** (en `#/`, sin ruta ni pestaña propias): `area-privada-kanban.js` (`window.APKanban`), lo monta `area-privada-hoy.js` con
  `ctx.module('kanban')`. Vistas Hoy / Tablero / Archivo. Tablas `kb_proyectos`, `kb_tarjetas`, `kb_subtareas`, `kb_historial`, `kb_ajustes`
  (`supabase/kanban.sql`; revertir con `kanban-rollback.sql`). El historial y `completada_en` los escribe un trigger. Orden por `posicion` (punto medio).
  Arrastre con Pointer Events propios (sin biblioteca: CSP sin CDN y regla de no añadir dependencias); teclado con Mayús+flechas; en táctil, desde el asa.
  Límites WIP y capacidad diaria en `kb_ajustes`; avisan, no bloquean. La lógica pura está en `APKanban.logic`.
  Pruebas: `node tools/test-kanban.mjs` (lógica, sin dependencias) y `node tools/check-kanban.mjs` (interfaz con Playwright y un Supabase simulado en memoria; no toca la base real).
  Color semántico por estado (`--st-<estado>` en `css/area-privada.css`), siempre con icono de progreso y texto. Iconos SVG propios en `ICON`.
  Captura inteligente local (`logic.parseCapture`: #proyecto, !prioridad, fechas en español, @hoy). Paleta `Ctrl/⌘+K`.
  IA opcional: Edge Function `supabase/functions/kanban-ia` (desglosar, siguiente paso, plan del día, texto → tarjetas). Solo propone:
  la web enseña una revisión y guarda lo confirmado. `KB_AI_PROVIDER=off` por defecto (los botones de IA no aparecen). Guía: su `README.md`.
- **Color Studio** (`#/color`, `/biblioteca`, `/armario`, `/calcetines`; app del catálogo, se abre en modo app): outfits con prendas reales, paletas de referencia y guía de calcetines.
  Interfaz `area-privada-color.js` (`window.APColor`, CSS `css/color-studio.css`, prefijo `cs-`; fondo #FBFBFB solo en esta pestaña con `body:has(.cs)`).
  Lógica en módulos ES sin DOM en `color-studio/` (`engine.js` color/ΔE00/proporciones, `compose.js` lectura del conjunto, direcciones Minimalista/Equilibrada/Creativa
  con criterios con nombre (`MOVES`) y paletas como inspiración, `socks.js` reglas de calcetines con tipo de calzado, `data.js` validación e importación, `image.js` fotos),
  cargados con `<link data-ap-asset="cs-*">`. Tablas `cs_garments`, `cs_palettes`, `cs_outfits` y bucket privado `armario` (`supabase/color-studio.sql`, revertir con `color-studio-rollback.sql`).
  Intro de bienvenida (bloque `INTRO`, estilos `csi-`): una vez por carga de página, coordinada con la carga real (máx. 6 s), sin animación con movimiento reducido.
  Proporciones = estimaciones editables; no inventar porcentajes de confianza ni contenido del libro de Sanzo Wada. Modo ejemplo en memoria, nunca se guarda.
  Las propuestas usan prendas reales (dos a la vez solo si con una no basta); si no hay, el color va marcado como hipotético. Aplicar guarda el conjunto de partida en el borrador para volver a él.
  «Qué prenda te falta» sale de las propuestas hipotéticas (`wardrobeGaps`). Cuentagotas en la foto (`engine.sampleColor`). Largo del calcetín por calzado (`sockFit`), leído de la subcategoría: sin columnas nuevas.
  **Inspiración** (`#/color/inspiracion`): outfits guardados de internet en `cs_inspirations` (`supabase/color-studio-inspiracion.sql`, RLS por dueño
  `owner = auth.uid()`; fotos en `armario/inspiracion/<usuario>/` con miniatura), lógica en `color-studio/inspiration.js`, paleta extraída con el mismo
  motor; `palette` (definitiva: cuentagotas «Seleccionar colores», mediana 5 × 5 sobre la imagen guardada, o sugerencias aceptadas) y `suggestions`
  (extracción sin el fondo, nunca mezclada con la paleta); estilos y colecciones = grupos `inspiracion.estilo`/`inspiracion.coleccion` de `ap_opciones`. «Leer enlace» usa la Edge Function
  `supabase/functions/inspiracion-meta` (opcional, anti-SSRF). «Usar en Studio» copia la paleta a la Biblioteca; nunca crea prendas.
  Pruebas: `node --test tools/test-color.mjs` y `node tools/check-color.mjs`. Guía y decisiones: `color-studio/README.md`.
- **Calendario** (`#/calendario`): solo lectura. Google → iCal secreto → Edge Function `supabase/functions/calendario-sync`
  (pg_cron cada 15 min) → `public.calendar_events`. La página nunca habla con Google. Guía: `supabase/functions/calendario-sync/README.md`.
- **Entrevistas** (`#/entrevistas`, `/analisis`, `/<uuid>`): tablas `procesos` y `entrevistas` (`supabase/entrevistas.sql`).
  El análisis se calcula en la página con las dos tablas ya descargadas.
- **Preparación** (`#/preparacion`, `/<uuid>`): módulo `area-privada-preparacion.js` sin pestaña propia (`tab: 'entrevistas'` en `MODULES`).
  Edge Function `supabase/functions/interview-intel` (pg_cron cada 10 min) detecta entrevistas en `calendar_events`, investiga
  y escribe briefings en `ii_interviews`/`ii_runs`/`ii_reports` (`supabase/interview-intel.sql`). La web solo lee y llama a `ii_action()`.
  Perfil profesional: nota «Perfil profesional · Interview Intelligence» (carga en `supabase/interview-intel-perfil.sql`, no versionado).
  Pruebas: `deno test --allow-read supabase/functions/` y `node tools/check-briefing.mjs`. Guía: `supabase/functions/interview-intel/README.md`.
- **Procesos desde Gmail** (en `#/entrevistas`, panel «Correos por revisar»): Apps Script en la cuenta de Google (`tools/gmail-procesos/`,
  solo lectura) → Edge Function `supabase/functions/procesos-sync` (reglas sin IA en `classify.ts`) → `public.procesos_correo`;
  `pc_aplicar()` crea o actualiza `procesos` (`supabase/procesos-correo.sql`). Nunca pisa lo escrito a mano ni reabre un proceso cerrado.
  Guía: `tools/gmail-procesos/README.md`.
- Pestaña **Fichero** (`#/fichero`): tabla de enlaces guardados, `area-privada-fichero.js`, tabla `public.links` (`supabase/fichero.sql`;
  carga inicial en `supabase/fichero-datos.sql`). Se añade, edita y borra desde la propia tabla; Supabase es la fuente de verdad.
- **Second Brain** (`#/second-brain`, `#/second-brain/demo`): grafo 3D del conocimiento. La web solo DIBUJA un snapshot ya calculado
  (`area-privada-second-brain.js`, `second-brain/viewer.js` con Three.js, `second-brain/contract.js` compartido con el motor, `css/second-brain.css`).
  El motor corre en local (`tools/second-brain/`, sin dependencias) y publica en `public.sb_snapshots`/`sb_runs` (`supabase/second-brain.sql`, RLS).
  Fuentes: carpetas locales (`projectDepth` N o `"auto"` = carpeta con README) y el catálogo publicado del propio portfolio (`kind: "catalogo"`, `catalog.mjs`:
  casos de estudio, `descargas.html` y `supabase/portfolio.sql`). Notas del usuario en `sb_notas` (`supabase/second-brain-notas.sql`).
  Three.js va recortado en `vendor/three-<versión>-sb.min.js` (`tools/second-brain/build-three.mjs`). Config y snapshots reales: `.second-brain/` (no versionado).
  Jerarquía: `padre` y `rutas` en `framework.json` → `second-brain/taxonomy.js` (lógica pura) y `tools/second-brain/TAXONOMIA.md` (se genera con `--doc`); un proyecto = una entidad (`identity.mjs`).
  Calidad visual del mapa: `SIZE`/`nodeRadius`, atlas normalizado (`icons.js`), separación y etiquetas (`viewer.js`); medir con `viewer.debugMetrics()` (E2E sección 4f).
  Color = familia tecnológica (`framework.json → familias`, campo `family` de cada nodo); las áreas son los sectores del suelo.
  Exploración (v9): núcleo `n:nucleo` y áreas `a:<región>` son nodos derivados; la vista por defecto es «Por áreas» y desplegar/contraer es solo visibilidad (`buildExplore` en `taxonomy.js`, posiciones fijas). Las aristas `conecta` entre áreas resumen relaciones reales (`evidenceCount`), no son relaciones nuevas.
  Pruebas: `node --test tools/second-brain/second-brain.test.mjs` y `node tools/second-brain/e2e.mjs`. Guía y reglas de evidencia: `tools/second-brain/README.md`.
  Cambiar `framework.json` o el motor → `node tools/second-brain/analyze.mjs --demo` (regenera el demo; hay un test que lo comprueba).
- **Mapa** (`#/mapa`): árbol de toda la estructura (páginas públicas, pestañas, tablas y funciones de Supabase, herramientas y CI) con flechas punteadas entre elementos.
  Solo dibuja `mapa/estructura.js`, que **se genera** leyendo el repositorio: `node tools/mapa/build-mapa.mjs` y después `node tools/version-assets.mjs` (CI falla con `--check` si queda desactualizado).
  Agrupaciones, etiquetas y textos a mano en `tools/mapa/mapa.config.json`; lo que no encaja sale en «sin clasificar/». Una pestaña, tabla, página o herramienta nueva aparece sola al regenerar.
  `--check` falla también si hay un enlace del contenido sin clasificar (resuélvelo en la config o añádelo a `web.revisados`), una clave de la config sin página, o area-privada.html / MODULES cambian de formato. Solo ve lo que git conoce (rastreado o añadido): un archivo suelto no cambia el mapa.
  Relaciones = lo que cada archivo menciona (tablas por `/rest/v1/…`, `ctx.module(…)`, enlaces, `tools/…` en los workflows); no se declaran a mano. Las débiles (`debil` en la config) solo se ven al seleccionar.
  Una sola vista relacional: cinco bloques (portfolio web, dónde vive, área privada, datos y herramientas) con las relaciones entre ellos como flechas punteadas; los grupos de la web y los esquemas SQL salen plegados. Lo que una página enseña pero vive en otra aparece como referencia (↗) bajo ella, unida a su original (relación «es el mismo que»). La web pública se modela como árbol de navegación: cada página con lo que enseña (casos, apps, proyectos SQL/Python/ML, gráficos, posts, Behance, `.pbix` del laboratorio, experiencia y formación de `sobre-mi`, capítulos del manual de Data Storytelling). La pestaña tiene búsqueda y el resumen de páginas sin enlaces desde el sitio.
  Módulo `area-privada-mapa.js`, estilos `css/mapa.css` (prefijo `mp-`). El SVG de flechas es decorativo: lo mismo se lee en el panel de detalle.
- **Supabase no se pausa**: `.github/workflows/supabase-keepalive.yml` llama a `public.keepalive()` (`supabase/keepalive.sql`) lunes y jueves
  con la clave pública, y se reactiva a sí mismo para que GitHub no desactive la tarea tras 60 días sin actividad en el repo.
- Nada de lo que venga de la base se pinta como HTML sin escapar. La clave del JS es la pública; la `service_role` nunca va en el frontend.
- La CSP de la página es estricta (`script-src 'self'`): nada de scripts ni estilos en línea.
