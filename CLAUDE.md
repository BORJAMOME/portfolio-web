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
  Para una pestaña nueva: el archivo, ese `<link>`, una entrada en `MODULES` y en el regex de `parseRoute`, y el enlace en `.ap-tabs`.
- **Hoy** (`#/`): próximos 7 días, entrevistas programadas y procesos parados. Solo lee.
- **Calendario** (`#/calendario`): solo lectura. Google → iCal secreto → Edge Function `supabase/functions/calendario-sync`
  (pg_cron cada 15 min) → `public.calendar_events`. La página nunca habla con Google. Guía: `supabase/functions/calendario-sync/README.md`.
- **Entrevistas** (`#/entrevistas`, `/analisis`, `/<uuid>`): tablas `procesos` y `entrevistas` (`supabase/entrevistas.sql`).
  El análisis se calcula en la página con las dos tablas ya descargadas.
- Pestaña **Fichero** (`#/fichero`): tabla de enlaces guardados, `area-privada-fichero.js`, tabla `public.links` (`supabase/fichero.sql`;
  carga inicial en `supabase/fichero-datos.sql`). Se añade, edita y borra desde la propia tabla; Supabase es la fuente de verdad.
- Nada de lo que venga de la base se pinta como HTML sin escapar. La clave del JS es la pública; la `service_role` nunca va en el frontend.
- La CSP de la página es estricta (`script-src 'self'`): nada de scripts ni estilos en línea.
