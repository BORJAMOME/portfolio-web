# Color Studio

Herramienta personal de color aplicada al vestuario, en el área privada (`#/color`).
Construye outfits con prendas reales, mira cómo se reparte el color, compáralo con una biblioteca
de paletas de referencia y recibe propuestas de calcetines explicadas.

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
| `color-studio/socks.js` | Reglas de calcetines con identificadores (`RULES`). |
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

## Calcetines

Tres propuestas por reglas explícitas (`RULES` en `socks.js`): **Segura** (color del pantalón, o del calzado si no hay
pantalón), **Coordinada** (un color de la parte de arriba o de un accesorio; si no lo hay, el calzado o un tono más oscuro)
y **Con contraste** (un color de la paleta de la biblioteca que más se relaciona con el outfit y que este aún no usa; si
no hay ninguna, el tono opuesto al color con más presencia con la saturación limitada por la formalidad). La preferencia
cambia el orden; en formal, la segura va primero y el contraste al final. Cada propuesta indica si tienes un calcetín
parecido (ΔE00 ≤ 12).

## Importación y exportación

- JSON: exportación de Color Studio (`format: "color-studio"`, `version: 1`), lista de paletas o lista de listas de HEX.
- CSV con cabecera: `nombre`, `colores` (HEX separados por espacio, `|` o `;`), `etiquetas`, `origen`, `fuente`, `url`, `notas`.
- Máximo 2 MB y 500 paletas. Se revisa fila a fila (errores y duplicados frente a la biblioteca y al propio archivo) antes de importar.
- Guardar una URL no descarga su contenido. No hay scraping.
- Exportar descarga un JSON con paletas, prendas y outfits; las fotos no viajan (solo su ruta).

## Limitaciones conocidas

- La estimación de superficie no usa la foto del outfit vestido (segmentación y solapes quedan para una fase posterior).
- Las propuestas no contemplan estampados en el calcetín.
- La familia de un color es aproximada en los límites entre tonos (p. ej. camel/naranja, turquesa/verde).
- HEIC no se lee en navegadores de escritorio: el iPhone debe compartir la foto como JPEG.
- El borrador del Studio vive en `sessionStorage` (se pierde al cerrar la pestaña); lo guardado está en Supabase.
- Un proveedor de visión externo requeriría una Edge Function con la clave en el servidor; hoy solo existe el local.
