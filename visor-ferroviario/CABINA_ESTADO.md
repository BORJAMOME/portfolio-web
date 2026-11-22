# Cabina: estado

Última actualización: 22-11-2026 (ola 3: rediseño interactivo, sin commit todavía).
La tabla de rutas tiene su propio estado en `RUTAS_ESTADO.md`.

## Ola 3 (22-11-2026): interacción, marcas y filtros

- **Cabecera:** fuera la pregunta rectora y el texto de referencia; título más grande y pastilla con el día de los horarios y la próxima regeneración (el lunes siguiente a `oferta.json · generado`, que es cuando corre `rutas-semanal.yml`). `build-cabina` la escribe en `#ref-date` y `#ref-next`.
- **KPIs (6):** sin frases; botón «i» con definición y fuente. Población servida con mini barras (≥ 1 / ≥ 10 / ≥ 30 trenes), huecos con habitantes y % en barra, y KPI nuevo «Viajeros en 12 meses» (suma de los cuatro tipos del INE, 12 meses frente a los 12 anteriores: `mercado.viajeros.total12`).
- **Quitado:** cuota del tren frente a la UE y Renfe Mercancías (los datos siguen en `mercado.json`). El titular de «uso» ya no habla de mercancías.
- **Interacción:** tooltip único (`TIP`) en curvas, columnas, barras, puntos y mapa de calor; `lineChart` con guía y lectura al pasar el ratón.
- **Población servida:** clic (o botones de umbral) para elegir umbrales → «Ver los datos» muestra solo los elegidos con % y habitantes; la tabla completa sale en una ventana (`<dialog>`). Datos nuevos: `cobertura.curva_pob`.
- **Servicio:** filtro laborable / sábado / domingo; logos de marca; alta velocidad desglosada en AVE (con Euromed), Avlo, OUIGO e iryo; tabla de lunes a domingo (`familias[].dias`, `marcas_av`, de `build-rutas.mjs`). Salidas por hora con tooltip y mapa de calor (escala por servicio o común; se gira en móvil).
- **Pareto:** calculado en el navegador desde `oferta.estaciones` (lista de las 1.448 estaciones con municipio INE), con la estación de cada punto y la tabla de paradas por estación.
- **Estaciones:** un solo ranking filtrable por servicio (Cercanías, Regional, Alta velocidad, Avant, Intercity), comunidad, provincia y municipio. Sustituye a `top_ld` y `top_cer`.
- **Velocidad:** origen y destino a elegir entre las 112 relaciones entre capitales.
- **Viajeros:** líneas mes a mes por año (2019 y desde 2022; 2020–2021 solo en la tabla), selector de servicio, interanual y frente a 2019; tabla con todos los meses. Se actualiza con la tarea semanal (`build-cabina-mercado.mjs`), que recoge el mes nuevo del INE.
- **Colores de operador** (de los logos oficiales): Renfe #5b064b, AVE #001f4c, Avlo #5fcbc6 (con borde #2a8a85), OUIGO #e3006a, iryo #cb151b. Los anchos de vía, que usaban los colores antiguos, pasan a `g-std`, `g-met` y `g-mix`.
- **Ocupación:** fichas por operador (ocupación y % de viajeros) y puntos por corredor con cuota y viajeros en el tooltip.
- **Logos:** `img/marcas/*.svg`, Wikimedia Commons (dominio público): Cercanías, AVE (2026), Avlo, Intercity, OUIGO (el que usa es.wikipedia) e iryo. **Faltan Regional y Avant**: Wikimedia devolvió 429; el código oculta el logo si no existe.

**Comprobado:** `build-rutas` sin descargas reproduce `oferta.json` y `rutas.json` idénticos salvo la fecha antes de añadir campos; total de la semana del miércoles = 5.909 (igual que el KPI); curva de población monótona y % = habitantes ÷ población; `check-a11y` sin infracciones en `cabina.html` y `cabina-rutas.html`; `build-cabina --check`, `check-links`, `version-assets --check` y `sanity`; sin scroll horizontal a 390 px; filtros probados (Andalucía · Sevilla · Regional = 22 estaciones).

**Siguiente:** descargar `Renfe_Regional_Logotipo.svg` y `Renfe_Avant_Logotipo.svg` a `img/marcas/regional.svg` y `avant.svg` cuando Wikimedia deje de limitar. Validación: aparecen en «Trenes por servicio» sin 404 en consola.

## Qué es ahora

Cuadro de mando con una pregunta rectora: *¿qué servicio de tren recibe cada territorio de la España peninsular, con qué calidad y dónde están los huecos?*
- **Cabecera:** 5 KPIs (población servida, huecos, trenes un laborable, concentración y red electrificada). Cada uno lleva definición, referencia, fuente y fecha, y un enlace.
- **Capítulos:**
  1. ¿Dónde hay tren y dónde no?
  2. ¿Cuánto servicio y de qué calidad?
  3. ¿Quién compite en alta velocidad?
  4. ¿Qué red lo soporta?
  5. Método y límites (plegado).
- **Anexo plegado:** puertos y aeropuertos, turísticos, marcas, redes urbanas y catálogos.

**Cómo se genera:** todo se precalcula en `tools/build-cabina.mjs`, que también escribe los titulares en `cabina.html`. La página solo carga `capas/cabina.json` (76 KB); antes cargaba unos 5,5 MB de horarios y calculaba en el navegador. `cabina-datos.js` se ha eliminado.

## Decisiones que hay que mantener

- **Un solo universo de oferta:** todos los trenes de viajeros con horario público (Renfe AV/LD/MD, Cercanías de todos los núcleos, OUIGO e iryo), de `capas/oferta.json` (`tools/build-rutas.mjs`).
  - Adelanta el punto 4 de la ola 2: el GTFS de Cercanías de Renfe sí trae los horarios del ancho ibérico.
  - Las fichas del visor (`oferta.js`) aún no incluyen Cercanías ibérico ni iryo; el glosario lo dice.
- **Una cifra por concepto** (glosario en «Método y límites»):
  - km de alta velocidad = 3.681, por prestaciones. Los 3.357 de Hermes y los 4.199 de Adif AV se explican como otras medidas;
  - «alta velocidad» (trenes) = AVE, AVE Euromed, Avlo, iryo y OUIGO; Avant va aparte;
  - estaciones = 1.448 con tren, de 1.466 en los horarios; el catálogo de Renfe (1.020) y el de recorridos del visor (1.284) se citan como lo que son.
- **Ancho y electrificación sobre la misma base que la red** (19.559 km, ejes IGN con atributos), con las mismas correcciones que aplica el visor:
  - `capas/ancho.json`, que es `applyGauge`;
  - el relleno de `capas/lineas-adif.json`, que es `fillFromLine`.
  - Resultado: ancho conocido en el 98,5 % de los km, con la procedencia de cada km (IGN, Adif, inferido). La capa `ancho.json` suma 23.692 km porque incluye ejes sin atributos.
- **Población servida:** población municipal (INE, 1-1-2025) con una estación con ≥ N trenes al día a ≤ X km en línea recta. La distancia es 0 si la estación está dentro del término municipal y, si no, se mide desde el centroide. Con solo el centroide, Badajoz, Jerez o Cáceres salían «sin tren».
- **Huecos:** municipios de más de 20.000 habitantes sin estación con ≥ 10 trenes al día a ≤ 10 km.
- **Velocidad comercial** entre capitales:
  - tiempo: el del tren directo más rápido entre las dos ciudades (cualquier tren que pare en las dos);
  - distancia: camino más corto (Dijkstra) por los tramos IGN del recorrido inferido de una variante que pase por las dos estaciones;
  - si el recorrido tiene huecos y las estaciones son los extremos de la variante, la suma de sus tramos;
  - si no se pueden medir los km de ese tren, la pareja no sale.
- **OUIGO** (PDF): dos trayectos son el mismo tren si coinciden estación, hora y sentido (rumbo hacia la parada anterior o siguiente, a menos de 90°). Antes se fundían dos trenes de sentido contrario que se cruzan en Albacete a la misma hora. Corregido también en `oferta.js`, `build-rutas.mjs` y en la reconstrucción de la tabla de rutas.
- **Diseño:**
  - el color de énfasis va solo en lo que nombra el titular;
  - cada gráfico tiene «Ver los datos» con su tabla;
  - las tablas muestran 5–8 filas más «Ver las N»;
  - los colores de operador superan 3:1 sobre blanco (iryo, 3,24:1) y su luminancia es distinta entre vecinos;
  - «en proyecto» va con trama, porque el gris liso daba 1,54:1;
  - no queda texto en inglés.

## Cómo se comprobó

- **Cifras:**
  - el ancho suma 19.559 km;
  - los trenes un laborable (5.909) coinciden con la suma de familias de `oferta.json`;
  - OUIGO por estación es igual en el visor y en la tabla (Albacete 8, Chamartín 16, Alicante 6);
  - las distancias cuadran con las oficiales: Madrid–Barcelona 624 km, Madrid–València 395 y Madrid–Sevilla 469.
- **Página:**
  - 4.498 px en escritorio (objetivo, menos de 4.500; antes, 10.600) y 8.805 px en móvil (antes, 20.300);
  - sin scroll horizontal a 390 px;
  - sin errores de JavaScript ni «Calculando…».
- **Comprobaciones:** `check-a11y` sin infracciones en `cabina.html`, `cabina-rutas.html` e `index.html`; `check-links`, `version-assets --check`, `build-mapa --check`, `build-en --check` y `build-cabina --check`.

## Ola 2 (21-11-2026): uso, competencia en viajeros y precio

- **Capítulo nuevo «3 · ¿Cuánto se usa?»:**
  - viajeros por tipo de servicio (INE 20239): cuatro small multiples con la misma escala (índice 2019 = 100 sobre la suma móvil de 12 meses) y el énfasis solo en alta velocidad;
  - cuota del tren en el transporte por tierra, viajeros y mercancías, España frente a la UE y vecinos (Eurostat `tran_hv_psmod`, `tran_hv_frmod`);
  - mercancías: cuota de Renfe por año y total de t-km (CNMC `ds_24402`).
  - Datos: `capas/mercado.json`, de `node tools/build-cabina-mercado.mjs` (con red). Comprueba que larga distancia = alta velocidad + resto en todos los meses y, en mercancías, suma empresa a empresa (`TOTAL_EMPRESAS` solo trae ingresos).
- **Capítulo 4, «¿Quién compite en alta velocidad y a qué precio?»:** cuota de viajeros por corredor (barras al 100 %), cuota trimestral de Renfe, ocupación (viajeros-km ÷ plazas-km) y precio medio de 2025 en puntos.
  - Datos: `capas/cnmc.json` (`tools/build-cnmc.mjs`, de la sesión de la tabla de rutas; CC BY-SA 4.0).
  - El precio usa solo el año natural 2025, porque la CNMC cambió el método en el 1T 2026.
- **Cómo se integra:** `build-cabina.mjs` lee `mercado.json` y `cnmc.json` sin red, los incorpora a `cabina.json` y escribe los titulares de «uso» y «competencia» desde los datos. Si falta alguno, sus tarjetas no se pintan y el resto de la página funciona igual.
- **Comprobado:**
  - mismas cifras con dos implementaciones independientes: Node (este build) y pandas (`manual-ferrocarriles/mapa/investigacion-cabina/ola2/analisis.py`). Por ejemplo, AV +79,5 % frente a 2019, mercancías 9,82 mil millones de t-km con un 34,7 % de Renfe, y ocupación 75,4 / 71,3 / 82,6 %;
  - los viajeros 2025 por corredor cuadran con la nota de prensa de la CNMC del 17-07-2026;
  - `check-a11y` sin infracciones en `cabina.html` y `cabina-rutas.html` (corregido el contraste de las cifras de los paneles secundarios);
  - escritorio (1440) y móvil (390) sin errores ni scroll horizontal;
  - `build-cabina --check`, `check-links`, `version-assets --check`, `build-mapa --check` y `build-en --check`.
- **Coste:** la página pasa de 4.498 a unos 6.400 px en escritorio y de 8.805 a unos 13.100 en móvil.

## Pendientes de la ola 2 resueltos (21-11-2026)

- **Tasa de accidentes** (tarjeta «Accidentes significativos por millón de tren-km», capítulo de la red):
  - el INE da los tren-km (tabla 24365, series TF607 y TF605) como «Trenes-Km» sin escala, pero son **miles**: coinciden año a año con Eurostat `rail_tf_trainmv` (THS_TRKM). `build-cabina-mercado.mjs` lo comprueba en cada ejecución y falla si se separan más de un 1 %;
  - numerador: accidentes significativos de la tabla 24366 (suma de los seis tipos). 2025: 71 en 220,6 millones de tren-km = 0,32; media 2014–2019 = 0,25;
  - el INE y Eurostat (`tran_sf_railac`) no coinciden en todos los años (2019: 55 frente a 49; 2024: 63 frente a 57). Se usa el INE porque numerador y denominador salen de la misma fuente.
- **Caída de la alta velocidad en enero y febrero de 2026** (−23,4 %): ya no se dice «causa desconocida», sino dónde se concentra y con qué coincide:
  - CNMC `ds_24408`, 1T 2026 frente a 1T 2025: Madrid–Málaga/Granada −60,6 %, Madrid–Sevilla −27,0 %, Madrid–Barcelona −17,4 %, Madrid–Valencia −7,7 %, Madrid–Alicante −6,2 %;
  - coincide con el accidente de Adamuz (18-01-2026), tras el que se interrumpió la línea Madrid–Andalucía (comunicado del Ministerio de Transportes del 20-01-2026, enlazado en la nota);
  - ni el INE ni la CNMC atribuyen la causa, y la nota lo dice. Las limitaciones de velocidad en Madrid–Barcelona solo constan en prensa: no se citan.
- **Corredores (Hermes 2024):** revisados el 21-11-2026 con notas del Ministerio. Ningún tramo en obras o en proyecto se ha abierto. Murcia–Almería, Burgos–Vitoria y la Y vasca siguen en obras. València–La Encina tiene trenes a menos de 150 m porque va por la variante de ancho ibérico abierta en 2023, pero la línea de alta velocidad sigue en obras. La fecha de la revisión y su nota están en `build-cabina.mjs` (`corredores.verificado`) y se muestran en la tarjeta.
- **Comprobado:** `check-a11y` sin infracciones en `cabina.html`; escritorio (1440) y móvil (390) sin errores ni scroll horizontal; `build-cabina --check`, `check-links`, `version-assets --check`, `build-mapa --check` y `build-en --check`.

## Pendiente

- **Visor: Cercanías de ancho ibérico e iryo en las fichas**, para que tengan el mismo universo que Cabina. No es un cambio de este repositorio:
  - los horarios de las fichas (`capas/horarios.json` y `capas/servicios.json`) los genera `manual-ferrocarriles/mapa/preparar_horarios.py`;
  - hay que añadir los dos GTFS, asignar los trenes a tramos IGN (para `forEdge`) y vigilar el tamaño, porque las Cercanías de ancho ibérico multiplican los viajes;
  - además, `horarios.json` no se regenera cada semana y el GTFS de Cercanías dura unos 30 días, así que las fichas acabarán retrocediendo a la última semana cubierta.
  - **Criterio de validación:** los trenes un laborable de una estación coinciden en la ficha del visor y en `oferta.json` (por ejemplo, Madrid-Atocha Cercanías y Sevilla-Santa Justa).
- **Mantenimiento:** si Hermes publica una versión nueva de la capa TEN-T, volver a revisar los corredores y actualizar `corredores.verificado`. Cuando el INE publique 2026, la tasa de accidentes incluirá Adamuz y la tarjeta lo explica.

**Riesgo:** `tools/build-cabina.mjs` tarda unos 60 s por el cálculo de km (Dijkstra por pareja). Si crece, conviene guardar en caché los grafos por variante.
