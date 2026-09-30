# i18n/ — versiones en inglés del portfolio

Las páginas en inglés (inglés británico) **no se editan a mano**: se generan desde la página
española, que es siempre la fuente.

| Página española (fuente) | Página inglesa (generada) | Diccionario |
|---|---|---|
| `index.html` | `en/index.html` | `i18n/index.en.json` |
| `sobre-mi.html` | `en/about.html` | `i18n/sobre-mi.en.json` |
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
   idiomas va en `keep`; URLs, scripts y cifras sueltas, en `raw`.

Reglas de estilo: inglés británico (*analyse*, *visualisation*, *learnt*), primera persona y
frases cortas, como el original. Cifras en formato británico: `€1,572,340.00` · `€1.57m` · `+23.98%`.
El dashboard del hero de la home se queda en español (decisión de Borja).

El selector ES | EN (`.ds-lang`, estilos en `shared.css`) se invierte solo en la versión inglesa.
Las páginas que aún no existen en inglés enlazan a su versión española.
