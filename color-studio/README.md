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

No hace falta ninguna variable de entorno ni clave nueva: usa la sesión y la clave pública del área privada.

## Estructura

| Archivo | Qué hace |
|---|---|
| `area-privada-color.js` | Interfaz: Studio, Biblioteca, Armario y Calcetines. Solo pinta e interactúa. |
| `color-studio/engine.js` | Motor puro: HEX, CIELAB, ΔE00, familias, paletas, coincidencias, proporciones, extracción de color. |
| `color-studio/compose.js` | Lectura del conjunto (roles, relaciones, contraste, temperatura, repetición), direcciones con criterios con nombre (`MOVES`), comparación y paletas como inspiración. |
| `color-studio/socks.js` | Reglas de calcetines con identificadores (`RULES`), tipo de calzado y deduplicación de propuestas. |
| `color-studio/data.js` | Validación, importación JSON/CSV, duplicados, exportación y datos de ejemplo. |
| `color-studio/image.js` | Fotos en el navegador: validación, reducción sin EXIF y proveedor de visión `local`. |
| `css/color-studio.css` | Estilos (prefijo `cs-`), mobile-first. |
| `tools/test-color.mjs` | Pruebas del motor (`node --test tools/test-color.mjs`, sin dependencias). |
| `tools/check-color.mjs` | Pruebas de interfaz con Playwright y Supabase simulado (no toca la base real). |

## Decisiones

- **JavaScript con módulos ES, no TypeScript.** El sitio no tiene paso de build y la regla del repo es no añadir
  dependencias; el motor está separado de la interfaz y tiene sus pruebas igualmente.
- **Comparación en CIELAB con CIEDE2000.** Validado contra los pares publicados por Sharma, Wu y Dalal (2005).
  Umbrales orientativos: idéntica (mismo HEX), muy próxima (ΔE00 ≤ 5), próxima (≤ 10). La distancia es una señal de
  proximidad, no un juicio estético: no hay porcentajes de confianza ni puntuaciones.
- **Familias cromáticas** aproximadas en LCh, calibradas con colores de referencia. Marino, marrón y beige cuentan como
  neutros por convención de vestuario.
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
- **Outfits con `items` en JSON** (`slot`, `garment_id` o `hex` provisional, `weight`). Si una prenda se borra, el outfit
  lo muestra como «prenda eliminada» en vez de perder el registro.
- **Fotos**: se reducen a 1600 px y se recodifican (WebP o JPEG) en el navegador, lo que elimina EXIF y ubicación. Bucket
  privado; se descargan con la sesión. Borrar una prenda o cambiar su foto borra el archivo anterior.
- **Color de la foto**: k-means local sobre una copia de 96 px, ponderando el centro y rebajando el color del borde
  (probable fondo). Es una propuesta: siempre se corrige a mano.
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
- **Prendas reales primero.** Si ninguna encaja, el color se ofrece como **hipotético** (borde discontinuo y aviso
  «no tienes esta prenda»). Al aplicarlo entra en el borrador como color provisional, nunca como prenda.
- **Comparar y aplicar**: cada propuesta enseña Ahora / Propuesta, los cambios por hueco, qué cambia (contraste,
  acento, familias, intensidad, repetición, pantalón-calzado, temperatura, lectura) y el criterio. Aplicar guarda el
  conjunto de partida en el borrador (`original`) y permite volver a él. La dirección es estado de interfaz: no se
  guarda en `cs_outfits` (no hizo falta tocar el esquema).
- **Paletas que inspiran**: para cada color de la paleta, si ya está en el conjunto (y en qué prenda), qué prenda de tu
  armario podría representarlo (ΔE00 ≤ 12) o que no tienes ninguna, y su papel respecto al dominante (tonal, de apoyo o
  de contraste). «Comparar con mi conjunto» abre la propuesta `cr-paleta` de esa paleta concreta.

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
  primero. En formal, la continuidad primero y el contraste al final. Cada propuesta indica contraste cualitativo con
  pantalón y calzado (bajo < 10, medio < 25, alto), efecto buscado, qué la inspira y si tienes uno parecido (ΔE00 ≤ 12).
- **Fuentes de las convenciones**: [Permanent Style](https://www.permanentstyle.com/2018/12/the-rules-and-how-to-break-them-your-socks-should-match-your-trousers)
  (por defecto, calcetín del color del pantalón; con pantalón claro, un tono o dos más oscuro; harmonizar en vez de igualar
  es válido) y [Gentleman's Gazette](https://www.gentlemansgazette.com/how-to-combine-socks-shoes-pants/) (igualar
  exactamente el pantalón no es lo más logrado, mejor que igualar el zapato; enlazar con la parte de arriba). Lo de las
  deportivas blancas es convención informal extendida, no regla. Los umbrales de croma son decisiones propias.
- El estilo del calcetín (invisible, tobillero, media caña) no se registra: no se deduce ni se inventa.

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

## Limitaciones conocidas

- La estimación de superficie no usa la foto del outfit vestido (segmentación y solapes quedan para una fase posterior).
- Las propuestas no contemplan estampados en el calcetín ni su largo o material (no se registran).
- La temperatura y la relación entre colores son aproximaciones por tono; los materiales y texturas no intervienen
  porque el campo es texto libre y no se deducen.
- Las direcciones cambian como mucho una prenda por propuesta; no buscan combinaciones de varias prendas a la vez.
- Un color hipotético aplicado y guardado queda como «color a mano» (el aviso de hipotético vive solo en el borrador).
- La familia de un color es aproximada en los límites entre tonos (p. ej. camel/naranja, turquesa/verde).
- HEIC no se lee en navegadores de escritorio: el iPhone debe compartir la foto como JPEG.
- El borrador del Studio vive en `sessionStorage` (se pierde al cerrar la pestaña); lo guardado está en Supabase.
- Un proveedor de visión externo requeriría una Edge Function con la clave en el servidor; hoy solo existe el local.
