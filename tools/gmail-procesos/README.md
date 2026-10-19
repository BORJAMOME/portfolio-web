# Gmail → Entrevistas · Procesos (automático, gratis, sin IA)

Cada 15 minutos, un script en **tu** cuenta de Google busca los correos de procesos de selección y
los manda a Supabase. Unas reglas deciden qué hacer:

| El correo dice… | Qué pasa en Procesos |
|---|---|
| Envías una candidatura | Crea el proceso «En curso» (o añade una nota si ya existía) |
| «Hemos recibido tu candidatura» | Igual que arriba |
| Invitación a entrevista, prueba o test | «Sin respuesta» → «En curso», con nota |
| Rechazo («no podemos contar contigo», «otros candidatos»…) | «Me descartan», con fecha y motivo |
| Oferta | Siempre queda **por revisar** |
| No se sabe la empresa (p. ej. headhunter con Gmail) | Queda **por revisar** |

Lo dudoso aparece arriba en **Entrevistas → Procesos → Correos por revisar**, con *Revisar y aplicar*
(puedes corregir empresa, puesto y tipo) o *Descartar*. Nunca borra ni pisa lo que escribiste a mano,
ni reabre un proceso que cerraste. Cada cambio deja una línea en las notas: `[auto 14/10] Rechazo: asunto`.

```
Gmail ──(Apps Script, cada 15 min, solo lectura)──▶ Edge Function procesos-sync ──▶ procesos_correo ──▶ procesos
```

**Coste: 0 €.** Ni IA ni tokens: son reglas (`supabase/functions/procesos-sync/classify.ts`).

## Puesta en marcha (unos 10 minutos, una vez)

### 1. Base de datos
Supabase → SQL Editor → pega `supabase/procesos-correo.sql` → **Run**.

### 2. Secreto y función (terminal, desde la carpeta del repositorio)
Genera una cadena aleatoria y guárdala: la necesitarás también en el paso 3.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
npx supabase secrets set --project-ref rvizmzjkxunkbqomsvcv GMAIL_SYNC_SECRET="<la cadena>"
```

```bash
npx supabase functions deploy procesos-sync --project-ref rvizmzjkxunkbqomsvcv --no-verify-jwt --use-api
```

### 3. El script en tu cuenta de Google
1. Entra en [script.google.com](https://script.google.com) → **Nuevo proyecto**. Llámalo «Gmail → Procesos».
2. Borra lo que haya en `Código.gs` y pega el contenido de `tools/gmail-procesos/Codigo.gs`.
3. **Configuración del proyecto** (rueda dentada) → marca *Mostrar el archivo de manifiesto «appsscript.json» en el editor*.
   Vuelve al editor, abre `appsscript.json` y sustitúyelo por el de esta carpeta (activa Gmail en modo
   solo lectura y el temporizador).
4. **Configuración del proyecto → Propiedades del script → Añadir propiedad**:
   - `PROCESOS_SYNC_URL` = `https://rvizmzjkxunkbqomsvcv.supabase.co/functions/v1/procesos-sync`
   - `GMAIL_SYNC_SECRET` = la cadena del paso 2
5. En el editor elige la función **`probar`** → **Ejecutar**. Google pedirá permisos: revisa que sean
   leer Gmail, conectar con un servicio externo y gestionar los activadores, y acepta.
   El registro muestra qué correos de los últimos 7 días mandaría. **No envía nada.**
6. Si la lista tiene sentido, ejecuta **`instalar`**: crea el temporizador de 15 minutos.
7. Opcional: ejecuta **`importarDias`** para mandar los últimos 30 días. Lo que ya cargaste con
   `procesos-2026-carga.sql` no se duplica: el correo actualiza el proceso que ya existe.

> Los nombres de menús de Google cambian a veces; si alguno no coincide, busca el equivalente.

## Comprobar

```sql
select recibido_at, direccion, tipo, empresa, puesto, confianza, estado
  from public.procesos_correo where estado <> 'ignorado' order by recibido_at desc limit 20;
```

En el script: **Ejecuciones** (menú izquierdo) muestra cada pasada y su resumen
(`nuevos`, `aplicados`, `por_revisar`, `ignorados`).

## Privacidad

- El script solo **lee** (permiso `gmail.readonly`) y solo los correos que encaja con la búsqueda de
  `Codigo.gs` (palabras de selección; excluye promociones, redes y alertas de empleo).
- A Supabase va: remitente, destinatario, asunto, fecha y un extracto de 4.000 caracteres sin lo citado.
  Se guardan 700 caracteres, que `pc_retencion()` vacía a los 90 días. De lo que no es de selección
  solo se guarda el identificador del correo, para no volver a mirarlo.
- La tabla tiene RLS: solo tú, con sesión, la ves. El secreto está en las propiedades del script y en
  Supabase, nunca en el código.

## Pausar o quitar
- Pausar: en el script, ejecuta **`desinstalar`** (o borra el activador en *Activadores*).
- Revocar el acceso a Gmail: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → quita «Gmail → Procesos».
- Quitarlo todo: bloque «MARCHA ATRÁS» de `supabase/procesos-correo.sql`.

## Límites
- La empresa se deduce del asunto, del subdominio de la herramienta de selección o del dominio del
  remitente. Con correos personales (Gmail, Outlook) no se puede: quedan por revisar.
- El puesto no siempre viene en el correo: si falta, «Puesto sin especificar» (lo rellena el siguiente
  correo que lo diga, o tú).
- Las entrevistas no se crean desde el correo (la fecha suele ir en el calendario): de eso se encarga
  Preparación, a partir del evento.

## Pruebas
`deno test supabase/functions/procesos-sync/` — reglas con correos ficticios que imitan los formatos
reales (Teamtailor, Viterbit, Talentclue, rechazos, invitaciones, correos maliciosos) y la sincronización
(aplica lo seguro, deja por revisar lo dudoso, no duplica, no guarda texto de lo ignorado).
