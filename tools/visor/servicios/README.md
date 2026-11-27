# Generador de `servicios.json`

Genera `visor-ferroviario/capas/servicios.json`, es decir, las variantes comerciales, las paradas y el trazado inferido sobre la red IGN, a partir de los GTFS oficiales de Renfe y del horario oficial de OUIGO. Solo usa la librería estándar de Python (3.12 o posterior).

## Cadena de ejecución

Desde esta carpeta:

```bash
# 1. GTFS de Renfe -> catálogo intermedio (variantes, paradas, calendarios)
python preparar_servicios.py --national <google_transit.zip> --commuter <gtfs_renfe_cercanias.zip> \
  --out <tmp>/services-catalog.json --cutoff AAAA-MM-DD

# 2. Solo si cambia fuentes/ouigo-horario-2026-2027.json: reescribe el bloque «ouigo» de fuentes/servicios-fuentes.json
python preparar_fuentes_ouigo.py fuentes

# 3. Catálogo + fuentes curadas + red IGN -> capa del visor
python preparar_capa_servicios.py --catalog <tmp>/services-catalog.json --cutoff AAAA-MM-DD \
  [--out ../../../visor-ferroviario/capas/servicios.json]

# 4. Mismos GTFS + catálogo + servicios.json -> horas de paso del buscador de rutas
python preparar_horarios.py --national <google_transit.zip> --commuter <gtfs_renfe_cercanias.zip> \
  --catalog <tmp>/services-catalog.json [--out ../../../visor-ferroviario/capas/horarios.json]
```

La tarea semanal (`.github/workflows/rutas-semanal.yml`) ejecuta los pasos 1, 3 y 4 cada lunes con la fecha del día como corte, antes de `tools/build-rutas.mjs`. Así el mapa (servicios.json), el buscador (horarios.json) y la tabla (rutas.json) usan los mismos horarios.

- `--cutoff` vale `2026-11-16` por defecto, que es el corte de la capa publicada. Use la misma fecha en los pasos 1 y 3.
- `--out` del paso 3 escribe por defecto en `visor-ferroviario/capas/servicios.json`. Para probar, apúntelo a una carpeta temporal.
- En Windows, ejecute con `python -X utf8`. Sin esa opción, `preparar_fuentes_ouigo.py` falla al imprimir «→» en la consola.

Fuentes de los GTFS (URL en `SOURCES`, dentro de `preparar_servicios.py`):

- Renfe AV/LD: `https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip`
- Renfe Cercanías: `https://opendata.euskadi.eus/transport/moveuskadi/renfe_cercanias/gtfs_renfe_cercanias.zip`

## Entradas

| Archivo | Qué es | ¿Se versiona? |
|---|---|---|
| `fuentes/servicios-fuentes.json` | Fuentes citadas, relaciones OUIGO, iryo, Alvia, nocturnos y renombres (curado) | Sí |
| `fuentes/ouigo-horario-2026-2027.json` | Trenes leídos del PDF oficial «Horarios OUIGO 2026-2027» | Sí |
| `fuentes/espana.json` | Contorno de España, para marcar las estaciones dentro o fuera | Sí |
| `fuentes/red-ign.geojson` | Red IGN (RailwayLink) con 7 decimales; solo `id`, `length_m` y `nominalgauge` | Sí (24 MB) |
| Zips GTFS de Renfe | Se descargan en cada ejecución | No |
| `services-catalog.json` | Intermedio del paso 1 (unos 25 MB) | No |

`fuentes/red-ign.geojson` es JSON compacto, con solo las claves que lee `red_grafo.py` (no lleva los `type` de GeoJSON). Hay que conservar el orden de los tramos, porque el índice de cada tramo es el número que guarda `edges` en `servicios.json`. No sirve `visor-ferroviario/datos.json` en su lugar: redondea las coordenadas a 5 decimales, lo que une nodos cercanos y cambia el trazado de 136 variantes.

## Procedencia

Copiado de `manual-ferrocarriles/mapa/` (commit `5ca0ec3`, 25-11-2026; `preparar_horarios.py`, 27-11-2026). Solo se han cambiado las rutas, los argumentos `--out`, `--catalog` y `--cutoff`, y la red, que ahora es la versión reducida de `fuentes/`. Con `renfe-avld-2026-11-16.zip` y `renfe-cercanias-2026-11-17.zip`, la cadena reproduce byte a byte el `servicios.json` publicado.
