# Demografía e infraestructuras

Consulta y corte: **20 de noviembre de 2026**. Implementado en la fuente `mapa/`
y en la copia pública `portfolio-web-visor-ferroviario/visor-ferroviario/`.

## Población

| Capa | Referencia | Fuente oficial | Tratamiento |
|---|---|---|---|
| Municipios | 1 enero 2025, definitivo | [INE, Censo anual 2025](https://www.ine.es/dyngs/Prensa/CensoVariables2025.htm) | 8.132 municipios; población `n_personas`, códigos INE |
| Densidad municipal | 1 enero 2025 | [INE, cartografía y población del Censo 2025](https://www.ine.es/servergis/rest/services/Hosted/Censo_2025___N%C3%BAmero_de_personas/FeatureServer/1) | Elaboración propia: habitantes / superficie de la geometría original en ETRS89 / UTM 30N, en km² |
| Población provincial | 1 octubre 2026, provisional | [INE, ECP, tabla 59589](https://www.ine.es/jaxiT3/Tabla.htm?t=59589) | Sexo total, todas las edades, 52 provincias/ciudades autónomas |
| Población autonómica | 1 octubre 2026, provisional | Misma tabla ECP del INE | Suma de provincias por código autonómico INE; 19 comunidades/ciudades autónomas |
| Límites provinciales y autonómicos | Servicio consultado el 20 noviembre 2026 | [IGN, SignA, unidades administrativas](https://certiserviciosgis.ign.es/servicios/rest/services/signa/01_unidades_administrativas/MapServer) | Se excluyen territorios no adscritos sin población estadística |

El último censo municipal disponible al corte es 2025. La ECP de octubre de 2026
fue publicada el [12 de noviembre de 2026](https://www.ine.es/dyngs/Prensa/ECP3T26.htm).
No se atribuye la fecha 2026 a las cifras municipales ni se calcula una densidad
municipal mezclando una población provincial de 2026 con habitantes de 2025.

Controles nacionales del generador: **49.128.297** habitantes del Censo 2025;
**49.935.642** en la ECP de octubre de 2026, tanto por provincias como por comunidades.
Las geometrías se generalizan en el servidor a 0,001 grados para el visor; la
superficie usada para la densidad es la anterior a esa generalización. Densidad
planimétrica de elaboración propia, no una cifra de densidad publicada por el INE.
La cartografía orienta la lectura territorial; no se usa para mediciones catastrales.

El archivo local incluye España completa. El visor mantiene su encuadre peninsular;
los totales de las comunidades son sus totales administrativos completos.

## Infraestructuras

- **Carreteras**: [IGN, SignA, redes de transporte](https://certiserviciosgis.ign.es/servicios/rest/services/signa/02_redes_transporte/MapServer), capas 20 (autovías), 21 (autopistas), 22 (convencionales). Teselas en directo mediante `export`, con renderer ocre propio. Se puede elegir toda la red o solo autopistas/autovías. La fecha de consulta no equivale a la antigüedad de cada tramo. Se verificó una respuesta real PNG del servicio con el renderer solicitado. Requiere red; los errores de carga se comunican en el estado del mapa.
- **Mercancías**: [IGN, IGR-RT, nodos de estación ferroviaria](https://api-features.idee.es/collections/railwaystationnode). Copia local de **713 instalaciones peninsulares**, 260 de uso `cargo` y 453 `mixed`. Se conserva el código de estación y la clasificación original. No se deduce el uso a partir del nombre.

El inventario de mercancías incluye terminales, estaciones y apartaderos. **No es
un censo exclusivo de terminales Adif operativas**. Se explicita en el control, las
fuentes y cada ficha. La consulta automatizada de [PISERVI de Adif](https://piservi.adif.es/piservi/portal)
devolvió HTTP 403; no se atribuyeron estados operativos ni capacidades no contrastadas.

## Diseño, estado y actualización

Relleno salvia secuencial (`#edf4f1` a `#12483f`), bajo las vías. Umbrales fijos de
densidad: 10, 50, 100, 500 y 1.000 hab./km². Opacidad regulable de 15 a 85 %.
Los límites municipales se combinan con cualquiera de los tres rellenos; se elige
un único relleno a la vez para evitar que se oculten entre sí. Carreteras ocre y
mercancías ciruela. La leyenda y las exportaciones incluyen las capas activas.

El enlace y las consultas guardadas conservan `d` (demografía) e `ix`
(infraestructuras). Los enlaces antiguos siguen siendo válidos.

Regeneración: `python preparar_demografia.py`. El generador fija deliberadamente
las ediciones al corte anterior y valida recuentos, códigos y totales; para una
nueva edición hay que actualizar las fechas, las fuentes y esos controles juntos.
No requiere paquetes de Python adicionales. Las descargas tienen reintentos y
las consultas municipales se paginan por identificador estable.

Verificación: `node validar_demografia.cjs` (datos reales y navegador con WebGL),
además de las comprobaciones existentes de estado, vista y exportación.
