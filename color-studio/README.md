# Color Studio

Herramienta personal de color aplicada al vestuario, en el área privada (`#/color`).
Construye outfits con prendas reales, lee cómo funciona su color (jerarquía, contraste, temperatura,
repetición), explora tres direcciones (Minimalista, Equilibrada, Creativa) comparando cada propuesta con
el conjunto original, usa las paletas de la biblioteca como inspiración y elige calcetines explicados.
No elige la ropa por ti: propone, explica y deja decidir.

## Puesta en marcha

1. Supabase → SQL Editor → ejecutar `supabase/color-studio.sql` (una vez; es idempotente).
   Crea `cs_garments`, `cs_palettes`, `cs_outfits`, sus políticas RLS (solo `is_member()`)
   y el bucket privado `armario` (solo JPEG/PNG/WebP, 5 MB). Requiere `area-privada.sql`.
2. Recargar el área privada. Sin el paso 1, la pestaña lo explica y ofrece el modo ejemplo.
3. Reversión (destructiva): vaciar el bucket `armario` desde Storage y ejecutar `supabase/color-studio-rollback.sql`.
4. Inspiración (opcional, después de 1): ver [Inspiración](#inspiración).

No hace falta ninguna variable de entorno ni clave nueva: usa la sesión y la clave pública del área privada.

## Estructura

| Archivo | Qué hace |
|---|---|
| `area-privada-color.js` | Interfaz: Studio, Biblioteca, Armario y Calcetines. Solo pinta e interactúa. |
| `color-studio/engine.js` | Motor puro: HEX, CIELAB, ΔE00, familias, paletas, coincidencias, proporciones, extracción de color. |
| `color-studio/compose.js` | Lectura del conjunto (roles, relaciones, contraste, temperatura, repetición), direcciones con criterios con nombre (`MOVES`), comparación y paletas como inspiración. |
| `color-studio/socks.js` | Reglas de calcetines con identificadores (`RULES`), tipo de calzado y deduplicación de propuestas. |
| `color-studio/data.js` | Validación, importación JSON/CSV, duplicados, exportación y datos de ejemplo. |
| `color-studio/image.js` | Fotos en el navegador: validación, reducción sin EXIF, miniatura opcional y proveedor de visión `local`. |
| `color-studio/inspiration.js` | Inspiración: paleta de una foto de outfit, validación, duplicados (enlace y huella dHash), búsqueda, filtros, orden, referencias parecidas y paleta para la Biblioteca. |
| `css/color-studio.css` | Estilos (prefijo `cs-`), mobile-first. |
| Versiones | Los imports entre módulos llevan `?v=` (lo escribe `node tools/version-assets.mjs`): la página y los módulos piden la misma URL de cada dependencia, así se descarga una vez y no se mezclan versiones tras publicar. |
| `tools/test-color.mjs` | Pruebas del motor (`node --test tools/test-color.mjs`, sin dependencias). |
| `tools/check-color.mjs` | Pruebas de interfaz con Playwright y Supabase simulado (no toca la base real). |

## Decisiones

- **JavaScript con módulos ES, no TypeScript.** El sitio no tiene paso de build y la regla del repo es no añadir
  dependencias; el motor está separado de la interfaz y tiene sus pruebas igualmente.
- **Comparación en CIELAB con CIEDE2000.** Validado contra los pares publicados por Sharma, Wu y Dalal (2005).
  Umbrales orientativos: idéntica (mismo HEX), muy próxima (ΔE00 ≤ 5), próxima (≤ 10). La distancia es una señal de
  proximidad, no un juicio estético: no hay porcentajes de confianza ni puntuaciones.
- **Familias cromáticas** aproximadas en LCh, calibradas con colores de ropa (tabla en `tools/test-color.mjs`). Marino,
  marrón, beige y caqui claro cuentan como neutros por convención de vestuario; un marino muy saturado (croma ≥ 45)
  pasa a azul. Nombres propios para oliva, caqui, mostaza, ocre, teja y azul petróleo.
- **Gama sRGB**: un color calculado que no cabe en sRGB se lleva a la gama reduciendo el croma con la misma
  luminosidad y tono; antes se recortaba cada canal y cambiaba el tono.
- **Proporciones = estimaciones.** Superficie de una prenda = peso ÷ suma de pesos × 100. Pesos por defecto (hipótesis
  editable): pantalón 35, parte superior 30, exterior 25, calzado 10, accesorio 3, calcetines 2. La distribución cromática
  reparte esa superficie entre los colores de cada prenda (si se definió su reparto; si no, cuenta el principal) y agrupa
  colores casi indistinguibles (ΔE00 < 3). Los porcentajes mostrados se redondean con el mayor resto para sumar 100.
  El peso visual percibido no se calcula; por eso la distribución se puede ajustar a mano.
- **No se guarda lo derivable**: familia, distribución estimada y recomendaciones se recalculan. Solo se guarda la
  distribución si se ajustó a mano.
- **Procedencia en la paleta** (tipo, título, URL, notas) en lugar de una tabla de fuentes: para uso personal no compensa.
  Cada color conserva el valor registrado (`original`) y su HEX normalizado. Las paletas «Libro» son datos introducidos por
  la persona; la herramienta no verifica ni importa contenido del libro.
- **Outfits con `items` en JSON** (`slot`, `garment_id` o `hex` provisional, `weight` y, solo con `hex`, `hypothetical: true` si era un color propuesto que no tienes). Si una prenda se borra, el outfit
  lo muestra como «prenda eliminada» en vez de perder el registro.
- **Fotos**: se reducen a 1600 px y se recodifican (WebP o JPEG) en el navegador, lo que elimina EXIF y ubicación. Bucket
  privado; se descargan con la sesión. Borrar una prenda o cambiar su foto borra el archivo anterior.
- **Color de la foto**: k-means local sobre una copia de 96 px, ponderando el centro. El fondo se detecta agrupando
  los píxeles del borde (hasta 3 colores, para fondos de rayas o con dibujo) y se rebaja. Dos grupos del mismo tono que
  solo difieren en luz (≤ 30 de L, croma proporcional) se tratan como sombra y se funde el más oscuro en el más claro.
  Los neutros no se funden. No corrige el balance de blancos: con luz cálida, un blanco sale crudo. Es una propuesta:
  siempre se corrige a mano.
- **Cuentagotas** (`engine.sampleColor`): con una foto recién elegida, se toca un punto de la prenda (o se mueve con las
  flechas e Intro) y se toma la media, en luz lineal, de un cuadrado de 7 × 7 píxeles de una copia de ≤ 480 px. En ese
  modo la foto se ve entera, sin recorte, para que el punto tocado sea el que se mide. Tampoco corrige el balance de
  blancos: el formulario aconseja luz natural indirecta, sin flash, y fondo liso blanco o gris. Con una foto ya guardada
  no hay cuentagotas (habría que volver a descargarla para leer sus píxeles); basta con volver a elegirla.
- **Modo ejemplo**: datos inventados en memoria, señalados en pantalla, que nunca se guardan ni se mezclan con los reales.

## Intro de bienvenida

Al entrar en Color Studio, una capa a pantalla completa (#FBFBFB) revela el nombre con una máscara
(transform + opacidad, 0,9 s, curva ease-out del sitio, 80 ms de desfase entre palabras) y dibuja una línea fina debajo.
Código: bloque `INTRO` de `area-privada-color.js` y estilos `csi-` al final de `css/color-studio.css`; se quita borrando ambos.

- Corre en paralelo a la carga real: se retira cuando termina la animación (≈2 s en total) **y** la aplicación ya está pintada.
  Nunca retiene más de 6 s; un error o una sesión caducada la quitan al momento.
- Una vez por carga de la página: no se repite al cambiar de sección ni al volver desde otra pestaña; recargar es una entrada nueva.
  Sin `localStorage` ni cookies.
- Un clic o una tecla la adelantan; salir de `#/color` durante la intro la quita.
- Espera hasta 700 ms a la fuente Newsreader para que el título no cambie de letra a mitad del movimiento.
- `prefers-reduced-motion`: no se muestra. Es decorativa (`aria-hidden`); el título real sigue siendo el `h1` de la página.

## Composición y direcciones (Color Studio 2.0)

Tres capas separadas en `compose.js`: **hechos** calculados, **criterios** de estilismo con nombre y una **lectura**
orientativa. Nada de eso es una puntuación: no hay porcentajes de estilo ni «outfit perfecto».

- **Hechos**: luminosidad, croma y tono (LCh), temperatura aproximada por tono (cálida, fría, intermedia o neutra si
  el croma < 8), ΔE00, superficie estimada. **Relación** entre dos colores: casi igual (ΔE00 ≤ 5), entre neutros, color
  sobre neutro, tonal (hueco de tono ≤ 20°), análoga (≤ 50°), complementaria (≥ 130°; en LCh azul y naranja quedan a
  ~140°) o contraste de tono; contraste de luminosidad bajo (< 15), medio (< 35) o alto. «Apagado» = croma < 35 en ambos.
- **Jerarquía sugerida** (orientación, no medida): dominante = más superficie; acento = < 15 %, no neutro, croma ≥ 25 y
  ΔE00 > 15 con todos los colores mayores; el resto, apoyo. La superficie no es peso visual: se dice en pantalla.
- **Lectura**: más cerca de lo minimalista (sin acentos, ≤ 1 familia fuera de los neutros, croma medio < 22, sin contraste
  fuerte), de lo creativo (≥ 2 acentos, contraste complementario o de tono con croma ≥ 30 entre dos colores con ≥ 10 %,
  ≥ 3 familias o un acento con croma ≥ 65) o equilibrada.
- **Direcciones**: cada una prueba sus criterios (`MOVES`) en orden y enseña como mucho dos propuestas distintas
  (mismos huecos con ΔE00 ≤ 5 = repetida; igual al original = descartada).
  - Minimalista: `min-apagar` (prenda neutra o apagada en lugar del color más intenso; si es un accesorio o un
    calcetín y no hay sustituto, quitarlo) y `min-tonal` (parte de arriba en la familia del pantalón).
  - Equilibrada: `eq-reducir` (con dos acentos, uno pasa a apoyo), `eq-repetir` (repetir un color en otra zona: un
    calcetín que repite el pantalón es continuidad, no cuenta) y `eq-apoyo` (sobre una base solo neutra, un color apagado).
  - Creativa: `cr-paleta` (color de una paleta relacionada que el conjunto no usa; las de libro primero), `cr-acento`
    (complementario, de contraste o análogo en una prenda pequeña) y `cr-repetir` (el acento en dos zonas).
  - **Dos prendas a la vez** (`par-prendas`): solo si el conjunto aún no se lee en esa dirección y ningún cambio de una
    prenda real lo consigue. Se prueban parejas de prendas reales en los huecos ocupados, con poda: las 4 más prometedoras
    por hueco (minimalista, las más apagadas; equilibrada, las que repiten un color de otra zona; creativa, las más intensas
    sin pasarse del contexto) y 240 combinaciones como mucho. De las que alcanzan la lectura, gana la que menos cambia la
    intensidad media. Ocupa un hueco libre o sustituye a una propuesta hipotética. Tarda unos milisegundos.
- **Qué prenda te falta** (`wardrobeGaps`): reúne los colores hipotéticos que proponen las tres direcciones para el
  conjunto, agrupados por hueco y color (ΔE00 ≤ 10), con las direcciones que abrirían y el criterio. No valora el
  armario ni es una lista de la compra; si las tres direcciones se resuelven con prendas reales, lo dice.
- **Prendas reales primero.** Si ninguna encaja, el color se ofrece como **hipotético** (borde discontinuo y aviso
  «no tienes esta prenda»). Al aplicarlo entra en el borrador como color provisional, nunca como prenda.
- **Comparar y aplicar**: cada propuesta enseña Ahora / Propuesta, los cambios por hueco, qué cambia (contraste,
  acento, familias, intensidad, repetición, pantalón-calzado, temperatura, lectura) y el criterio. Aplicar guarda el
  conjunto de partida en el borrador (`original`) y permite volver a él. La dirección es estado de interfaz: no se
  guarda en `cs_outfits` (no hizo falta tocar el esquema).
- **Paletas que inspiran**: para cada color de la paleta, si ya está en el conjunto (y en qué prenda), qué prenda de tu
  armario podría representarlo (ΔE00 ≤ 12) o que no tienes ninguna, y su papel respecto al dominante (tonal, de apoyo o
  de contraste). «Comparar con mi conjunto» abre la propuesta `cr-paleta` de esa paleta concreta.
- **Relación por familia** (`rankPalettesByFamily`): si hay menos de tres paletas con colores próximos (ΔE00 ≤ 10), se
  completan con paletas que tienen al menos dos colores de la misma familia y luminosidad parecida (|ΔL| ≤ 15) que el
  conjunto. Se marcan como «Relación por familia» y nunca como coincidencia. Con un armario neutro típico pasan de
  0–1 a 3–5 paletas de Wada que relacionan dos colores o más. `cr-paleta` las usa solo si ninguna paleta próxima da propuesta.

## Studio en el móvil

En una columna (< 1100 px) los bloques se ordenan por tarea: prendas → dirección → calcetines → composición → paletas →
ajuste manual y cálculo → mis outfits. «Guardar outfit» queda fijo encima de la barra inferior en cuanto hay una prenda.
En escritorio el orden no cambia. Se hace con CSS (`order` y las clases `cs-o-*`), sin duplicar la vista.

## Calcetines

El calcetín está entre el pantalón y el calzado: tres propuestas por reglas explícitas (`RULES` en `socks.js`), siempre
distintas entre sí (ΔE00 > 10). Si no hay datos para tres de verdad, se enseñan menos y se explica.

- **Continuidad**: familia del pantalón. Pantalón muy oscuro (L < 22): su color; medio: un punto más oscuro (−6 L);
  claro (L > 65): uno o dos tonos más oscuro (−12 L). Si tienes un calcetín a ΔE00 ≤ 8, se propone ese. Sin pantalón,
  sigue al calzado.
- **Coordinación**: en este orden, blanco/crudo de unas deportivas blancas; un color de unas deportivas de color que
  también esté en otra prenda; colores de arriba (en minimalista, neutros primero; si no, el color primero); secundarios
  del dibujo del pantalón y de la parte de arriba; el calzado; tono sobre tono a distancia clara de la continuidad.
- **Contraste**: paleta de la biblioteca relacionada (las de libro primero) → secundario que ya existe en el conjunto →
  calculado (opuesto al pantalón si tiene tono, o al color más intenso; análogo en minimalista). Debe distar > 15 del
  pantalón y del calzado y tener croma ≥ 15; no se elige «el más lejano»: se busca el croma objetivo
  (formal 25, smart casual 40, informal 55; −10 minimalista, +10 creativa) y, en formal o con zapato formal, tonos profundos.
- **Tipo de calzado**: se deduce de la subcategoría o el nombre del calzado (bota, mocasín, deportiva, running, oxford…;
  `inferShoeType`) y se corrige en la guía; el tono de una deportiva (blanca, oscura, de color) sale de su color. Añade
  notas (mocasín, bota, técnica, oscura) y activa reglas de coordinación; no prohíbe nada.
- **Orden**: minimalista continuidad → coordinación → contraste; equilibrada coordinación primero; creativa contraste
  primero. En formal, la continuidad primero y el contraste al final. Cada propuesta indica el contraste cualitativo frente al
  pantalón y frente al calzado, por separado (ΔE00 bajo < 10, medio < 25, alto), efecto buscado, qué la inspira y si tienes uno parecido (ΔE00 ≤ 12).
- **Fuentes de las convenciones**: [Permanent Style](https://www.permanentstyle.com/2018/12/the-rules-and-how-to-break-them-your-socks-should-match-your-trousers)
  (por defecto, calcetín del color del pantalón; con pantalón claro, un tono o dos más oscuro; harmonizar en vez de igualar
  es válido) y [Gentleman's Gazette](https://www.gentlemansgazette.com/how-to-combine-socks-shoes-pants/) (igualar
  exactamente el pantalón no es lo más logrado, mejor que igualar el zapato; enlazar con la parte de arriba). Lo de las
  deportivas blancas es convención informal extendida, no regla. Los umbrales de croma son decisiones propias.
- **Largo y grosor** (`sockFit`): por tipo de calzado; sin tipo, por formalidad. Zapato formal: largo o media caña, fino;
  mocasín: invisible o media caña, fino; bota: media caña o largo, medio o grueso; deportiva: tobillero, invisible o media
  caña; técnica: tobillero o media caña técnico; náutico o alpargata: invisible. Son convenciones, no reglas. Si la
  referencia es el invisible, se avisa de que el color no se verá. El largo de tus calcetines se deduce de su subcategoría
  o nombre (`inferSockLength`: invisible, tobillero, media caña/crew, largo/ejecutivo); entre dos calcetines tuyos de
  color parecido gana el de un largo adecuado, y si el tuyo no encaja con el calzado se dice. Sin esquema nuevo: si
  no lo anotas, no se juzga.
- Los colores que escribes en la guía solo cuentan al pulsar «Actualizar propuestas» y solo cambian la guía: el bloque de
  calcetines del Studio usa siempre los colores reales del outfit.

## Referencias de Sanzo Wada (348 combinaciones)

Las combinaciones de *A Dictionary of Color Combinations* son las referencias de la biblioteca. No están en el repositorio:
se generan en local y se importan a mano.

```bash
node tools/color-studio/wada-import.mjs [salida.json] [--from colors.json]
```

- Fuente: [mattdesl/dictionary-of-colour-combinations](https://github.com/mattdesl/dictionary-of-colour-combinations) (MIT),
  recopilado originalmente por Dain M. Blodorn Kim. Commit y huella SHA-256 fijados en el script: si el dataset cambia, falla.
- Resultado comprobado: 348 paletas (120 de 2 colores, 120 de 3, 108 de 4; el libro no tiene de 5), 159 colores, sin duplicados.
- Cada color guarda el CMYK del libro como `original` y el HEX convertido (aproximado, perfil SWOP v2 → sRGB) como valor normalizado,
  más su nombre y capítulo. Origen «Libro», con nota de procedencia: no verificado contra el ejemplar impreso.
- Para importar: Biblioteca → Importar → elegir el JSON → revisar → confirmar.

## Importación y exportación

- JSON: exportación de Color Studio (`format: "color-studio"`, `version: 1`), lista de paletas o lista de listas de HEX.
- CSV con cabecera: `nombre`, `colores` (HEX separados por espacio, `|` o `;`), `etiquetas`, `origen`, `fuente`, `url`, `notas`.
- Máximo 2 MB y 500 paletas. Se revisa fila a fila (errores y duplicados frente a la biblioteca y al propio archivo) antes de importar.
- Guardar una URL no descarga su contenido. No hay scraping.
- Exportar descarga un JSON con paletas, prendas y outfits; las fotos no viajan (solo su ruta).

## Inspiración

Archivo personal de outfits encontrados en internet (`#/color/inspiracion`, segunda sección de Color Studio).
Guarda la imagen y el enlace, extrae la paleta en el dispositivo y la deja usar como referencia en el Studio.

**Puesta en marcha**

1. SQL Editor → `supabase/color-studio-inspiracion.sql` (requiere `color-studio.sql` y `opciones.sql`; idempotente, no toca datos).
   Crea `cs_inspirations` con RLS **por dueño** (`owner = auth.uid()`, que pone la base; además `is_member()`), una política
   restrictiva para que la carpeta `inspiracion/<usuario>/` del bucket `armario` solo la use su dueño y los estilos iniciales.
2. Vuelve a ejecutar solo las funciones `ap_opcion_renombrar` y `ap_opcion_eliminar` de `opciones.sql` (ahora actualizan también
   estilos y colecciones de las referencias). El archivo entero vuelve a crear las opciones del Fichero que hubieras borrado.
3. Opcional: `supabase functions deploy inspiracion-meta --no-verify-jwt` para «Leer enlace» (ver su `README.md`). Sin ella todo funciona
   y la página lo dice: el enlace se guarda y la imagen se añade a mano.
4. Comprobación: en Inspiración aparece el estado vacío (no el aviso de «Falta preparar»), y en Configuración, «Estilos de inspiración».
5. Reversión (destructiva): borrar la carpeta `inspiracion` del bucket y ejecutar `supabase/color-studio-inspiracion-rollback.sql`.

**Decisiones**

- **Tabla propia**, no `cs_outfits` ni `cs_garments`: una referencia no es una prenda ni un conjunto tuyo. Nunca entra en el armario.
- **Paleta en JSONB** (`[{ hex, weight, source }]`), como `cs_palettes`: se lee y se edita entera, en orden, y no se consulta por color en la base.
  RGB, Lab y familia se derivan del HEX; no se guardan. `weight` = % estimado de presencia en los píxeles analizados (0–100, suma 100).
  `source` = `auto` o `manual` (corregido). `palette_status`: `none`, `auto` (por revisar), `reviewed` o `failed`.
- **Extracción**: la misma de las prendas (`engine.extractDominantColors`: k-means local, fondo del borde rebajado, sombras fundidas) con hasta 8
  grupos y descartando los < 3 %. El número de colores depende de la foto. Incluye piel, fondo o accesorios si se ven: por eso es una
  estimación editable (cambiar, quitar, añadir, ajustar pesos o volver a extraer) y nunca bloquea el guardado.
- **Clasificación**: estilos (varios), temporadas (lista fija: primavera, verano, otoño, invierno, entretiempo), colecciones (varias), favorita,
  valoración 1–5, notas privadas y fecha de publicación si se conoce. Estilos y colecciones son las listas `inspiracion.estilo` e
  `inspiracion.coleccion` de `ap_opciones`: se crean desde el formulario y se renombran o eliminan en Configuración, que actualiza las referencias.
  Estilos iniciales: Casual, Smart casual, Formal, Minimalista, Streetwear, Workwear y Deportivo («Inspiración de temporada» no es un estilo: es la temporada).
- **Rejilla uniforme 4:5**, no mampostería: conserva el orden de lectura y de teclado, y las fotos de outfits suelen ser verticales.
  La foto es la protagonista; debajo, título, estilo y fuente, y la paleta como franja. Sin foto, la tarjeta enseña la paleta.
- **Imágenes**: se reducen en el navegador (1600 px, sin EXIF) y se guarda también una miniatura de 640 px para las tarjetas, que se
  descargan solo al acercarse a la pantalla (IntersectionObserver). El detalle descarga la grande. Nada se enlaza a webs externas
  (la CSP lo impide y la referencia no depende de que la web original siga viva).
- **Enlaces**: el navegador no puede leer otras webs (CORS), así que «Leer enlace» usa la Edge Function `inspiracion-meta` (Open Graph,
  solo miembros, protegida contra SSRF). Lo que no consigue lo dice («Obtenido: título, fuente. La imagen no se ha podido descargar…»).
- **Duplicados**: mismo enlace normalizado (sin `utm_*`, `fbclid`, ancla, `www` ni barra final) o imagen casi igual (dHash de 64 bits, ≤ 6 bits
  distintos). Avisan y se guardan si se confirma.
- **Usar en Studio**: copia la paleta a la Biblioteca (origen «Página web» o «Fotografía», etiqueta `inspiración`, nota de que es una
  estimación de la foto) o reutiliza la idéntica que ya exista, y la deja elegida como referencia del Studio. A partir de ahí trabaja el
  motor de siempre (Paletas que inspiran, Comparar, `cr-paleta`) sin cambios. La paleta de la Biblioteca es una copia: corregir después la de la
  referencia no la cambia (volver a pulsar crea otra si ya no es idéntica).
- **Con tu armario**: para cada color, la prenda con el color principal más próximo (ΔE00 ≤ 12, `compose.adaptPalette`). Avisa de que
  coincidir en color no basta para reproducir un look.
- **Referencias parecidas**: mismo criterio que la Biblioteca (`engine.rankPalettes`), con al menos dos colores en común (ΔE00 ≤ 10).
- **Rendimiento**: se cargan todas las filas de una vez (son metadatos y paletas pequeñas); las imágenes, perezosas. Con miles de referencias
  habría que paginar.

## Limitaciones conocidas

- Inspiración: la paleta es de la foto entera (no segmenta la ropa: fondo y piel pueden aparecer) y no corrige el balance de blancos.
  Instagram, Pinterest y otras redes suelen bloquear «Leer enlace». Las colecciones y estilos se comparten entre miembros (`ap_opciones`);
  las referencias, no. No hay cuentagotas sobre la foto de una referencia.

- La estimación de superficie no usa la foto del outfit vestido (segmentación y solapes quedan para una fase posterior).
- Las propuestas no contemplan estampados en el calcetín ni su material; el largo solo cuenta si se anota en la subcategoría.
- La temperatura y la relación entre colores son aproximaciones por tono; los materiales y texturas no intervienen
  porque el campo es texto libre y no se deducen.
- Las direcciones cambian como mucho dos prendas por propuesta, y dos solo si con una no basta; no exploran tres o más.
- La familia de un color es aproximada en los límites entre tonos (p. ej. camel/naranja, turquesa/verde).
- HEIC no se lee en navegadores de escritorio: el iPhone debe compartir la foto como JPEG.
- El borrador del Studio vive en `sessionStorage` (se pierde al cerrar la pestaña); lo guardado está en Supabase.
- Un proveedor de visión externo requeriría una Edge Function con la clave en el servidor; hoy solo existe el local.
