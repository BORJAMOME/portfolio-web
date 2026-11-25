# Relieve y ortofoto del visor ferroviario

Scripts en Python para preparar datos oficiales del IGN/CNIG sin QGIS. Todos escriben en `visor-ferroviario/` los recursos optimizados que carga el visor y registran la procedencia en `visor-ferroviario/terrain-manifest.js`. Los originales se guardan en `.cache/terreno/`, que git ignora.

## Instalación (Windows, PowerShell, desde la raíz del repositorio)

```powershell
py -m pip install -r tools/terreno/requirements.txt
```

`rasterio` instala sus propias ruedas con GDAL; no hace falta OSGeo4W ni QGIS.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `py tools/terreno/preparar_relieve.py --listar` | Zonas piloto, encuadres y hojas MTN50 del MDT02. |
| `py tools/terreno/preparar_relieve.py --rehacer-mdt25` | Rehace las teselas z12 (MDT25) de los cuatro paisajes sin el rayado de las originales. **Ejecútalo antes que las zonas piloto**, porque estas se funden con las z12. |
| `py tools/terreno/preparar_relieve.py --zona guadarrama-cercedilla` | MDT05 del WCS del IGN → teselas Terrarium z13–z14 y ortofoto PNOA recortada. |
| `py tools/terreno/preparar_relieve.py --zona pajares-busdongo` | Lo mismo para Pajares. |
| `py tools/terreno/preparar_relieve.py --zona guadarrama-cercedilla --fuente local --dem C:\descargas\MDT02-ETRS89-HU30-0508-1-COB2.TIF C:\descargas\MDT02-ETRS89-HU30-0508-2-COB2.TIF …` | Usa GeoTIFF descargados a mano (p. ej. MDT02). |
| `--sin-ortofoto` | No descarga la ortofoto. |

Después de cualquier cambio: `node tools/version-assets.mjs`.

Orden completo para regenerar todo: `--rehacer-mdt25`, después cada `--zona` y por último `node tools/version-assets.mjs`.

## Fuentes y decisiones

- **MDT05** (`Elevacion25830_5`, WCS INSPIRE `https://servicios.idee.es/wcs-inspire/mdt`). Paso de malla de 5 m, derivado de la 1ª cobertura PNOA LiDAR, ETRS89 UTM 30 y alturas ortométricas en metros enteros (`int16`). Se descarga en bloques de 10 km.
- **MDT02 2ª cobertura** (CNIG). El Centro de Descargas exige navegador y reCAPTCHA: una descarga automatizada recibe `nav_signature=BOT_DETECTED`, así que el script **no** lo descarga. Para Guadarrama, filtra por «Hoja MTN50» `0508` y descarga `MDT02-ETRS89-HU30-0508-{1,2,3,4}-COB2.TIF` (COG en coma flotante, entre 4 y 113 MB cada hoja), y después usa `--fuente local`.
- **Salida.** Las zonas piloto se escriben en z14, a ≈7,2 m/píxel en Guadarrama: es lo que MapLibre aprovecha con mallas de terreno de 256 px. Con el MDT02 tendría sentido z15 a lo largo del trazado. El MDT25 se conserva para el resto de España.
- **Sin escalones.** Las teselas de detalle se funden con las z12 en una banda de 450 m en el borde de la zona, interpolando como lo hace el navegador. En el borde, el visor ve el mismo valor con las dos resoluciones.
- **Cuantización.** Los MDT del WCS llegan en enteros de 1 m. Se suavizan con un filtro binomial 5×5 (σ ≈ 1 píxel de origen) para que el sombreado no muestre bandas, se remuestrean en bilineal a EPSG:3857 y se guardan cuantizados a 0,25 m, que pesan la mitad que con 1/256 m.
- **Comprobación de la alineación.** El manifiesto guarda la diferencia con el MDT25 en cada zona. Una media cercana a 0 m indica que el sistema de referencia y la georreferenciación cuadran.
- **Ortofoto PNOA MA** (WMTS `https://www.ign.es/wmts/pnoa-ma`, capa `OI.OrthoimageCoverage`, `GoogleMapsCompatible`). Se recorta al encuadre exacto de la zona, con el norte arriba, en JPEG de 2048 px (≈6,6–7,3 m/píxel).
- **Nubes LAZ.** No se han descargado: ni los túneles, ni los viaductos ni la cota de la vía tienen hoy un dato de trazado que permita usarlas.

## Atribución

Obra derivada de MDT05/MDT25 IGN · CC BY 4.0 scne.es. Vista aérea: PNOA cedido por © Instituto Geográfico Nacional · CC BY 4.0. El visor muestra la atribución en el mapa (control de atribución), en el pie del explorador 3D y en la imagen exportada.

## Añadir otra zona

1. Añade la zona en `zonas.json` (`bbox` dentro de un paisaje con teselas z12 o, si no, con respaldo de z8; `zooms` `[13, 14]`).
2. `py tools/terreno/preparar_relieve.py --zona <id>`.
3. `node tools/version-assets.mjs`.

La zona aparece sola en el panel «Relieve» y en el explorador 3D (`detail_areas` del manifiesto).
