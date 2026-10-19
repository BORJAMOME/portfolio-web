# CLAUDE.md: portfolio-web (borjamora.es)

Sitio estático (HTML/CSS/JS sin framework ni build) publicado con GitHub Pages desde `main`.
Contexto de producto y marca: `PRODUCT.md` (solo local). Mapa de archivos y comandos: `README.md`.

## Reglas
- Español de España en todo el contenido. Rol: «Data Analyst Junior». Lema: «Analizo datos. Diseño cómo se leen.»
- Las páginas de `en/` **se generan** (`node tools/build-en.mjs`); nunca se editan a mano. Traducciones en `i18n/`.
- Tras cambiar un CSS/JS propio: `node tools/version-assets.mjs` (versiones `?v=`).
- Sin dependencias nuevas salvo que no haya alternativa nativa razonable.
- Manuales con sistema propio: `ds/` (Data Storytelling), `ml/` (se genera en otro repo), `pbi/`.

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
  Pruebas: `node --test tools/second-brain/second-brain.test.mjs` y `node tools/second-brain/e2e.mjs`. Guía y reglas de evidencia: `tools/second-brain/README.md`.
  Cambiar `framework.json` o el motor → `node tools/second-brain/analyze.mjs --demo` (regenera el demo; hay un test que lo comprueba).
- **Supabase no se pausa**: `.github/workflows/supabase-keepalive.yml` llama a `public.keepalive()` (`supabase/keepalive.sql`) lunes y jueves
  con la clave pública, y se reactiva a sí mismo para que GitHub no desactive la tarea tras 60 días sin actividad en el repo.
- Nada de lo que venga de la base se pinta como HTML sin escapar. La clave del JS es la pública; la `service_role` nunca va en el frontend.
- La CSP de la página es estricta (`script-src 'self'`): nada de scripts ni estilos en línea.
