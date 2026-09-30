# ds/ — manual «Data Storytelling y diseño de dashboards»

Todo lo que usa el manual vive aquí. Las páginas se quedan donde están sus URL:

| URL | Archivo | Qué es |
|---|---|---|
| `/data-storytelling.html` | `data-storytelling.html` | Versión española. **Es la fuente**: aquí se edita. |
| `/en/data-storytelling.html` | `en/data-storytelling.html` | Versión inglesa (inglés británico). **Se genera** con `tools/build-en.mjs` (común a todo el portfolio), no se edita a mano. |

```
ds/
├─ README.md            este mapa
├─ manual.css           estilos del manual
├─ manual.js            motor: capítulos, dashboards, visuales (script clásico, defer)
├─ main.js              capa de movimiento y materiales (módulo): arranca lo de abajo
├─ cover.js             portada: gráfico de la variante (semitono / rotativa)
├─ chapters/            comportamiento propio de algunos capítulos
├─ motion/              movimiento reutilizable (entradas, cifras, progreso…)
├─ materials/           grano de papel
├─ webgl/ · shaders/    cristal y linterna (WebGL)
├─ i18n/
│  ├─ en.page.json      traducción del HTML: frase en español → inglés
│  └─ en.js             traducción de los textos que genera manual.js (dashboards, etiquetas, cifras)
└─ img/
   ├─ og-es.png         imagen para compartir (español)
   └─ og-en.png         imagen para compartir (inglés)
```

## Cómo se traduce

1. Edita **solo** `data-storytelling.html` (y `manual.js` si cambias un visual).
2. Ejecuta `node tools/build-en.mjs data-storytelling --missing`. Regenera la versión inglesa y lista en
   `ds/i18n/en.missing.json` las frases nuevas o cambiadas que aún no tienen traducción
   (mientras tanto, aparecen en español).
3. Añade esas frases a `ds/i18n/en.page.json` → `units` y vuelve a ejecutar el script.
   Lo que es igual en los dos idiomas (marcas, siglas) va en `keep`.
4. Si cambias un texto que genera `manual.js`, añade su traducción en `ds/i18n/en.js`.
   Las cifras van en formato británico: `€1,572,340.00` · `€1.57m` · `+23.98%`.

El selector ES | EN del menú (`.ds-lang`, estilos en `shared.css`) es el mismo que el de la home y,
en el manual, al cambiar de idioma te deja en el mismo capítulo.

## Versiones de caché

Al cambiar `manual.css` o `manual.js`, sube su `?v=` en `data-storytelling.html` y vuelve a
generar la versión inglesa (copia las mismas versiones).
