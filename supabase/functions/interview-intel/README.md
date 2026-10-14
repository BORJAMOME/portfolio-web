# interview-intel — preparación automática de entrevistas

Detecta las entrevistas de tu Google Calendar, investiga la empresa y a quién te entrevista con
fuentes públicas, cruza la vacante con tu perfil real y deja un **briefing de dos páginas** en
el área privada (**Entrevistas → Preparación** y en el detalle del evento del **Calendario**).
Funciona en Supabase (Edge Function + pg_cron): no necesita tu ordenador ni Claude Code abiertos.

**Coste: 0 €.** Por defecto (`II_AI_PROVIDER=free`, `free.ts`) no usa ninguna IA ni servicio de pago:
lee la información de la invitación que Google ya ha puesto en el evento al aceptarla, la web de
la empresa, la oferta enlazada y las noticias del RSS público de Google News, y redacta el briefing
con plantillas por tipo de entrevista rellenadas con tu nota de perfil. Gmail no hace falta.
La API de Claude (`claude`) existe como opción de pago, desactivada; no la necesitas.

```
Google Calendar ──iCal secreto──▶ calendario-sync (15 min) ──▶ calendar_events (+ participantes)
                                                                   │
                                           interview-intel (10 min, pg_cron)
             ┌──────────────────────────────────────────────────────┴───────────────┐
   1. detectar (reglas, sin IA ni coste)            2. avanzar UNA entrevista un paso
      ii_interviews: estado, participantes,            a) investigar: Gmail (opcional, solo lectura)
      huellas de cambios                                  + API de Claude con búsqueda web
                                                       b) redactar y validar el informe ──▶ ii_reports
                                                                   │
                                     area-privada.html (#/preparacion, Calendario) — solo lectura
```

## Qué hace cada pieza

| Archivo | Para qué |
|---|---|
| `index.ts` | Entrada HTTP: autoriza (cron o miembro), lee los secretos, `detect()` + `advance()` |
| `handler.ts` | Validación de la petición (solo POST, JSON ≤ 2 KB, acción `tick`) |
| `classify.ts` | ¿Es una entrevista? Reglas explicables, tipo (RRHH, técnica, negocio, final), empresa y puesto, huellas de cambios |
| `pipeline.ts` | Estados, transiciones, cola con bloqueo, reintentos, límites |
| `gmail.ts` | Correos del proceso (opcional): búsqueda dirigida, extractos sin citas, solo GET |
| `free.ts` | **Por defecto.** Briefing sin IA ni coste: web de la empresa, oferta, Google News y tu perfil |
| `ai.ts` / `prompts.ts` | Opcional de pago: proveedor Claude (y el simulado de las pruebas) |
| `research.ts` | Verifica la investigación: solo fuentes que la búsqueda devolvió de verdad |
| `report.ts` | Esquema del informe y validación (extensión, bloques, fuentes, cifras) |
| `store.ts` | Acceso a Supabase con la `service_role` (solo en el servidor) |
| `../../interview-intel.sql` | Tablas, RLS, acciones de la web, cola, retención, cron |
| `../../../area-privada-preparacion.js` | Vista en la web |

## Estados

| Estado | Significa | Pasa a |
|---|---|---|
| `detected` | Entrevista detectada, aún lejos (más de `II_LEAD_DAYS`) | `queued` al acercarse |
| `pending_review` | Posible entrevista: pocas señales | `queued` (Preparar) · `dismissed` |
| `queued` | En cola para investigar | `researching` |
| `researching` | Correos + búsqueda web | `generating` · reintento |
| `generating` | Redactando y validando | `ready` · reintento |
| `ready` | Informe listo | `needs_update` · `cancelled` |
| `needs_update` | Cambió el título, la descripción o los participantes: se regenera; el informe anterior sigue visible | `researching` |
| `cancelled` | Rechazada, cancelada o desaparecida del calendario. Se conserva todo | `ready`/`queued` si vuelve |
| `failed` | 3 intentos fallidos (espera 5, 15 y 45 min entre ellos) | `queued` (Reintentar) |
| `dismissed` | La descartaste («No es una entrevista») | `pending_review` (deshacer) |

Un cambio de hora, lugar o enlace **no** provoca investigación nueva: la cabecera del briefing
siempre lee la fecha actual del evento. Un fallo nunca borra ni sustituye un informe anterior.

## Puesta en marcha

Todo lo de esta sección lo haces tú: requiere tus cuentas. Nada se ha desplegado ni ejecutado
en producción todavía.

### 1. Base de datos (Supabase → SQL Editor)

1. Ejecuta `supabase/calendario.sql` (solo la parte de arriba). **Solo añade** 6 columnas a
   `calendar_events` y amplía `calendar_replace()`; no borra nada.
2. Ejecuta `supabase/interview-intel.sql` (sin los bloques comentados del final).
3. Ejecuta `supabase/interview-intel-perfil.sql` (**no está en Git**: lo tienes solo en local).
   Crea la nota «Perfil profesional · Interview Intelligence» en *Archivos y notas*. Revísala
   y completa la sección **PENDIENTE DE VERIFICAR** con tu CV (experiencias que no salen en el portfolio, fechas…).
   Mientras algo esté ahí, el informe no lo usa como hecho.

### 2. Volver a desplegar calendario-sync (ahora guarda participantes)

```bash
npx supabase functions deploy calendario-sync --project-ref rvizmzjkxunkbqomsvcv --no-verify-jwt --use-api
```

Comprueba tras la siguiente sincronización que el feed iCal trae los participantes:

```sql
select title, organizer, jsonb_array_length(attendees) from public.calendar_events
 where starts_at > now() order by starts_at limit 10;
```

> Google incluye `ORGANIZER` y `ATTENDEE` en la dirección secreta iCal de tus calendarios;
> si en tu cuenta llegaran vacíos, la detección sigue funcionando por título y descripción,
> pero los briefings no podrán investigar a los entrevistadores.

### 3. Secretos y despliegue de interview-intel

Modo gratuito (el de por defecto): solo hace falta decirle cuál es tu correo.

```bash
npx supabase secrets set --project-ref rvizmzjkxunkbqomsvcv II_OWN_EMAILS="borja.mora.mendez@gmail.com"
```

```bash
npx supabase functions deploy interview-intel --project-ref rvizmzjkxunkbqomsvcv --no-verify-jwt --use-api
```

`CRON_SECRET` ya existe (es del proyecto y lo usa también calendario-sync).

### 4. Programarla

En `supabase/interview-intel.sql`, bloque «PROGRAMACIÓN»: quita los `-- ` y ejecútalo.
Reutiliza el secreto del Vault `calendario_cron_secret`.

### 5. Primera prueba (gratis)

1. Crea en Google Calendar un evento de prueba dentro de 3 días: título «Entrevista Data Analyst -
   Empresa Prueba», invita a otra dirección tuya y añade Meet.
2. Calendario → **Sincronizar ahora**. Entrevistas → Preparación → **Comprobar ahora** (o espera al cron).
3. Pulsa **Comprobar ahora** dos veces más (investigar y redactar son dos pasos).
4. Debe aparecer «Informe listo» («generado sin IA»), enlazado desde el evento
   del Calendario («Abrir briefing»). Prueba **Imprimir o guardar PDF**.
5. Mueve el evento de hora → misma fila, sin regenerar. Cambia el título → «Desactualizado» y v2.
6. Borra el evento → tras la sincronización, «Cancelada», con el informe conservado.

### 6. Opcional y DE PAGO: IA real (no lo necesitas)

Necesitas una clave de la API de Claude con facturación propia: la suscripción de Claude.ai
**no** incluye la API. En la consola de Anthropic crea una clave y pon un **límite de gasto**
mensual en la configuración de límites de la organización.

```bash
npx supabase secrets set --project-ref rvizmzjkxunkbqomsvcv II_AI_PROVIDER=claude ANTHROPIC_API_KEY="<tu clave>" II_MAX_AI_CALLS_PER_DAY=8
```

Modelo por defecto: `claude-opus-5-5`. Las peticiones activan el respaldo del lado del servidor
(`fallbacks: "default"`): si el modelo declina por sus salvaguardas, la API reintenta con otro
modelo y lo factura a su precio. Puedes cambiar de modelo con `II_MODEL`.

### 7. Gmail (opcional, solo lectura; no hace falta)

Al aceptar la invitación, Google ya copia al evento lo importante del correo (título, descripción,
quién convoca, participantes, enlace). Gmail solo añadiría otros correos del proceso.
Con Gmail añade la invitación y los correos del proceso (p. ej. la oferta enviada por RRHH).
Hace falta un cliente OAuth propio en Google Cloud con el permiso `gmail.readonly`, que es
«restringido» para Google. Para uso personal:

1. Google Cloud console → crea un proyecto → habilita **Gmail API**.
2. **Google Auth Platform**: configura la pantalla de consentimiento (tipo *External*, tú como
   usuario de prueba), añade el permiso `https://www.googleapis.com/auth/gmail.readonly` y
   **publica la app** (estado *In production*). Mientras esté en *Testing*, Google caduca el
   token de actualización a los 7 días. Sin verificar, verás un aviso de «app no verificada»
   al autorizar: es esperable en una app solo tuya.
3. Crea un cliente OAuth de tipo *Web application* con la URI de redirección
   `https://developers.google.com/oauthplayground`.
4. En OAuth 2.0 Playground → engranaje → *Use your own OAuth credentials* (tu id y secreto) →
   autoriza **solo** `gmail.readonly` con tu cuenta → *Exchange authorization code for tokens* →
   copia el **refresh token**.

```bash
npx supabase secrets set --project-ref rvizmzjkxunkbqomsvcv GMAIL_CLIENT_ID="…" GMAIL_CLIENT_SECRET="…" GMAIL_REFRESH_TOKEN="…"
```

> Los nombres de menús de Google cambian a menudo; si alguno no coincide, busca el equivalente.
> Revocar: myaccount.google.com → Seguridad → apps de terceros con acceso → quita la app, y
> `npx supabase secrets unset GMAIL_REFRESH_TOKEN --project-ref rvizmzjkxunkbqomsvcv`.

## Costes

**Modo gratuito (por defecto): 0 €.** Supabase con tu plan actual, iCal, web de la empresa y RSS de
Google News no cuestan nada. Lo siguiente solo aplica si algún día activas `II_AI_PROVIDER=claude`.

| Concepto | Precio | Por informe |
|---|---|---|
| Supabase (Edge Functions, cron, BD) | plan actual | 0 € adicional a este volumen |
| Claude Opus 5.5 | 4 $ / 1 M tokens de entrada · 20 $ / 1 M de salida | ≈ 0,25–0,50 $ |
| Búsqueda web de Claude | 10 $ / 1.000 búsquedas (máx. 8 por informe) | ≤ 0,08 $ |
| Gmail API, iCal | gratis | 0 |

Unos **0,30–0,60 $ por informe** (≈ 3–6 $ con 10 entrevistas al mes). Cada llamada guarda su
consumo real en `ii_runs.usage` y el briefing muestra el coste. Control: `II_MAX_AI_CALLS_PER_DAY`
(tope diario), límite de gasto en la consola de Anthropic y `II_AI_PROVIDER=off`.

```sql
select date_trunc('month', started_at) mes, count(*), round(sum((usage->>'usd')::numeric), 2) usd
  from public.ii_runs group by 1 order by 1 desc;
```

## Datos y privacidad

- **Modo gratuito:** no se envía nada a ninguna IA. Las únicas peticiones salientes son la portada
  de la web de la empresa, la página de la oferta (si no es LinkedIn) y una búsqueda en Google News
  con el **nombre de la empresa**. Ningún nombre de entrevistador sale del servidor: los enlaces de
  LinkedIn solo se generan para que los abras tú.
- Lo siguiente solo aplica al modo de pago `claude`:
- **Al modelo de IA** van: título y fecha del evento, empresa y puesto deducidos, **nombres** de
  los participantes y el **dominio** de su correo (no la dirección), la descripción del evento
  (≤ 2.000 caracteres) y extractos de correo (≤ 1.800 caracteres cada uno, máx. 5). Al redactar:
  tu nota de perfil y la investigación verificada.
- **La búsqueda web** la hace Anthropic con sus herramientas de servidor.
- **Se guarda**: participantes externos del evento, extractos de correo (se vacían 30 días
  después de la entrevista), investigación (el detalle bruto se vacía a los 180 días) e informes
  (se conservan; borrarlos es decisión tuya).
- Nada se publica en GitHub Pages: la página es pública, los datos solo llegan con sesión y RLS.
- El modelo no tiene herramientas con efectos (no envía correos ni toca el calendario ni la base);
  correos y páginas web van marcados como datos no confiables y la salida se valida.

## Operación

| Quiero… | Cómo |
|---|---|
| Ver qué pasa | `select status, count(*) from ii_interviews group by 1;` · registros de la función en Supabase → Edge Functions → interview-intel → Logs |
| Repetir la investigación / regenerar | Botón **Regenerar** en el briefing (desde el SQL Editor: `update public.ii_interviews set status = 'queued', attempts = 0, next_attempt_at = null where id = '<id>';`) |
| Reintentar tras un error | Botón **Reintentar** |
| Pausar todo | `select cron.unschedule('interview-intel');` o `II_PAUSED=1` |
| Solo detectar, sin informes | `II_AI_PROVIDER=off` |
| Recuperar un proceso colgado | No hace falta: el bloqueo caduca a los 5 min y el siguiente tick lo retoma |
| Cambiar el perfil | Edita la nota «Perfil profesional · Interview Intelligence» |
| Quitarlo todo | Bloque «MARCHA ATRÁS» de `supabase/interview-intel.sql` |

## Pruebas

```bash
deno test --allow-read supabase/functions/
node tools/check-briefing.mjs
```

La primera cubre detección (los 10 casos), investigación, generación, reintentos, idempotencia
y seguridad, todo con datos ficticios y sin red. La segunda pinta el briefing con el código real y
comprueba que cabe en dos A4 (también con 900 palabras, el máximo que acepta el servidor),
que no hay desplazamiento horizontal en móvil y que pasa axe-core.

## Límites conocidos

- La detección depende de lo que trae el feed iCal (retraso de Google de minutos a horas).
- LinkedIn no se consulta directamente: solo lo que aparece en los resultados de búsqueda.
- Una llamada de investigación puede tardar 1–2 min. La Edge Function tiene un límite de tiempo
  por ejecución (150 s en el plan gratuito); si se supera, la investigación se reintenta en el
  siguiente tick. Si ocurre a menudo, baja `max_uses` en `ai.ts` o elige otro modelo con `II_MODEL`.
- Las dos páginas se garantizan con el límite de palabras del servidor y la hoja de impresión;
  el PDF lo genera tu navegador («Guardar como PDF»).
