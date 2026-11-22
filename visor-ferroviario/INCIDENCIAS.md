# Incidencias de Cabina

Fuente inicial: [Renfe Data, incidencias y avisos de Cercanías](https://data.renfe.com/es/dataset/incidencias-avisos), recurso `https://gtfsrt.renfe.com/alerts.json`. Incluye avisos de circulación, obras y accesibilidad. No es un recuento exhaustivo de incidencias ferroviarias en España. No incorpora todavía Adif ni retrasos individuales AV/LD/MD.

## Actualización

`node tools/update-incidencias.mjs` descarga la fuente y actualiza atómicamente `capas/incidencias.json`. Necesita Node 22 y acceso a Internet, sin claves. Un fallo HTTP, de formato o una cabecera con antigüedad superior a 24 horas interrumpe la actualización sin modificar el histórico. La interfaz señala consultas con más de ocho días de antigüedad.

El workflow `incidencias-semanales.yml` consulta los lunes a las 07:23 UTC (08:23 en invierno y 09:23 en verano en Madrid), admite ejecución manual y guarda exclusivamente el JSON. Debe incorporarse a la rama principal para activar la programación. GitHub puede retrasar las ejecuciones; un fallo queda visible en Actions. La rama debe permitir las escrituras del bot.

Tras guardar los datos solicita explícitamente una construcción de GitHub Pages, porque los commits realizados con `GITHUB_TOKEN` no la disparan automáticamente. Requiere `pages: write` y mantiene el despliegue actual desde la rama principal, sin cambiar la configuración del sitio.

## Cómo se presenta en Cabina (22-11-2026)

- **Titular y dos gráficos** con los avisos presentes en la última consulta: por tipo (accesibilidad, obras y autobús, huelgas, incidencias técnicas, información) y por núcleo.
- **Tipo:** palabras clave del texto, en castellano y euskera; gana la primera regla que encaja, en ese orden (`cabina-incidencias.js` · `TIPOS`). Los avisos de huelga incluyen los de desconvocatoria.
- **Núcleo:** prefijo del código de línea del GTFS (10 = Madrid, 51 = Rodalies…) o código de estación, con el mapa `nucleos` de `capas/analisis.json` (`tools/build-cabina-analisis.mjs`). Sin ese archivo, el gráfico por núcleo queda vacío y el resto funciona.
- **Histórico mensual y listado, plegados.** La tabla mensual solo enseña los meses desde la primera consulta guardada hasta el mes en curso (antes salían diez filas vacías).

## Qué se cuenta

- Una unidad por identificador de aviso de Renfe; distintos identificadores pueden referirse al mismo suceso real. No se presenta como número de averías ni como número de trenes afectados.
- El mes de alta es el de la primera detección local, en Europe/Madrid, no el comienzo del periodo de actividad del aviso. No se reconstruye retrospectivamente 2026.
- Un cambio de texto, una reaparición o una incidencia persistente no suma de nuevo. Se conserva su primera detección y se actualiza su última detección.
- Cada año tiene su propio acumulado. En 2027 empieza a cero automáticamente, conservando el histórico de 2026. Un aviso de diciembre que siga presente en enero no vuelve a contar, aunque se muestra en la tabla de enero.
- Los meses sin consultas se muestran como «—». Cero solo se muestra si hubo consultas sin nuevas incorporaciones; el acumulado representa exclusivamente lo observado.
- La primera consulta incorpora todos los avisos que contenga entonces la fuente, aunque sean antiguos. Es un inicio del seguimiento, no incidencias nuevas ocurridas ese día.
- La ausencia en una consulta posterior no acredita resolución. El muestreo semanal pierde avisos publicados y retirados entre consultas.

El histórico se conserva en el repositorio y es compartido por todos los visitantes; no depende de localStorage ni de que alguien abra Cabina. Cada muestra conserva la fecha de consulta, fecha de la fuente e identificadores presentes. La tabla no se anuncia como tiempo real.

Origen de los datos: Renfe Operadora. Se enlazan las [condiciones de reutilización](https://data.renfe.com/es/legal) desde Cabina.

## Verificación

`node --test tools/incidencias.test.mjs` comprueba deduplicación, cambios de texto, consultas vacías, cambio de mes/año, horario de Madrid y rechazo de fuentes no válidas.

`node tools/check-incidencias.mjs` verifica el resumen (titular y gráficos), que el histórico empiece plegado, tabla, búsqueda, paginación, móvil y el paso a 2027 en Chromium, con una fuente simulada determinista. `node tools/check-a11y.mjs visor-ferroviario/cabina.html` comprueba accesibilidad y errores de JavaScript. Ambas comprobaciones están incorporadas al CI.
