# Cartografía, relieve y explorador 3D · noviembre de 2026

Rediseño del 24–25 de noviembre de 2026. Motores sin cambiar de versión: **MapLibre GL JS 5.24.1** (mapa plano e inclinado) y **Three.js r187** (explorador 3D). Datos: `tools/terreno/README.md`. Capturas y mediciones: `node tools/visor/capturas.mjs --out <carpeta>` (`--antes` omite los encuadres nuevos).

## Qué superficie se dibuja en cada modo

| Modo | Motor | Superficie |
| --- | --- | --- |
| Plano | MapLibre | Sombreado (`hillshade`) del MDT IGN mediante el protocolo `ign-dem://`, cargado del manifiesto `terrain-manifest.js`. |
| Inclinado | MapLibre | El mismo MDT como `raster-dem` (`setTerrain`). z8 en toda España, z12 (MDT25) en cuatro paisajes y z14 (MDT05) en dos zonas piloto. Por encima de lo disponible, el protocolo amplía la tesela antecesora con interpolación cúbica: no añade detalle, pero evita la rejilla que dejaba la bilineal en el sombreado. |
| Explorador 3D | Three.js | Malla generada en el navegador (`terrain-data.mjs`), con una densidad que sigue al MDT más fino de la zona (≈1,5 píxeles del MDT por celda) y tope de 560 celdas en escritorio y 320 en móvil. **Antes** se dibujaba en Guadarrama el GLB de Blender (257 × 257 puntos, ≈239 m). Ahora la malla del navegador es más densa (≈109 m en escritorio), así que el GLB solo se usa si la malla no lo supera o con `surface:'glb'`. El archivo se conserva. |

## Mapa (MapLibre)

- **Jerarquía de la red.** Contorno claro bajo la vía desde z6 (separa el trazo del sombreado, de los rellenos y de la ortofoto), halo de estado con puntero (`feature-state` `hover`) y selección, y trazo con el color y el ancho del tema (`capas.js`).
- **Ancho desconocido.** En «Ancho de vía» se distingue por color y, además, por forma (guiones claros superpuestos). `line-dasharray` con expresión por dato rompe la fuente en 5.24.1 sin avisar (la capa deja de cargar), por eso va en una capa aparte (`rail-unknown`).
- **Estaciones por escala.** La importancia sale de los trenes en día laborable de `capas/estaciones-oferta.json`:
  - Símbolo: z7 ≥ 120 trenes; z8 ≥ 40; z9 ≥ 8; desde z10, todas.
  - Rótulo: z8–9 ≥ 150; z10 ≥ 40; desde z11, todas, y ceden el sitio por prioridad (`symbol-sort-key`).
  - Los nombres pasan de las mayúsculas del catálogo a minúsculas con iniciales.
  - Los filtros con zoom se evalúan en niveles enteros.
- **Selección de estación.** Anillo `station-selected`. La estación se comparte con el explorador 3D.
- **Relieve a escala peninsular.** El sombreado se atenúa al alejarse (50 % en z5) para que mande la red.
- **Vista aérea PNOA** (selector «Mapa base»):
  - Servicio WMTS PNOA Máxima Actualidad del IGN (`OI.OrthoimageCoverage`, `GoogleMapsCompatible`), verificado con su GetCapabilities y con una tesela (CORS `*`, caché de un año).
  - La imagen se atenúa un poco (saturación −0,25 y brillo máximo 0,9) para que las vías y los rótulos destaquen.
  - El mapa cartográfico sigue siendo la vista inicial.

## Mapas base y relieve (25 de noviembre de 2026)

- **Botón «Estilo del mapa»** bajo el zoom: miniaturas de los siete fondos (`img/basemaps/`), mismo estado que el selector de «Territorio» y que el enlace (`b`). Teclado con flechas, Inicio/Fin y Esc.
- **Fondos**:
  - *IGN gris* (`IGNBase-gris`) e *IGN color* (`IGNBaseTodo`), WMTS `https://www.ign.es/wmts/ign-base`, comprobados con su GetCapabilities y con teselas de Francia y Portugal. Cubren todo el mundo, así que, como Positron, sustituyen la máscara exterior y los rótulos locales. La capa «Topografía IGN» (MTN ráster por WMS) sigue cubriendo solo España.
  - *Graybeard* y *Colorful* de [VersaTiles](https://docs.versatiles.org/guides/use_tiles_versatiles_org.html): estilos CC0 adaptados con `node tools/visor/adaptar-estilos.mjs` (mismas reglas que Positron: prefijos, tipografía local, sin iconos ni capas ferroviarias, rótulos en español). El servidor público no tiene clave ni garantía de servicio.
  - Descartados: CARTO Voyager/Dark Matter (licencia comercial restrictiva), Protomaps y MapTiler (requieren clave) y estilos oscuros (la simbología de la red está diseñada para fondo claro).
- **Sombreado**: se retira «Multidireccional» (tres luces sumaban contraste en cada ladera). Quedan *Suave* (`igor`), *Clásico* (`standard`), *Pendientes* (`combined`) y *Cenital* (`igor` con luz a 70°, sombras cortas y difusas). Un enlace antiguo con `multi` abre *Suave*.
- **Color del terreno** (`color-relief` sobre el mismo MDT): *Natural*, *Bosque*, *Meseta*, *Suizo* (tintas claras al estilo de Imhof) y *Pastel* (la anterior «Por altitud»). Sobre un fondo completo la tinta baja al 55 % para que se lean sus rótulos.

## Interfaz

- **«Plano / Inclinado»** son dos vistas del mismo mapa. **«Explorador 3D»** es otra herramienta, que se abre en una ventana sobre el mapa:
  - Usa el paisaje que contiene la estación seleccionada o el centro del mapa; si hay varios, el más pequeño (las zonas piloto tienen más detalle).
  - Si no hay ninguno, abre el más cercano y lo avisa.
- **Filtros activos sobre el mapa**:
  - El tema se muestra como contexto, con acceso a su panel.
  - Las demás etiquetas se quitan con su ×: selección del tema, estado, facetas de ancho y vías, capas combinables, mapa base e inclinación.
  - «Quitar todo» aparece con dos o más etiquetas.
  - En móvil se desplazan en una fila y se ocultan mientras el panel está abierto.
- **Leyenda.** Indica el fondo aéreo cuando está activo y el swatch discontinuo de «Sin determinar».
- **Transiciones breves** en las etiquetas y la ficha. Con `prefers-reduced-motion` no hay animación.

## Explorador 3D (Three.js)

- **Vías con grosor en pantalla.** `LineSegments2` y `LineMaterial` (`vendor/three/`, r187), con contorno claro y tres niveles: red base, trazados del tema (corredores, marcas, servicios o turismo, con su color del 2D) y tramo seleccionado. `LineBasicMaterial` se quedaba en 1 px porque WebGL ignora `linewidth`.
- **Sin parpadeo.** El terreno lleva `polygonOffset` y la línea va 6 m por encima, muestreada al paso de la malla. La altura es la del terreno, no la cota de la vía: los datos no incluyen túneles, viaductos ni rasante, y se indica en la escena.
- **Ortofoto PNOA local** en las zonas piloto («Mapa sobre el terreno → Ortofoto PNOA»). Es un JPEG de 2048 px recortado al encuadre exacto, alineado con la malla porque comparte la proyección (Mercator, norte arriba).
- **Rótulos de estación**: 10 como máximo (6 en móvil).

## Referencias consultadas (hasta el 25 de noviembre de 2026)

- [GetCapabilities del WMTS PNOA MA](https://www.ign.es/wmts/pnoa-ma?request=GetCapabilities&service=WMTS): capa, `TileMatrixSet` y formatos, consultados directamente.
- [GetCapabilities del WCS MDT del IGN](https://servicios.idee.es/wcs-inspire/mdt?request=GetCapabilities&service=WCS): coberturas de 5, 25, 200, 500 y 1000 m. No hay MDT02 por WCS.
- [Ficha del MDT02, 2ª cobertura, en el Centro de Descargas del CNIG](https://centrodedescargas.cnig.es/CentroDescargas/modelo-digital-terreno-mdt02-segunda-cobertura): COG por hoja MTN25, ETRS89 UTM y alturas ortométricas. La descarga exige reCAPTCHA.
- [Documentación de `LineMaterial` (three.js)](https://threejs.org/docs/pages/LineMaterial.html): `linewidth` en píxeles CSS con `worldUnits:false`; solo para `WebGLRenderer`.
- [Boletín de MapLibre de julio de 2026](https://maplibre.org/news/2026-08-02-maplibre-newsletter-jul-2026/): GL JS v6 es una versión con cambios incompatibles. Se mantiene la 5.24.1 del proyecto: la actualización no era necesaria para estos cambios y es un trabajo aparte.

No se consultó la documentación de Mapbox Standard. La jerarquía (contorno claro, halo de estado y densidad de rótulos por escala) es una síntesis propia sobre el motor existente.
