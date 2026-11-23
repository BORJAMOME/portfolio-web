# Estudio de diseño del explorador 3D · noviembre de 2026

Consulta de fuentes: **23 de noviembre de 2026**. Objetivo: estaciones y contexto reconocibles, terreno claro y una imagen más natural que la maqueta oscura anterior.

## Qué muestran las referencias

La visualización arquitectónica de 2026 combina lenguajes distintos. Hay presentaciones diurnas y suaves, y también escenas cinematográficas de alto contraste. **No existe una regla universal que obligue a usar tonos claros.** Aquí elegimos una presentación diurna por la preferencia del usuario y porque permite leer simultáneamente relieve, estaciones, carreteras y localidades.

| Fuente primaria | Evidencia consultada | Aplicación al visor |
| --- | --- | --- |
| [Chaos Architectural Visualization Showreel 2026](https://blog.chaos.com/architectural-visualization-showreel-2026), 14 oct. 2026 | Recopila trabajos de estudios como Binyan, Brick Visual y Recent Spaces en contextos urbanos y paisajísticos variados. Es una selección profesional, no una medición estadística de tendencias. | Cuidar composición y contexto. El efecto visual debe ayudar a reconocer un lugar. |
| [Chaos: Architectural Visualization Trends 2026](https://blog.chaos.com/top-7-trends-in-archviz-you-cant-ignore), 27 may. 2026 | La guía editorial del fabricante destaca materiales, contexto preciso y experiencias interactivas; también propone iluminación cinematográfica con sombras profundas. | Tomar la legibilidad y el contexto, sin imponer la estética oscura de algunas referencias. |
| [D5: Visual Proof y HIKARI Design Competition 2026](https://www.d5render.com/posts/entry-into-architectural-practice), 18 may. 2026 | El caso de Isadora Helena Nogueira muestra cómo iterar luz, atmósfera y materiales junto al diseño, incluyendo propuestas situadas en su paisaje. | Comparar variaciones con la misma cámara y conservar la coherencia espacial. |
| [Epic: Twinmotion Ambience Settings](https://dev.epicgames.com/documentation/twinmotion/ambience-settings?lang=en-US), documentación vigente | Separa entorno, cámara y render; permite ajustar cielo, iluminación, exposición y sombras. No es una recomendación de un único estilo visual. | Equilibrar sol y relleno de cielo antes de aumentar la exposición. Mantener detalle en luces y laderas en sombra. |
| [Esri: iluminación de escenas y mapas](https://pro.arcgis.com/en/pro-app/3.5/help/mapping/properties/set-illumination-for-maps-and-scenes.htm), documentación técnica | Describe iluminación, sombras y oclusión ambiental como ayudas para percibir profundidad en escenas geográficas. | Sombra suave y contraste suficiente para entender el volumen; estaciones y mapa base mantienen prioridad de lectura. |
| [Blender: Displays and Views](https://docs.blender.org/manual/en/5.0/render/color_management/displays_views.html), manual técnico | Explica AgX, exposición y balance de blancos. El transformado de visualización debe conservar una respuesta tonal coherente. | Portada con AgX y exposición moderada. El color del GLB sigue siendo un dato de material, independiente de la luz renderizada. |

Las decisiones siguientes son una **síntesis de diseño para este atlas**, no una afirmación de que todas las empresas de arquitectura e ingeniería utilicen estos valores.

## Dirección aplicada

- **Luz diurna como punto de partida:** sol neutro ligeramente cálido y relleno amplio del cielo. El relieve debe conservar volumen sin ocultar valles en negro.
- **Fondo claro frío:** gris blanco con un matiz de cielo, acompañado por una base mineral clara. Sin base negra ni entorno azul marino.
- **Material mate:** salvia y piedra de saturación moderada, con transiciones suaves. El color altimétrico no representa usos del suelo ni vegetación observada.
- **Contexto geográfico auténtico:** Positron aporta calles, agua, localidades y referencias territoriales. Las estaciones proceden del catálogo disponible. Un terreno iluminado por sí solo no aporta ese contexto.
- **Jerarquía:** terreno y mapa base discretos, vías y estaciones distinguibles, nombres legibles y selección clara. El detalle no debe competir con la orientación.
- **Comparación consistente:** misma geometría y misma cámara antes y después del ajuste visual. La captura exportada debe incluir escala y atribución.

No se generan edificios, vegetación ni texturas fotográficas ficticias a partir del MDT. La iluminación del explorador es una ayuda editorial para leer formas, no un estudio de soleamiento con fecha y hora reales.

## Ajustes reproducibles de Blender

`mapa/tools/build_terrain_blender.py` conserva el MDT, el sistema de coordenadas, las alturas del GLB **1×**, la malla de **257 × 257** puntos y los **131.072** triángulos. Cambian los colores y la presentación de la portada.

| Parámetro | Ajuste |
| --- | --- |
| Paleta sRGB por altitud | 0 m `#a3bfb1`; 550 m `#97b39a`; 1.000 m `#aec098`; 1.400 m `#c6c4a7`; 1.800 m `#d4ccb5`; 2.200 m `#e0d8c6`; 2.600 m `#efebe1` |
| Material | Rugosidad 0,92; metalicidad 0 |
| Portada | Cycles, CPU, 32 muestras, denoising, 960 × 640 |
| Luz principal | Sol neutro cálido, energía 3,0, ángulo 8° |
| Relleno | Cielo claro y fuente de área amplia; sombras conservadas |
| Gestión de color | AgX, Medium High Contrast, exposición +0,35 EV |
| Exageración de portada | **2×**, registrada en `guadarrama.json`; no altera la geometría exportada |

La paleta no equivale a una clasificación real del territorio. La luz y el color de un navegador pueden diferir del render Cycles; por eso el acabado final también necesita revisión visual dentro de Three.js, con Positron y las estaciones visibles.

## Aplicación en Three.js y cartografía

El modo inicial es Positron sobre el MDT, con estaciones y nombres del catálogo Renfe. El selector permite alternar con la paleta altimétrica natural. Se utiliza una iluminación diurna neutra y `NeutralToneMapping` para evitar dominantes y conservar el contraste del mapa; el modo cartográfico acota el sombreado por normales de la luz elegida para no quemar topónimos. Las luces son recursos de presentación, no un análisis solar fechado.

El fondo del explorador es `#edf2f3`, las sombras de contacto son suaves y la base deja de ser azul marino. El material de terreno usa rugosidad 1 y no tiene brillo metálico. Los rótulos de estaciones mantienen tamaño en pantalla y prioridad en la selección. El mapa aporta contexto geográfico real, no una textura inventada para aparentar detalle.
