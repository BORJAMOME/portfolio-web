# Cabina: estado

Última actualización: 21-11-2026 (ola 1 de `manual-ferrocarriles/mapa/investigacion-cabina/PROPUESTA_CABINA.md`, cerrada).
La tabla de rutas tiene su propio estado en `RUTAS_ESTADO.md`.

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

## Pendiente

- **Corredores:** actualizar con Adif, porque Hermes es de 2024.
- **Tasa de accidentes:** el INE la permite calcular, pero hay que confirmar la unidad de los tren-km (tablas 24365 y 24366) antes de publicarla.
- **Choque de la alta velocidad en enero y febrero de 2026** (−23,4 % interanual): la Cabina lo muestra sin atribuirle causa, que está por verificar con fuentes oficiales.
- **Visor:** llevar las Cercanías de ancho ibérico e iryo a las fichas, para que tengan el mismo universo que Cabina.

**Riesgo:** `tools/build-cabina.mjs` tarda unos 60 s por el cálculo de km (Dijkstra por pareja). Si crece, conviene guardar en caché los grafos por variante.

## Análisis de la oferta (22-11-2026)

Página `cabina-analisis.html` (+ `.css`, `.js`), enlazada desde Cabina y desde la tabla de rutas. Diez lecturas, todas de **oferta** (trenes programados); la de competencia se quitó el 22-11-2026 porque repetía el capítulo de Cabina:

1. **Simulador de capitales:** listón de trenes directos al día con Madrid y de velocidad en línea recta → cuatro grupos (barras con número de capitales y población).
2. **Simulador de velocidad:** velocidad objetivo → qué rutas llegan por tipo de vía (dispersión km × duración y % por tipo).
3. **Rodeos:** las 12 rutas con más y con menos exceso sobre la recta (≥ 50 km en recta; por defecto, ≥ 3 trenes al día).
4. **Coste de una parada:** pendiente minutos ÷ paradas dentro de cada relación; mediana por servicio y ejemplo con selector.
5. **Espera media en Cercanías:** Σh² ÷ (2Σh) en la estación con más trenes de cada línea y en el sentido con más salidas (punta y valle).
6. **Fin de semana:** sábado y domingo en % del miércoles, por servicio y por núcleo.
7. **Horas de servicio:** primera y última salida de una ruta típica de cada servicio.
8. **Trenes por tramo:** mapa SVG propio (zoom, arrastre y clic; vistas «Todos», «Media y larga distancia» y «Cercanías»), carga diferida de `capas/analisis-mapa.json`. Una sola red (ejes IGN): Cercanías se casa con el eje por el que circula (punto cada 25 m → eje IGN más cercano a ≤ 35 m, en paralelo y sin ancho estándar; la línea cuenta si recorre ≥ 40 % del eje o 150 m). Casa el 99 % de su longitud; 11,6 km de vía «hs» reciben Cercanías (ancho ibérico compartido). Las rutas con trazado incompleto suman en sus tramos conocidos.
9. **Electrificación:** % de trenes·km bajo catenaria por servicio.
10. **Densidad de red:** m/km² y km por 100.000 habitantes por comunidad.

**Cómo se genera:** `node tools/build-cabina-analisis.mjs` (sin red, unos 6 s) → `capas/analisis.json` (≈ 130 KB) y `capas/analisis-mapa.json` (≈ 850 KB). `--check` en la CI y en la tarea semanal, que lo regenera después de `build-cabina`.

**Correcciones de datos hechas para esta página:**
- `build-rutas`: en Cercanías, `dur`/`durMin`/`par` solo con los trenes de extremo a extremo (la C5 salía con 3 min de tren más rápido; ahora 59). Nuevos datos aditivos: `oferta.capitales_trenes` y, en `rutas-actividad.json`, `tiempos`, `esperas` y `traces.carga`.
- `demografia.json`: 13 territorios con anillos mal anidados; en Cataluña, 195 estaciones caían fuera de la comunidad. Reparado con `tools/repair-demografia.mjs` (`--check` en la CI).
- Cada relación cuenta una vez (no por sentido); el rodeo negativo (≤ −2 %, imprecisión) cuenta como 0; en el mapa, Cercanías suma ida y vuelta.

**Comprobado:** `build-cabina-analisis --check`, `repair-demografia --check`, `build-cabina --check`, `check-links`, `version-assets --check`, `build-mapa --check`, `build-en --check`, `test-heatmap`, `check-heatmap`, `check-incidencias` y `check-a11y` (cabina, cabina-rutas y cabina-analisis) sin infracciones; escritorio y móvil sin scroll horizontal.

**Límites:** sin viajeros por ruta ni estación; en estaciones y túneles paralelos (Chamartín – Nuevos Ministerios) un eje puede recoger todas las líneas que entran; 12 rutas (24 trenes) sin recorrido en el catálogo no se dibujan; las caídas de fin de semana de Cercanías se leen por núcleo porque algunas líneas cambian de nombre el fin de semana.

## Auditoría de Cabina (22-11-2026): calidad e incidencias

- **Capítulo nuevo «3 · ¿Con qué calidad?»** (la pregunta rectora promete calidad y solo había un ranking de velocidad): espera en hora punta por núcleo de Cercanías, trenes del domingo por servicio y horas de servicio, con enlace a cada lectura del análisis. Lee `capas/analisis.json` (`cabina.js` · `renderCalidad`); sin ese archivo, el capítulo se oculta.
- **KPIs:** «Concentración» (sigue en el Pareto del capítulo 2) deja sitio a «Espera en hora punta» (mediana de las líneas de Cercanías) y «Servicio en domingo». Seis KPIs.
- **Incidencias:** titular con conclusión, avisos activos por tipo y por núcleo, y el histórico mensual y el listado plegados (de 2.389 a 535 px en escritorio). Detalle en `INCIDENCIAS.md`.
- **Duplicados:** se quita del análisis el capítulo de competencia (lo cubre Cabina).
- **Pendiente de la auditoría:** sustituir el gráfico «velocidad desde Madrid» (10 barras casi iguales) por el ranking de todas las capitales; titular de Red con el cruce red ↔ servicio (el 34 % de la red sin catenaria lleva el 7,7 % del servicio de media y larga distancia); confirmar «sin IVA» en la nota del precio; rotular el primer año en mercancías.
