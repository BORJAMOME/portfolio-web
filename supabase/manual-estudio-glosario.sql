-- ═══════════════════════════════════════════════
-- supabase/manual-estudio-glosario.sql: me_docs admite el glosario completo del Manual de estudio
-- ───────────────────────────────────────────────
-- Requiere manual-estudio.sql. Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente y no borra datos.
--
-- publish.mjs sube, si el manual tiene glosario.js, cinco tipos más de documento:
--   gconf (reglas de fusión), gfam (familias), gsig (siglas), gterm (entradas) y gvis (esquemas).
-- Las restricciones CHECK de me_docs solo admitían meta | block | topic | chunk | gloss | fam | indic,
-- y la base rechazaba la subida con el error 23514. Aquí se vuelven a crear con los tipos nuevos.
-- Revertir: vuelve a crearlas con la lista anterior (antes, borra las filas de esos cinco tipos).
-- ═══════════════════════════════════════════════

alter table public.me_docs drop constraint if exists me_docs_id_check;
alter table public.me_docs drop constraint if exists me_docs_kind_check;
alter table public.me_docs add constraint me_docs_id_check
  check (id ~ '^(meta|block|topic|chunk|gloss|fam|indic|gconf|gfam|gsig|gterm|gvis):[A-Za-z0-9._:-]{1,160}$');
alter table public.me_docs add constraint me_docs_kind_check
  check (kind in ('meta', 'block', 'topic', 'chunk', 'gloss', 'fam', 'indic', 'gconf', 'gfam', 'gsig', 'gterm', 'gvis'));
