# CLAUDE.md — portfolio-web (borjamora.es)

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
Zona con contraseña real (Supabase Auth + Row Level Security), enlazada desde Descargas. Sin librerías: habla con la API de Supabase con `fetch`.
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
- **Hoy** (`#/`): próximos 7 días, entrevistas programadas y procesos parados. Solo lee.
- **Calendario** (`#/calendario`): solo lectura. Google → iCal secreto → Edge Function `supabase/functions/calendario-sync`
  (pg_cron cada 15 min) → `public.calendar_events`. La página nunca habla con Google. Guía: `supabase/functions/calendario-sync/README.md`.
- **Entrevistas** (`#/entrevistas`, `/analisis`, `/<uuid>`): tablas `procesos` y `entrevistas` (`supabase/entrevistas.sql`).
  El análisis se calcula en la página con las dos tablas ya descargadas.
- Pestaña **Fichero** (`#/fichero`): tabla de enlaces guardados, `area-privada-fichero.js`, tabla `public.links` (`supabase/fichero.sql`;
  carga inicial en `supabase/fichero-datos.sql`). Se añade, edita y borra desde la propia tabla; Supabase es la fuente de verdad.
- **Supabase no se pausa**: `.github/workflows/supabase-keepalive.yml` llama a `public.keepalive()` (`supabase/keepalive.sql`) lunes y jueves
  con la clave pública, y se reactiva a sí mismo para que GitHub no desactive la tarea tras 60 días sin actividad en el repo.
- Nada de lo que venga de la base se pinta como HTML sin escapar. La clave del JS es la pública; la `service_role` nunca va en el frontend.
- La CSP de la página es estricta (`script-src 'self'`): nada de scripts ni estilos en línea.
