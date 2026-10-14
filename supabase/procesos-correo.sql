-- ═══════════════════════════════════════════════
-- supabase/procesos-correo.sql — procesos de selección que se rellenan solos desde Gmail
-- ───────────────────────────────────────────────
-- Requiere: area-privada.sql (is_member) y entrevistas.sql (procesos).
-- Se ejecuta en Supabase → SQL Editor. Idempotente; solo AÑADE objetos.
--
-- Flujo (sin IA, sin coste)
--   Gmail ──(Google Apps Script, tools/gmail-procesos/)──▶ Edge Function «procesos-sync»
--     clasifica cada correo con reglas ──▶ public.procesos_correo (registro, sin duplicados)
--       · confianza alta  → pc_aplicar(): crea o actualiza el proceso en public.procesos
--       · confianza media → queda «por revisar» en Entrevistas → Procesos (Aplicar / Descartar)
--
-- Reglas de pc_aplicar (nunca borra ni pisa lo escrito a mano):
--   candidatura / acuse    crea el proceso (activo) o añade una nota
--   entrevista / prueba    proceso «sin respuesta» → «en curso»; nota
--   rechazo                «en curso» o «sin respuesta» → «me descartan», con fecha y motivo
--   oferta                 «en curso» o «sin respuesta» → «oferta»
-- Cada cambio deja una línea en las notas del proceso: «[auto 14/10] Rechazo: asunto».
-- ═══════════════════════════════════════════════

create table if not exists public.procesos_correo (
  id           uuid primary key default gen_random_uuid(),
  message_id   text not null unique check (char_length(message_id) <= 200),
  thread_id    text check (char_length(thread_id) <= 200),
  direccion    text not null check (direccion in ('recibido', 'enviado')),
  remitente    text check (char_length(remitente) <= 320),
  destinatario text check (char_length(destinatario) <= 320),
  asunto       text check (char_length(asunto) <= 300),
  extracto     text check (char_length(extracto) <= 700),     -- se vacía a los 90 días
  recibido_at  timestamptz not null,
  tipo         text not null check (tipo in ('candidatura', 'acuse', 'entrevista', 'prueba', 'rechazo', 'oferta', 'otro')),
  empresa      text check (char_length(empresa) <= 160),
  empresa_clave text check (char_length(empresa_clave) <= 80), -- dominio o nombre normalizado para buscar el proceso
  puesto       text check (char_length(puesto) <= 200),
  fuente       text check (char_length(fuente) <= 60),
  motivo       text check (char_length(motivo) <= 1000),       -- frase del rechazo
  confianza    text not null check (confianza in ('alta', 'media', 'baja')),
  senales      jsonb not null default '[]',
  estado       text not null default 'por_revisar' check (estado in ('aplicado', 'por_revisar', 'descartado', 'ignorado')),
  proceso_id   uuid references public.procesos(id) on delete set null,
  aplicado_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists procesos_correo_estado_idx on public.procesos_correo (estado, recibido_at desc);

alter table public.procesos_correo enable row level security;
revoke all on public.procesos_correo from anon;
revoke insert, update, delete on public.procesos_correo from authenticated;
drop policy if exists "procesos_correo: leer" on public.procesos_correo;
create policy "procesos_correo: leer" on public.procesos_correo for select to authenticated using (public.is_member());

-- Texto normalizado para comparar empresas: sin tildes, minúsculas, solo letras y números
create or replace function public.pc_norm(s text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(coalesce(s, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'), '[^a-z0-9]', '', 'g')
$$;

-- Aplica un correo del registro. Los parámetros opcionales permiten corregir lo detectado desde la web.
create or replace function public.pc_aplicar(target uuid, empresa_in text default null, puesto_in text default null, tipo_in text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.procesos_correo;
  p public.procesos;
  k text; emp text; pue text; tip text; nota text; nuevo text;
begin
  if not (public.is_member() or (select auth.role()) = 'service_role') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into r from public.procesos_correo where id = target for update;
  if r.id is null then raise exception 'No existe' using errcode = 'P0002'; end if;
  if r.estado = 'aplicado' then return r.proceso_id; end if;

  emp := nullif(trim(coalesce(empresa_in, r.empresa)), '');
  pue := nullif(trim(coalesce(puesto_in, r.puesto)), '');
  tip := coalesce(tipo_in, r.tipo);
  if emp is null then raise exception 'Indica la empresa' using errcode = '22023'; end if;
  if tip not in ('candidatura', 'acuse', 'entrevista', 'prueba', 'rechazo', 'oferta') then
    raise exception 'Tipo no aplicable: %', tip using errcode = '22023';
  end if;

  k := public.pc_norm(case when empresa_in is not null then empresa_in else coalesce(r.empresa_clave, r.empresa) end);
  nota := '[auto ' || to_char(r.recibido_at at time zone 'Europe/Madrid', 'DD/MM') || '] ' ||
          initcap(tip) || ': ' || left(coalesce(r.asunto, '(sin asunto)'), 160);

  -- el proceso de esa empresa: primero los abiertos, después el más reciente (último año y medio)
  select x.* into p from public.procesos x
   where length(k) >= 3
     and (public.pc_norm(x.empresa) like '%' || k || '%'
          or (length(public.pc_norm(split_part(x.empresa, ' ', 1))) >= 4
              and k like '%' || public.pc_norm(split_part(x.empresa, ' ', 1)) || '%'))
     and x.fecha_aplicacion >= (r.recibido_at - interval '18 months')::date
   order by (x.estado in ('activo', 'oferta')) desc, x.fecha_aplicacion desc
   limit 1;

  if p.id is null then
    nuevo := case tip when 'rechazo' then 'rechazado' when 'oferta' then 'oferta' else 'activo' end;
    insert into public.procesos (empresa, puesto, fuente, fecha_aplicacion, estado, fecha_cierre, motivo_cierre, notas)
    values (left(emp, 160), left(coalesce(pue, 'Puesto sin especificar'), 200), r.fuente, (r.recibido_at at time zone 'Europe/Madrid')::date,
            nuevo, case when nuevo = 'rechazado' then (r.recibido_at at time zone 'Europe/Madrid')::date end,
            case when nuevo = 'rechazado' then left(r.motivo, 1000) end,
            nota || E'\n(Proceso creado automáticamente desde Gmail.)')
    returning * into p;
  else
    update public.procesos x set
      estado = case
        when tip = 'rechazo' and x.estado in ('activo', 'sin_respuesta') then 'rechazado'
        when tip = 'oferta'  and x.estado in ('activo', 'sin_respuesta') then 'oferta'
        when tip in ('entrevista', 'prueba', 'acuse', 'candidatura') and x.estado = 'sin_respuesta' then 'activo'
        else x.estado end,
      fecha_cierre = case when tip = 'rechazo' and x.estado in ('activo', 'sin_respuesta')
                          then (r.recibido_at at time zone 'Europe/Madrid')::date else x.fecha_cierre end,
      motivo_cierre = case when tip = 'rechazo' and x.estado in ('activo', 'sin_respuesta') and x.motivo_cierre is null
                           then left(r.motivo, 1000) else x.motivo_cierre end,
      puesto = case when x.puesto = 'Puesto sin especificar' and pue is not null then left(pue, 200) else x.puesto end,
      notas = right(coalesce(x.notas || E'\n', '') || nota, 5000)
    where x.id = p.id;
  end if;

  update public.procesos_correo set estado = 'aplicado', proceso_id = p.id, aplicado_at = now(),
         empresa = left(emp, 160), puesto = coalesce(left(pue, 200), puesto), tipo = tip
   where id = target;
  return p.id;
end $$;

create or replace function public.pc_descartar(target uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.procesos_correo set estado = 'descartado' where id = target and estado = 'por_revisar';
end $$;

revoke execute on function public.pc_aplicar(uuid, text, text, text) from public, anon;
revoke execute on function public.pc_descartar(uuid) from public, anon;
grant  execute on function public.pc_aplicar(uuid, text, text, text) to authenticated, service_role;
grant  execute on function public.pc_descartar(uuid) to authenticated;

-- Retención: el extracto del correo se vacía a los 90 días (queda el asunto y lo detectado)
create or replace function public.pc_retencion() returns void
language sql security definer set search_path = '' as $$
  update public.procesos_correo set extracto = null where extracto is not null and recibido_at < now() - interval '90 days';
$$;
revoke execute on function public.pc_retencion() from public, anon, authenticated;
-- Opcional (semanal):  select cron.schedule('procesos-correo-retencion', '45 4 * * 1', $$ select public.pc_retencion() $$);

-- ─── MARCHA ATRÁS ───
-- drop function if exists public.pc_aplicar(uuid, text, text, text), public.pc_descartar(uuid), public.pc_retencion(), public.pc_norm(text);
-- drop table if exists public.procesos_correo;
-- (Los procesos creados se quedan en public.procesos.)
