-- Revierte sancho-acceso.sql: quita las políticas del agente, la función y la tabla.
-- No toca las políticas de Borja ni ningún dato del área privada.
-- El usuario de Authentication se borra a mano (Authentication → Users) si se desea.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and policyname in ('sancho: leer', 'sancho: crear', 'sancho: editar')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop function if exists public.is_sancho();
drop table if exists public.agents;
