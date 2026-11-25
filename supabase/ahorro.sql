-- Ejecutar una vez en el SQL Editor del proyecto del área privada.
-- Requiere public.is_member(), definida en area-privada.sql.
create table if not exists public.ahorro_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('ahorro-perspectiva-v2', 'ahorro-presupuesto-v1', 'ahorro-laboratorio-v1')),
  value text check (octet_length(value) <= 1048576),
  primary key (user_id, key)
);

alter table public.ahorro_preferences enable row level security;
revoke all on public.ahorro_preferences from public, anon, authenticated;
grant select, insert, update on public.ahorro_preferences to authenticated;

drop policy if exists "Ahorro propio" on public.ahorro_preferences;
create policy "Ahorro propio" on public.ahorro_preferences
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_member()))
  with check (user_id = (select auth.uid()) and (select public.is_member()));
