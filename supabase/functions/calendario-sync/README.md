# calendario-sync — Google Calendar → área privada

Sincroniza tu Google Calendar con la tabla `public.calendar_events` cada 15 minutos.
Es **solo lectura**: usa la dirección secreta iCal de cada calendario, así que no hace falta
OAuth ni ningún script de Google en la página.

```
Google Calendar ──(iCal secreto)──▶ esta función ──▶ calendar_events ──▶ area-privada.html
                         ▲
                 pg_cron, cada 15 min
```

## 1. Base de datos

En Supabase → SQL Editor, ejecuta `supabase/calendario.sql` (solo la parte de arriba, sin el bloque comentado
«PROGRAMACIÓN»). Si todavía no lo has hecho, ejecuta también `supabase/entrevistas.sql`.

## 2. Dirección secreta iCal

Google Calendar (web) → ⚙️ Configuración → en la izquierda, tu calendario →
**Integrar el calendario** → **Dirección secreta en formato iCal** → copiar.

> Es una contraseña: quien la tenga ve todo el calendario. No la pegues en el código,
> en un commit ni en un chat. Si se filtra, en esa misma pantalla puedes **restablecerla**.

## 3. Desplegar la función

Con `npx` no hace falta instalar la CLI (Supabase no admite `npm i -g`). Desde la raíz del repo:

```bash
npx supabase login
```

Secretos: una línea por calendario, `nombre|dirección`. `CRON_SECRET` es una cadena larga
aleatoria; genérala con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

```bash
npx supabase secrets set --project-ref rvizmzjkxunkbqomsvcv GCAL_ICS="principal|https://calendar.google.com/calendar/ical/…/basic.ics" CRON_SECRET="<cadena-aleatoria>"
```

```bash
npx supabase functions deploy calendario-sync --project-ref rvizmzjkxunkbqomsvcv --no-verify-jwt --use-api
```

`--no-verify-jwt` es correcto: la función comprueba ella misma que la llamada viene del cron
(con `CRON_SECRET`) o de un usuario que está en `public.members`. Cualquier otra recibe 401.

## 4. Programarla

Vuelve a `supabase/calendario.sql`, copia el bloque «PROGRAMACIÓN», quítale los `-- `,
pon el mismo `CRON_SECRET` y ejecútalo. Para la primera carga, sin esperar al cron, pulsa
**Sincronizar ahora** en la pestaña Calendario.

## Comprobar

```sql
select * from public.calendar_sync;                                        -- última ejecución por calendario
select * from cron.job_run_details order by start_time desc limit 5;       -- ejecuciones del cron
select count(*), min(starts_at), max(starts_at) from public.calendar_events;
```

## Tests del parser

```bash
deno test supabase/functions/calendario-sync/ical.test.ts
```

Cubre zonas horarias, cambio de hora, recurrencias con excepciones (EXDATE y ocurrencias
movidas), eventos de día completo y eventos cancelados.

## Límites

- Ventana: 60 días atrás y 365 adelante. Las recurrencias se expanden dentro de ella.
- Google actualiza el feed iCal con cierto retraso (normalmente minutos; a veces más).
- Para **crear** eventos desde la web haría falta OAuth con permiso de escritura: fase aparte.
