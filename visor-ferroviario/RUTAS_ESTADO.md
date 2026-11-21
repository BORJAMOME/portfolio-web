# Cabina · Rutas: estado del proyecto

Tabla de todas las rutas ferroviarias de viajeros de España, en una página propia (`cabina-rutas.html`) enlazada desde Cabina y desde el visor.
Última actualización: 21-11-2026 (rediseño de la tabla y fase 7: actualización semanal automática).

## Decisiones de Borja (21-11-2026), a mantener

- **Alcance:** todo lo del visor + Cercanías de Renfe de todos los núcleos + OUIGO + iryo (GTFS comunitario, marcado «no oficial») + autonómicos (FGC, Euskotren, FGV).
- **OUIGO desde el PDF oficial, no desde su GTFS** (cambio aprobado el 21-11-2026): el GTFS del NAP es el plan de julio (36 trenes cada miércoles, sin la suspensión Madrid–Andalucía ni la programación de diciembre); el PDF «Horarios OUIGO 2026-2027» da 29 → 39 y llega a junio de 2027. Se usa el que ya integra el visor (`capas/horarios.json`).
- **Fila = relación por marca:** origen → destino por marca (Madrid → Barcelona AVE). En Cercanías, una fila por línea (C1, R2…).
- **Mes y año = estimación con semana tipo:** trenes de una semana real × 4,35 y × 52, siempre etiquetado «estimación». No recoge festivos ni cambios de horario.
- **Columnas extra:** vía e infraestructura (km, % AV, % electrificado, ancho), viajeros/plazas/precio (CNMC, por corredor), puntualidad y cancelaciones, velocidad y duración, y lo que se considere importante.
- **Filtros:** operador y tipo de empresa; servicio y marca; estación y territorio (origen, destino, intermedia, comunidad, provincia, núcleo); vía y corredor.
- **Por fila:** ver en el visor, desplegar horarios del día, exportar CSV (tabla filtrada), ordenar por columna y comparar 2-3 rutas.
- **Actualización:** automática semanal con una GitHub Action.
- **Sin imágenes de Renfe** (decisión de Cabina, 20-11-2026), salvo los **logos de operador en la tabla de rutas**, en gris (pedidos por Borja el 21-11-2026).

## Fuentes (comprobadas el 20-11-2026)

| Fuente | URL | Licencia | Notas |
|---|---|---|---|
| GTFS Renfe AV/LD/MD | `https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip` | CC BY 4.0 (data.renfe.com/legal) | Ya integrado. La mayoría de variantes, vigentes solo hasta el 24-01-2027. |
| GTFS Renfe Cercanías (todos los núcleos) | `https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip` | CC BY 4.0 | 277 rutas, 130.297 viajes, 1.167 paradas, con shapes. Vigencia de unos 30 días (20-11 a 19-12-2026). Prefijo de route_id = núcleo (10 Madrid y 51 Rodalies, comprobados; el resto, inferido). |
| GTFS-RT Renfe (LD y Cercanías) | `https://gtfsrt.renfe.com/trip_updates_LD.json` y siguientes | CC BY 4.0 | `tripId` casa con el GTFS estático. Para puntualidad hay que archivarlo. |
| Estaciones Renfe | `https://ssl.renfe.com/ftransit/Fichero_estaciones/estaciones.csv` | CC BY 4.0 | Actualizado el 20-11-2026. |
| OUIGO GTFS oficial | NAP 1515 (requiere login); espejo sin login en Mobility Database mdb-2785 | Licencia de datos abiertos del MITRAMS | **Descartado**: es el plan de julio de 2026 y no está al día (ver Decisiones). Se usa el PDF oficial. |
| iryo GTFS comunitario | `deryclem.github.io/iryo-gtfs/gtfs-iryo.zip` (mdb-3645) | CC BY 4.0 de la compilación (su `LICENSE.txt`): crédito a Clément Desouche (@deryclem) | No es oficial: sale de la web pública de iryo y no tiene relación con iryo. Servicio del 05-11-2026 al 11-12-2027. |
| Autonómicos (NAP) | FGC 1373, Euskotren 1062, FGV 967 y 966 | Licencia MITRAMS | La descarga exige cuenta y `ApiKey` del NAP. |
| CNMC: indicadores de viajeros | `https://catalogodatos.cnmc.es/datastore/dump/9ff35ab8-e3b0-420d-a71b-606578dc5287` (ds_24406_1) | **CC BY-SA 4.0** | Trimestral, de 2016T1 a 2026T2: viajeros, plazas, ingresos y tren-km por corredor, producto y operador (con iryo y OUIGO). |
| CNMC: cuotas LD AV y precio | ds_24408_1 (cuotas), ds_24410_1 (precio mensual), ds_24409_1 (precio trimestral) | CC BY-SA 4.0 | Precio solo en 5 trayectos Madrid–X. |
| Puntualidad LD (comunitaria) | GitHub `josernalist/renfe-gtfsrt` | Repositorio **sin LICENSE**; los datos son de Renfe (CC BY) | Capturas cada 5 min desde el 23-03-2026. Antes de publicar un porcentaje, medir qué parte de los trenes cubre. |
| Histórico de GTFS | GitHub `elguardagujas/renfe-gtfs-archive` | Repositorio sin LICENSE; datos de Renfe (CC BY) | Volcado diario desde el 15-03-2026. |
| Estaciones por UIC | GitHub `trainline-eu/stations` | ODbL | Para unir operadores por código UIC. |

**Sin fuente pública:** puntualidad oficial descargable (Renfe la publica solo en Power BI), viajeros u ocupación por tren o relación, plazas por tren, flota por serie y datos reutilizables de Adif (solo PDF; el WFS bloquea el acceso).

## Plan por fases (cada una con su criterio de validación)

1. **Datos base** · `tools/build-rutas.mjs` → `capas/rutas.json`: Renfe AV/LD/MD, Cercanías (todos), OUIGO e iryo.
   - **Validación:** los trenes de Renfe y OUIGO del día de referencia cuadran con Cabina y el visor (2.223 + unos 29 el miércoles 18-11-2026); 3 líneas de Cercanías contrastadas a mano con el GTFS.
2. **Página** `cabina-rutas.html`: filtros, orden, buscador, horarios desplegables, CSV, comparar, enlace al visor.
   - **Validación:** axe sin infracciones, sin scroll horizontal a 375 px y carga en menos de 2 s.
3. **Vía, velocidad y duración** a partir de las aristas IGN (1.090 de 1.226 variantes las tienen).
   - **Validación:** las rutas sin trazado salen como «sin dato», no como 0.
   - **Pendiente de decidir:** cómo dar estos datos a las Cercanías de ancho ibérico, que no tienen trazado IGN.
4. **CNMC por corredor:** viajeros, plazas, ingresos y precio.
   - Atribución CC BY-SA visible en la página.
5. **Puntualidad y cancelaciones:** decidir entre el archivo comunitario (sin LICENSE) y un archivo propio del GTFS-RT oficial.
6. **Autonómicos (NAP).** Bloqueado hasta tener la cuenta y la ApiKey.
7. **GitHub Action semanal:** descarga, regenera y confirma; `--check` en la CI.

## Bloqueos y riesgos

- **Cuenta del NAP:** la tiene que crear Borja; la ApiKey irá como secreto del repositorio. Bloquea los autonómicos y la descarga oficial de OUIGO desde el NAP.
- **Licencias:** iryo CC BY 4.0 (compilación no oficial); CNMC CC BY-SA (los derivados se publican con la misma licencia); archivos de GitHub sin LICENSE.
- **Vigencia corta:** Cercanías unos 30 días, OUIGO GTFS hasta el 12-12-2026. Sin la Action semanal, la tabla se vacía.
- **Peso:** Cercanías son 130.297 viajes. Hay que agregarlos en el script, no en el navegador.
- **Otra sesión edita `cabina.*` y el visor:** la tabla va en archivos nuevos (`cabina-rutas.*`) para no pisar ese trabajo.

## Revisión de Cabina (21-11-2026): pendiente de corregir

- La tarjeta «Rutas del catálogo» cuenta 1.226 **variantes**; las relaciones reales son 735 (por marca). Hay que renombrar o recalcular.
- El enlace de estación centra el mapa pero no abre la ficha.
- Conviven dos catálogos de estaciones (1.020 de Renfe y 1.129 de los horarios).
- Cabina no tiene filtros, orden ni exportación: lo resuelve la tabla de rutas.

## Fase 1 terminada (21-11-2026): cómo se comprobó

`node --max-old-space-size=8192 tools/build-rutas.mjs --download` → `capas/rutas.json` (unos 520 KB): 744 filas, 1.482 estaciones; semana de referencia 23–29-11-2026 (miércoles 25-11).
Con `--hoy=2026-11-21` es reproducible. El lector de GTFS (`tools/rutas/gtfs.mjs`) no tiene dependencias; el de Cercanías necesita unos 4 GB de memoria.

| Fuente | Filas | Trenes el 25-11 | Comprobación |
|---|---|---|---|
| Renfe AV/LD/MD | 627 | 1.611 | Conteo independiente (calendar leído a mano): 1.611. El visor da 1.596 porque usa el GTFS del 16-11 y la tabla el del 21-11. |
| Cercanías (todos) | 70 | 4.209 | Conteo independiente: 4.228 = 4.209 + 19 viajes sin paradas u horas, que se excluyen y se anotan. Líneas comprobadas en laborable, sábado y domingo: C5 Madrid 253/210/209, R2S 143/136/136, C4 Asturias 69/65/65, C1 València 79/39/39, C1 Cantabria 44/25/17. |
| OUIGO (PDF) | 33 | 28 | Igual que el motor de Cabina tras corregirlo (unía los trayectos solo por la salida y contaba dos veces un Madrid–València; ahora une también por la llegada, como `stationDay`). |
| iryo | 14 | 60 | Sin otra fuente con la que contrastar (la CNMC solo da agregados trimestrales). |

**Hallazgos que hay que mantener:**
- El GTFS de Cercanías incluye las líneas de ancho métrico (Asturias C4–C8, Bilbao C4–C5, Cantabria C2–C3): ya no se usa el de FEVE por separado, para no contarlas dos veces.
- Se excluyen los autobuses de sustitución (`route_type 3`: 632 viajes el día de referencia).
- Mismo código de estación (5 cifras) en Renfe, Cercanías e iryo; la tabla une los operadores por ese código.
- En Cercanías, los extremos de cada fila son el recorrido más frecuente del día, no el nombre oficial. La C1 de Madrid se llama «Príncipe Pío – Aeropuerto-T4», pero hoy circula Chamartín ↔ Aeropuerto T4 (142 de 144 trenes). El nombre oficial va en `linea`.
- Comunidad por coordenadas (NUTS 2 de GISCO). Las estaciones de costa que quedan fuera del polígono generalizado se asignan a la región más cercana (≤ 3 km). Las terminales de frontera (La Tor de Querol, Cerbère, Valença) van marcadas a mano como «Fuera de España».
- Provincia del catálogo de Renfe; 461 estaciones que no están en él la toman de la estación más cercana del catálogo (≤ 40 km, misma comunidad). 12 se quedan sin provincia (la R3 del Ripollès).
- La iryo y la Renfe de la tabla siguen programando Madrid–Andalucía, aunque `servicios.meta` lo da por suspendido tras Urda: hay que anotarlo en la página.

**Formato de `capas/rutas.json`:** `referencia`, `fuentes` (vigencia, licencia, excluidos), `totales`, `notas`, `estaciones` (`k` código, `n` nombre, `c` coordenadas, `ca` comunidad, `pr` provincia) y `rutas`. Campos de cada ruta:
- identidad: `id`, `src`, `op`, `emp`, `fam`, `marca`, `nuc`, `color`, `o`/`d` (índices de estación) y `linea`;
- trenes: `lab`, `sab`, `dom`, `sem`, `mes`, `anio` y `dias` (lunes a domingo);
- horario: `pri`/`ult` (minutos), `dur`/`durMin`, `par` y `sal` ([minuto, estación de origen] del miércoles);
- estaciones y números de tren: `est` (todas las estaciones) y `num`;
- vigencia: `desde`/`hasta`.

## Fase 2 terminada (21-11-2026): la página

`cabina-rutas.html` + `cabina-rutas.css` (sobre `cabina.css`) + `cabina-rutas.js`. Lee `capas/rutas.json`; no calcula horarios en el navegador.
- **Filtros:** búsqueda por palabras (estación, ruta, línea o número de tren; cada palabra por separado), operador, tipo de empresa, servicio, marca o línea (según el servicio), núcleo, comunidad, provincia (según la comunidad), mínimo de trenes al día y «solo con trenes la semana de referencia». Comunidad y provincia filtran por cualquier parada de la ruta.
- **Tabla:** las columnas se ordenan (`aria-sort`), se muestran 50 filas más cada vez, barra de datos en «Semana». En pantallas estrechas se ocultan columnas (en móvil quedan Ruta, Laborable y Semana; el servicio va bajo el nombre).
- **Detalle desplegable:** salidas del miércoles agrupadas por estación de origen, trenes de lunes a domingo, servicio, operador, nombre oficial de la línea, duración, paradas, vigencia, números de tren, estaciones, fuente y enlace al visor.
- **Visor:** rutas con `{t:'services', r:'c:<origen>>c:<destino>'}` y líneas de Cercanías con `{t:'transit', ls:['renfe-<núcleo>-<línea>']}`.
- **Comparar:** hasta 3 rutas en una barra fija abajo. **CSV:** la selección filtrada, UTF-8 con BOM y `;` (Excel en español), con la nota de la semana de referencia.
- **Estado en el hash:** `#q=…&op=…&s=sem-` para compartir la vista.
- **Enlaces de entrada:** botón «Rutas» en la cabecera del visor y «Tabla de rutas» en el índice de Cabina. La tarjeta de Cabina «Rutas del catálogo» pasa a «Recorridos del catálogo», porque contaba variantes de paradas, no rutas, y enlaza a la tabla.

**Comprobado:**
- **Cifras:** 744 rutas. El total del laborable de la página (5.908) es la suma exacta de las cuatro fuentes (1.611 + 4.209 + 28 + 60).
- **Filtros, orden, búsqueda, despliegue y paginación:** probados en Chromium. La búsqueda queda en la URL.
- **Enlace al visor:** la ruta Barcelona-Sants → Madrid-Puerta de Atocha rellena origen y destino, sin errores de JavaScript.
- **CSV:** 700 líneas con BOM.
- **Carga:** de 0,4 a 0,6 s.
- **Pantalla:** sin scroll horizontal a 375 px, y a 1.280 px la tabla cabe sin scroll interno. La cabecera del visor mide lo mismo con el botón nuevo (148 px en móvil y 76 en escritorio).
- **Comprobaciones:** `check-a11y` sin infracciones en `cabina-rutas.html`, `cabina.html` e `index.html`; `check-links`, `version-assets --check`, `build-mapa --check` y `build-en --check`, sin incidencias.

**No comprobado:** el aspecto con el panel del navegador visible (las pruebas se hicieron en Chromium sin ventana).

## Fase 3 terminada (21-11-2026): vía, velocidad y duración

`tools/build-rutas.mjs` (función `viaPorRuta`) añade a cada ruta `via` = {km, av, el, elSin, ancho, anchos, tipo, vel, velMax, fuente, variante | incompleto}.

**Cómo se calcula:**
- **Renfe AV/LD/MD, OUIGO e iryo:** recorrido IGN inferido de la variante de `servicios.json` con los mismos extremos. Se prefiere la de la misma marca; si no la hay, cualquiera, porque OUIGO e iryo usan las mismas vías. La red sale de `tools/rutas/red.mjs`, módulo común con Cabina que aplica las mismas correcciones que el visor (`ancho.json` y el relleno de Adif).
  - Tipo de vía: alta velocidad si al menos el 80 % de los km lo es; mixta, entre el 20 y el 80 %; convencional, por debajo.
  - Electrificación: electrificada desde el 95 %; sin electrificar hasta el 5 %; sin dato si al menos la mitad de los km no lo tiene.
- **Trazado incompleto (68 rutas, p. ej. Medina–Valladolid u Oviedo–Llanes):** si la variante tiene tramos pendientes, o si el trazado mide menos que la línea recta entre los extremos, la ruta queda sin km ni velocidad. Es mejor eso que una cifra falsa: Oviedo–Llanes salía con 54 km y en línea recta son 88.
- **Cercanías:** el GTFS da un único dibujo por línea (`shapes.txt`), no por tren. Los km de cada tren son la distancia a lo largo de ese dibujo entre su primera y su última parada, y se usa la mediana de los trenes que van de extremo a extremo. Con la longitud del dibujo entero salía la R13 a 516 km/h.
  - Ancho métrico si al menos el 80 % de las estaciones son de las Cercanías métricas del visor; el catálogo de Renfe no las marca todas.
  - Tipo de vía y electrificación: sin dato.
- **Velocidad:** km ÷ duración mediana del día, más la del tren más rápido.

**En la página:**
- columnas «Km» y «Km/h», que se ocultan en pantallas estrechas;
- filtros de tipo de vía, ancho y electrificación;
- línea «Vía» y «Velocidad media» en el detalle;
- las mismas columnas en el CSV y en la comparación.
- «Paradas» y «Mes*» se ocultan por debajo de 1.500 px (siguen en el detalle y en el CSV) para que la tabla quepa sin scroll interno.

**Comprobado:**
- **Distancias** (con las oficiales entre paréntesis): Madrid–Barcelona AVE 624 km (621), Madrid–Sevilla 469 (471), Madrid–València 396 (391), Madrid–Málaga 511 (513). iryo y OUIGO Madrid–Barcelona: 624 y 620 km.
- **Cobertura:** 655 rutas con km, 68 con trazado incompleto y 22 sin dato.
- **Ancho métrico** en las líneas de la fase 1, más Cartagena, Ferrol y León.
- **Página:** sin errores en Chromium a 1.440, 1.280 y 375 px, y sin scroll interno de la tabla.
- **Comprobaciones:** `check-a11y` sin infracciones en `cabina-rutas.html` y `cabina.html`; `check-links`, `version-assets`, `build-mapa`, `build-en` y `build-cabina --check`.

**Pendiente:** el filtro por corredor (Hermes o TEN-T) no está hecho. Habría que cruzar el recorrido de cada variante con `corredores.geojson` (tramos Hermes) o con `tramos-ten-t.geojson`.

## Fase 4 terminada en la tabla (21-11-2026): CNMC por corredor

`tools/build-cnmc.mjs --download` → `capas/cnmc.json` (7,5 KB). Se publica con la licencia CC BY-SA 4.0 de la CNMC.
- **Fuente:** datastore de catalogodatos.cnmc.es (UTF-8, punto decimal), conjuntos ds_24408 (viajeros y plazas por corredor y operador), ds_24406 (viajeros-km y plazas-km) y ds_24410 (precio mensual).
- **Por corredor y operador, para 2025 y los últimos 4 trimestres:** viajeros, plazas, cuota y ocupación (viajeros-km ÷ plazas-km).
- **Ocupación de los 5 corredores juntos**, serie trimestral de la cuota de Renfe, viajeros por año y precio medio de 2025 por trayecto y producto. Para el precio solo vale 2025 completo: la CNMC cambió el método en el 1T 2026.
- **El formato de `cnmc.json` está pactado con la sesión de la ola 2 de Cabina**, que lo lee desde `build-cabina`: no cambiar claves sin avisar.

**En la tabla:**
- Cada ruta de alta velocidad comercial (AVE, AVE Euromed, Avlo, iryo, OUIGO) con Madrid en un extremo se asigna al corredor de la ciudad del otro extremo. Solo cuentan las ciudades de la propia línea hasta la cabecera (`corredor_regex`), y Córdoba va al corredor del destino final.
- Columna «Ocup. %» (se oculta por debajo de 1.200 px), filtro «Corredor de la CNMC», bloque «Corredor según la CNMC» en el detalle, y las mismas cifras en la comparación y en el CSV, con la nota de licencia.
- Rutas asignadas: Alicante 8, Barcelona 10, Málaga/Granada 8, Sevilla 6, València 14.
- Las columnas «Paradas», «Mes*», «Operador» y «Primero – último» ya no salen nunca en la tabla, porque el contenedor no pasa de 1.150 px. Siguen en el detalle, en la comparación y en el CSV.

**Comprobado:**
- Contraste con `manual-ferrocarriles/mapa/investigacion-cabina/ola2/resultados.json`, que salía de las copias en cp1252 y se validó contra la nota de prensa de la CNMC del 17-07-2026. Cuadran todos: viajeros 2025 por corredor, cuota y ocupación por corredor y operador, ocupación de los 5 corredores y viajeros anuales.
- Tabla sin scroll interno de 1.920 a 375 px.
- `check-a11y`, `check-links`, `version-assets`, `build-mapa`, `build-en` y `build-cabina --check`, sin incidencias.

**Reparto con la otra sesión (21-11-2026):** esta sesión lleva `cnmc.json` y la tabla de rutas. La sesión «Diseño responsive y mejoras de contenido» lleva la ola 2 de Cabina (`cabina.*`, `build-cabina.mjs` y su propio `tools/build-cabina-mercado.mjs` para INE, mercancías y Eurostat), y lee la CNMC de `cnmc.json`.

## Rediseño de la tabla (21-11-2026)

- **Operador con logo en gris** (`img/operadores/*.svg`, trazados de Wikimedia Commons, dominio público, con un solo color `#6b7486`): Renfe, Avlo, iryo y OUIGO. Avlo es marca de Renfe pero lleva su logo. Se comprobó que la geometría coincide número a número con los SVG originales.
- **Color de fila por operador** (tinte del 4 % y filete a la izquierda): Renfe `#5b064b`, Avlo `#bc8fb3`, iryo `#ce0511`, OUIGO `#e50a70`. El color nunca va solo: el logo con su `alt` dice lo mismo.
- **Provincias**: el CSV de estaciones de Renfe viene en Latin-1 y se leía como UTF-8 («A Coru�a»). `build-rutas` lo detecta; las bilingües, en castellano (Alicante, Castellón, Valencia, Álava) y «Desconocido» pasa a sin dato. Las de nombre oficial único se dejan así (A Coruña, Bizkaia, Gipuzkoa, Girona, Lleida, Ourense). Al regenerar solo cambiaron las provincias (362 estaciones) y la fecha; `oferta.json` cambia por lo mismo.
- **KPIs**: «Rutas» con barra del % del total; «Trenes en un día laborable» y «Trenes en una semana» explican que son sumas de las rutas filtradas y qué días cubren.
- **Tabla**: página a 1.820 px como máximo, ruta en una línea (en Cercanías la línea y el núcleo van en Servicio), divisorias en el bloque de tiempo (| laborable sábado domingo | semana mes año |) y cortes de columnas calculados con la anchura real (ruta de hasta ~520 px). Sin desbordamiento de 1.920 a 375 px; solo las 3 rutas más largas (Bilbao/Santiago ↔ Chamartín) piden desplazamiento entre 641 y 975 px.

## Fase 7 (21-11-2026): actualización semanal automática

`.github/workflows/rutas-semanal.yml`, los lunes a las 04:23 UTC y a mano con «Run workflow».
- **Pasos:** `build-rutas --download` → `build-cnmc --download` → `build-cabina` → `tools/rutas/sanity.mjs` → `build-cabina --check`, `check-links` y `version-assets --check` → commit en `main` como github-actions[bot], solo si cambian `rutas.json`, `oferta.json`, `cnmc.json`, `cabina.json` o `cabina.html`.
- **Control de cordura** (`tools/rutas/sanity.mjs`, frente a `HEAD`): no publica si una fuente pierde más del 40 % de los trenes de un laborable o más del 30 % de las rutas, si Cabina pierde más del 40 % de los trenes, si la CNMC no trae 5 corredores o si su último trimestre retrocede. El resumen (tabla por fuente con «horarios hasta») sale en la página de la ejecución.
- **Si falla algo,** el job queda en rojo, no se sube nada y GitHub avisa por correo. Los datos publicados siguen siendo los de la semana anterior.
- **Reactivación:** el último paso reactiva el propio workflow, como `supabase-keepalive.yml`, para que GitHub no lo apague tras 60 días sin actividad.
- **Memoria:** 6 GB para Node (en local, build-rutas y build-cabina pasan con 3 GB).
- `main` no tiene protección de rama, así que el bot puede subir directamente.

**Comprobado en local:** el control pasa con los datos actuales y falla (código 1) si se simula la caída de Cercanías a 100 trenes. Mapa del repositorio regenerado, `check-links` y `version-assets --check` sin incidencias.
**Comprobado en GitHub (21-11-2026, ejecución 44907670673):** todos los pasos en verde; las descargas desde el runner funcionan y el control de cordura pasa (mismos trenes y rutas por fuente). El bot confirmó un commit, pero solo por la fecha de descarga (`downloaded`) en `fuentes`: se ha quitado de `build-rutas`. La segunda ejecución volvió a confirmar porque Renfe da un `Last-Modified` distinto en cada servidor (segundos de diferencia) y republica a diario: tampoco va ya a `rutas.json`. Las dos fechas quedan solo en `.cache/rutas/meta.json`; la vigencia de cada fuente sigue en `from`/`to`.

**Coordinación:** cuando se fusione la ola 2 de Cabina, el workflow tendrá que ejecutar también `tools/build-cabina-mercado.mjs` si sus datos deben refrescarse (lo decide esa sesión).

## Siguiente tarea

- **Fase 6: operadores autonómicos (FGC, Euskotren, FGV).** Bloqueada hasta que Borja cree la cuenta del NAP y su ApiKey.
- **Pendiente de la fase 3:** el filtro por corredor Hermes o TEN-T.

## Auditoría y correcciones (21-11-2026)

Auditoría independiente de `rutas.json`: recálculo en Python frente a los GTFS de Renfe AV/LD/MD, Cercanías e iryo, el PDF de OUIGO (parser propio), la CNMC y el catálogo de estaciones.
- **Fiel a la fuente:** 711 de 711 filas de Renfe, Cercanías e iryo iguales al GTFS (trenes por día, horas, paradas, estaciones, números, vigencia); OUIGO, 212 de 212 trenes-día de la semana; CNMC, 130 de 130 valores.
- **No fiel a la realidad:** el GTFS de Renfe AV/LD/MD programa trenes por tramos cortados y mete como trenes autobuses del plan alternativo (todos sus viajes son `route_type 2`). Se corrige con `tools/rutas/cortes.json` (abajo).

**Cortes (`tools/rutas/cortes.json`).**
- **Criterio de entrada:** fuente oficial o de prensa **y** confirmación en el tiempo real de Renfe (0 trenes vistos del 14 al 20-11-2026 en las rutas afectadas). En el ancho métrico, que el tiempo real no cubre, basta Adif.
- **Cortes aplicados:**
  - Urda, LAV Madrid–Sevilla: Renfe, iryo y OUIGO; los regionales por Alcázar siguen.
  - Algeciras–Bobadilla.
  - Zaragoza–Teruel–Sagunto.
  - Xàtiva–Alcoi.
  - Carancos–Llanes (23-11 a 05-12).
- **Efecto:** `build-rutas` quita esos trenes de los recuentos en las fechas del corte. Cada ruta lleva `sup` (trenes suprimidos de lunes a domingo) y `cortes`; el fichero, `cortes` con la fuente.
- **Avisos:** el script falla si un corte no afecta a ningún tren, y avisa cuando pasa su fecha `revisar`. Las Cercanías no se tocan: su GTFS ya separa los autobuses.
- **Semana del 23-11:** 215 trenes menos en el laborable (de 5.909 a 5.694; Urda, 154).
- **Sin aplicar por falta de pruebas:**
  - Córdoba–Santa Cruz de Mudela: Adif lo da por cortado, pero Madrid–Jaén se ve en el tiempo real.
  - Guadalajara–Plasencia de Jalón: solo Madrid–Soria es concluyente.

**Km.** `viaPorRuta` sumaba las aristas de la variante, que dejan fuera la vía al cruzar cada estación (de 0,1 a 2,7 km por parada).
- **Arreglo:** se unen los trozos por la red IGN (`bridge`) y hay controles nuevos: km < 1,02 × recta; ida y vuelta que comparten ≥ 90 % de vía y difieren > 5 %; velocidad imposible.
- **Campo nuevo:** `via.motivo` explica cada ruta incompleta.
- **Resultado:** 675 rutas con km (antes 655). Valladolid–Salamanca pasa de 108 a 120 km (≈ 120,8 por PK); Mérida–Badajoz, de 54 a 60 (59,3).

**OUIGO.** Las erratas del PDF y de su lectura en `horarios.json` (el generador no está en este repositorio) se corrigen en `OUIGO_ERRATAS`; el script falla si una errata no encuentra su registro. Además se unen los trenes que el PDF parte en dos. La semana de referencia no cambia; diciembre y enero sí.

**Territorio.** La provincia de las estaciones que no están en el catálogo de Renfe sale del municipio del INE, y la comunidad, de la provincia. Corrige 12 estaciones mal asignadas y 12 sin provincia.
