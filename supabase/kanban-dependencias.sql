-- ═══════════════════════════════════════════════
-- supabase/kanban-dependencias.sql: dependencias entre tarjetas del Centro de trabajo
-- ───────────────────────────────────────────────
-- Requiere kanban.sql (kb_tarjetas) y area-privada.sql (is_member).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente.
-- Reversión: supabase/kanban-dependencias-rollback.sql (solo borra las dependencias, nunca tarjetas).
--
-- Una fila = «tarjeta_id espera a depende_de». «Espera» no se guarda: la web lo calcula
-- (una dependencia que no está en Hecho ni archivada la retiene) y la tarjeta queda libre sola
-- cuando todas sus dependencias terminan. El bloqueo manual (kb_tarjetas.bloqueada) sigue
-- para lo externo («espero acceso a la base de datos»).
-- Al borrar una tarjeta se borran sus dependencias en los dos sentidos (on delete cascade).
-- ═══════════════════════════════════════════════

create table if not exists public.kb_dependencias (
  tarjeta_id uuid not null references public.kb_tarjetas on delete cascade,
  depende_de uuid not null references public.kb_tarjetas on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tarjeta_id, depende_de),
  constraint kb_dependencias_no_propia check (tarjeta_id <> depende_de)
);
create index if not exists kb_dependencias_depende_idx on public.kb_dependencias (depende_de);

-- ─── Sin ciclos: A espera a B y B (directa o indirectamente) espera a A ───
-- La web ya no ofrece esas opciones; esto protege los datos aunque la petición llegue por otro camino.
create or replace function public.kb_dependencias_sin_ciclos() returns trigger
language plpgsql as $$
begin
  if exists (
    with recursive cadena(id) as (
      select d.depende_de from public.kb_dependencias d where d.tarjeta_id = new.depende_de
      union                                   -- union (no union all): no repite nodos y siempre termina
      select d.depende_de from public.kb_dependencias d join cadena c on d.tarjeta_id = c.id
    )
    select 1 from cadena where id = new.tarjeta_id
  ) then
    raise exception 'Esa dependencia crearía un ciclo: la otra tarjeta ya espera a esta.' using errcode = '23514';
  end if;
  return new;
end $$;
alter function public.kb_dependencias_sin_ciclos() set search_path = public;

drop trigger if exists kb_dependencias_sin_ciclos on public.kb_dependencias;
create trigger kb_dependencias_sin_ciclos before insert or update on public.kb_dependencias
  for each row execute function public.kb_dependencias_sin_ciclos();

-- ─── RLS: solo el miembro (mismo patrón que el resto de kb_*) ───
alter table public.kb_dependencias enable row level security;
revoke all on public.kb_dependencias from anon;
drop policy if exists "kb_dependencias: leer" on public.kb_dependencias;
drop policy if exists "kb_dependencias: crear" on public.kb_dependencias;
drop policy if exists "kb_dependencias: editar" on public.kb_dependencias;
drop policy if exists "kb_dependencias: borrar" on public.kb_dependencias;
create policy "kb_dependencias: leer" on public.kb_dependencias for select to authenticated using (public.is_member());
create policy "kb_dependencias: crear" on public.kb_dependencias for insert to authenticated with check (public.is_member());
create policy "kb_dependencias: editar" on public.kb_dependencias for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "kb_dependencias: borrar" on public.kb_dependencias for delete to authenticated using (public.is_member());
