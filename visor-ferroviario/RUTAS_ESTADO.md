# Cabina · Rutas: estado del proyecto

Tabla de todas las rutas ferroviarias de viajeros de España, en una página propia (`cabina-rutas.html`) enlazada desde Cabina y desde el visor.
Última actualización: 21-11-2026 (fase 1: datos base, cerrada).

## Decisiones de Borja (21-11-2026), a mantener

- **Alcance:** todo lo del visor + Cercanías de Renfe de todos los núcleos + OUIGO + iryo (GTFS comunitario, marcado «no oficial») + autonómicos (FGC, Euskotren, FGV).
- **OUIGO desde el PDF oficial, no desde su GTFS** (cambio aprobado el 21-11-2026): el GTFS del NAP es el plan de julio (36 trenes cada miércoles, sin la suspensión Madrid–Andalucía ni la programación de diciembre); el PDF «Horarios OUIGO 2026-2027» da 29 → 39 y llega a junio de 2027. Se usa el que ya integra el visor (`capas/horarios.json`).
- **Fila = relación por marca:** origen → destino por marca (Madrid → Barcelona AVE). En Cercanías, una fila por línea (C1, R2…).
- **Mes y año = estimación con semana tipo:** trenes de una semana real × 4,35 y × 52, siempre etiquetado «estimación». No recoge festivos ni cambios de horario.
- **Columnas extra:** vía e infraestructura (km, % AV, % electrificado, ancho), viajeros/plazas/precio (CNMC, por corredor), puntualidad y cancelaciones, velocidad y duración, y lo que se considere importante.
- **Filtros:** operador y tipo de empresa; servicio y marca; estación y territorio (origen, destino, intermedia, comunidad, provincia, núcleo); vía y corredor.
- **Por fila:** ver en el visor, desplegar horarios del día, exportar CSV (tabla filtrada), ordenar por columna y comparar 2-3 rutas.
- **Actualización:** automática semanal con una GitHub Action.
- **Sin imágenes de Renfe** (decisión de Cabina, 20-11-2026).

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

## Siguiente tarea

Fase 2: la página `cabina-rutas.html`. Hecha cuando:
- cumpla los filtros, el orden, el buscador, los horarios desplegables, el CSV, la comparación y el enlace al visor;
- pase `check-a11y`, no tenga scroll horizontal a 375 px y cargue en menos de 2 s.

Antes de empezar: decidir con Borja la «ola 1» de Cabina que propone otra sesión (`manual-ferrocarriles/mapa/investigacion-cabina/PROPUESTA_CABINA.md`), porque toca los mismos archivos de Cabina.
