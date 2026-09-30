# i18n/ — versiones en inglés del portfolio

Las páginas en inglés (inglés británico) **no se editan a mano**: se generan desde la página
española, que es siempre la fuente.

| Página española (fuente) | Página inglesa (generada) | Diccionario |
|---|---|---|
| `index.html` | `en/index.html` | `i18n/index.en.json` |
| `sobre-mi.html` | `en/about.html` | `i18n/sobre-mi.en.json` |
| `descargas.html` | `en/downloads.html` | `i18n/descargas.en.json` |
| `power-bi.html` | `en/projects.html` | `i18n/power-bi.en.json` |
| `casa-origen.html` | `en/casa-origen.html` | `i18n/casa-origen.en.json` |
| `data-storytelling.html` | `en/data-storytelling.html` | `ds/i18n/en.page.json` + `ds/i18n/en.js` (textos del JS) |

## Cómo se usa

```
node tools/build-en.mjs                  # regenera todas las páginas inglesas
node tools/build-en.mjs index --missing  # una sola, y guarda lo que falta por traducir
```

1. Edita **solo** la página española.
2. Ejecuta el script. Te dice cuántas frases faltan; con `--missing` las guarda en
   `*.missing.json` (no se sube a git).
3. Añade esas frases al diccionario (`units`) y vuelve a ejecutar. Lo que es igual en los dos
   idiomas va en `keep`; las cadenas literales de los `<script>` (tarjetas, JSON-LD), en `js`
   (clave y valor exactos, tal como están en el código); URLs y lo demás, en `raw`.

Reglas de estilo: inglés británico (*analyse*, *visualisation*, *learnt*), primera persona y
frases cortas, como el original. Cifras en formato británico: `€1,572,340.00` · `€1.57m` · `+23.98%`.
El dashboard del hero de la home se queda en español (decisión de Borja).

El selector ES | EN (`.ds-lang`, estilos en `shared.css`) se invierte solo en la versión inglesa.
Las páginas que aún no existen en inglés enlazan a su versión española.

## Recordar el idioma

`lang.js` (en la raíz) se carga en el `<head>` de cada página que tiene las dos versiones. Guarda la
elección del selector ES | EN y, si alguien eligió inglés, cualquier página con versión inglesa se abre
directamente en inglés, aunque llegue por un enlace español (y al revés). Solo actúa tras una elección
explícita: la primera visita y los buscadores ven la página que piden. Al añadir una página nueva con
versión inglesa: enlaces `hreflang` + `<script src="./lang.js"></script>` + selector `.ds-lang`.
