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

## Pendiente (ola 2 de la propuesta)

- **CNMC:** viajeros, ocupación (viajeros-km ÷ plazas-km), cuota y precio por corredor. Ya hay análisis en `manual-ferrocarriles/mapa/investigacion-cabina/ola2/`. Licencia CC BY-SA.
- **INE:** sparklines mensuales de viajeros; **Eurostat:** comparación con la UE.
- **Corredores:** actualizar con Adif, porque Hermes es de 2024.
- **Visor:** llevar las Cercanías de ancho ibérico e iryo a las fichas, para que tengan el mismo universo que Cabina.

**Riesgo:** `tools/build-cabina.mjs` tarda unos 60 s por el cálculo de km (Dijkstra por pareja). Si crece, conviene guardar en caché los grafos por variante.
