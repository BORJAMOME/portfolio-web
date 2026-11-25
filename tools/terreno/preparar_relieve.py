#!/usr/bin/env python3
"""Relieve detallado y ortofoto de las zonas piloto del visor ferroviario.

Genera teselas Terrarium (las mismas que ya usa el visor) a partir de un MDT
oficial del IGN/CNIG, las funde en el borde con el MDT25 existente para que no
haya escalones, recorta una ortofoto PNOA para el explorador 3D y registra la
procedencia en visor-ferroviario/terrain-manifest.js.

Fuentes de elevación (una por ejecución):
  --fuente mdt05   WCS oficial del IGN (Elevacion25830_5, MDT05 derivado de
                   PNOA LiDAR). Se descarga solo: es la ruta por defecto.
  --fuente local   GeoTIFF/COG que tú hayas descargado (p. ej. MDT02 del Centro
                   de Descargas del CNIG, que exige navegador y reCAPTCHA):
                   --dem ruta1.tif ruta2.tif ...

Uso (Windows, PowerShell, desde la raíz del repositorio; guía: tools/terreno/README.md):
  py -m pip install -r tools/terreno/requirements.txt
  py tools/terreno/preparar_relieve.py --rehacer-mdt25
  py tools/terreno/preparar_relieve.py --zona guadarrama-cercedilla
  py tools/terreno/preparar_relieve.py --zona guadarrama-cercedilla --fuente local --dem C:\\descargas\\MDT02-ETRS89-HU30-0508-1-COB2.TIF ...
  py tools/terreno/preparar_relieve.py --zona pajares-busdongo --sin-ortofoto
  py tools/terreno/preparar_relieve.py --listar

Los originales se guardan en .cache/terreno/ (ignorada por git); en el
repositorio solo quedan las teselas PNG y la ortofoto JPEG optimizadas.
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np
import requests
from PIL import Image

try:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.merge import merge
    from rasterio.transform import from_bounds
    from rasterio.warp import reproject
except ImportError:  # pragma: no cover - mensaje para Windows
    sys.exit("Falta rasterio: py -m pip install -r tools/terreno/requirements.txt")

ROOT = Path(__file__).resolve().parents[2]
VISOR = ROOT / "visor-ferroviario"
TILES = VISOR / "terrain-ign"
MANIFEST = VISOR / "terrain-manifest.js"
ASSETS = VISOR / "assets" / "terrain"
CACHE = ROOT / ".cache" / "terreno"
ZONES = Path(__file__).with_name("zonas.json")

WCS = "https://servicios.idee.es/wcs-inspire/mdt"
WMTS = ("https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default"
        "&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0"
        "&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}")
HEADERS = {"User-Agent": "visor-ferroviario-relieve/1.0 (script de preparación de datos)"}
EARTH = 40075016.68557849
HALF = EARTH / 2
TILE = 256
BLEND_M = 450  # banda de fusión con el MDT25 en el borde de la zona (metros sobre el terreno)


# --------------------------------------------------------------------------- geometría
def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def tile_bounds_3857(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    size = EARTH / 2 ** z
    return (-HALF + x * size, HALF - (y + 1) * size, -HALF + (x + 1) * size, HALF - y * size)


def tile_to_lonlat(x: float, y: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))


def footprint(zone):
    """bbox geográfico de las teselas de menor zoom que cubren la zona (lo que se va a escribir)."""
    zmin = min(zone["zooms"])
    keys = tiles_for_bbox(zone["bbox"], zmin)
    x0, x1 = min(k[1] for k in keys), max(k[1] for k in keys) + 1
    y0, y1 = min(k[2] for k in keys), max(k[2] for k in keys) + 1
    west, north = tile_to_lonlat(x0, y0, zmin)
    east, south = tile_to_lonlat(x1, y1, zmin)
    return [west, south, east, north]


def tiles_for_bbox(bbox, z):
    x0, y0 = lonlat_to_tile(bbox[0], bbox[3], z)
    x1, y1 = lonlat_to_tile(bbox[2], bbox[1], z)
    return [(z, x, y) for x in range(int(x0), int(x1) + 1) for y in range(int(y0), int(y1) + 1)]


# --------------------------------------------------------------------------- Terrarium
QUANT_M = 0.25  # cuantización vertical de salida: invisible en el sombreado y comprime mucho mejor que 1/256 m


def encode_terrarium(h: np.ndarray, step: float = QUANT_M) -> np.ndarray:
    h = np.round(h.astype(np.float64) / step) * step
    v = np.clip(h + 32768.0, 0, 65535.996)
    r = np.floor(v / 256)
    g = np.floor(v) - r * 256
    b = np.floor((v - np.floor(v)) * 256)
    return np.dstack([r, g, b]).astype(np.uint8)


def decode_terrarium(rgb: np.ndarray) -> np.ndarray:
    rgb = rgb.astype(np.float64)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def read_tile(z, x, y):
    path = TILES / str(z) / str(x) / f"{y}.png"
    if not path.exists():
        return None
    return decode_terrarium(np.asarray(Image.open(path).convert("RGB")))


def read_tile_or_parent(z, x, y):
    """Tesela z/x/y o, si no existe, su antecesora ampliada (lo mismo que hace el visor)."""
    for parent in range(z, -1, -1):
        shift = z - parent
        data = read_tile(parent, x >> shift, y >> shift)
        if data is None:
            continue
        if shift == 0:
            return data
        size = TILE >> shift
        ox, oy = (x - ((x >> shift) << shift)) * size, (y - ((y >> shift) << shift)) * size
        crop = Image.fromarray(data[oy:oy + size, ox:ox + size].astype(np.float32), "F")
        return np.asarray(crop.resize((TILE, TILE), Image.BILINEAR), dtype=np.float64)
    raise SystemExit(f"Sin MDT de respaldo para {z}/{x}/{y}")


# --------------------------------------------------------------------------- descargas
def get(url, params=None, retries=4, timeout=120):
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
            if r.status_code == 200:
                return r
            raise RuntimeError(f"HTTP {r.status_code}")
        except Exception as error:  # red inestable: reintento con espera creciente
            if attempt == retries - 1:
                raise RuntimeError(f"No se pudo descargar {url}: {error}") from error
            time.sleep(2 ** attempt)


def download_wcs_mdt05(zone_id, bbox, coverage="Elevacion25830_5", res=5, folder_name="mdt05"):
    """Descarga un MDT del WCS del IGN (por defecto el MDT05) en bloques de 10 km (EPSG:25830)."""
    from pyproj import Transformer

    tr = Transformer.from_crs(4326, 25830, always_xy=True)
    xs, ys = zip(*[tr.transform(lon, lat) for lon in (bbox[0], bbox[2]) for lat in (bbox[1], bbox[3])])
    margin = 300  # metros: margen para el remuestreo en los bordes
    x0, x1 = math.floor((min(xs) - margin) / res) * res, math.ceil((max(xs) + margin) / res) * res
    y0, y1 = math.floor((min(ys) - margin) / res) * res, math.ceil((max(ys) + margin) / res) * res
    folder = CACHE / zone_id / folder_name
    folder.mkdir(parents=True, exist_ok=True)
    step = 10000 if res <= 5 else 50000
    files, requests_log = [], []
    for bx in range(x0, x1, step):
        for by in range(y0, y1, step):
            ex, ey = min(bx + step, x1), min(by + step, y1)
            path = folder / f"{folder_name}_{bx}_{by}_{ex}_{ey}.tif"
            params = {"service": "WCS", "version": "2.0.1", "request": "GetCoverage",
                      "CoverageId": coverage, "format": "image/tiff",
                      "subset": [f"x({bx},{ex})", f"y({by},{ey})"]}
            if not path.exists():
                print(f"  WCS {coverage} {path.name}")
                r = get(WCS, params=params)
                if not r.content.startswith((b"II*\x00", b"MM\x00*")):
                    raise RuntimeError(f"El WCS no devolvió un GeoTIFF para {path.name}: {r.text[:200]}")
                path.write_bytes(r.content)
            files.append(path)
            requests_log.append(requests.Request("GET", WCS, params=params).prepare().url)
    return files, requests_log


def binomial_smooth(dem: np.ndarray, passes: int = 1) -> np.ndarray:
    """Filtro binomial 5×5 ([1,4,6,4,1]/16 por eje) que respeta los huecos (NaN).

    El MDT05 del WCS llega en enteros de 1 m: en laderas suaves esos escalones
    y el paso de 5 m (UTM) a ~9,6 m (Mercator) producen bandas en el sombreado.
    Un suavizado de ~1 píxel de origen las elimina sin perder la forma.
    """
    kernel = np.array([1, 4, 6, 4, 1], np.float64) / 16
    valid = ~np.isnan(dem)
    values = np.where(valid, dem, 0).astype(np.float64)
    weight = valid.astype(np.float64)
    for _ in range(passes):
        for axis in (0, 1):
            pad = [(2, 2) if a == axis else (0, 0) for a in range(2)]
            v, w = np.pad(values, pad, mode="edge"), np.pad(weight, pad, mode="edge")
            n = dem.shape[axis]
            values = sum(k * np.take(v, range(i, i + n), axis=axis) for i, k in enumerate(kernel))
            weight = sum(k * np.take(w, range(i, i + n), axis=axis) for i, k in enumerate(kernel))
    out = np.where(weight > 0.5, values / np.maximum(weight, 1e-9), np.nan)
    out[~valid] = np.nan
    return out.astype(np.float32)


def load_dem(files):
    """Mosaico de los GeoTIFF de origen. Devuelve (array float32 con NaN, transform, crs, info)."""
    sources = [rasterio.open(f) for f in files]
    crs = sources[0].crs
    if any(s.crs != crs for s in sources):
        raise SystemExit("Los MDT de origen tienen sistemas de referencia distintos; usa un solo huso.")
    array, transform = merge(sources, nodata=-32767, dtype="float32")
    info = {"crs": crs.to_string(), "resolution_m": [abs(transform.a), abs(transform.e)],
            "dtype": sources[0].dtypes[0], "nodata_origen": sources[0].nodata,
            "unidades": "metros (alturas ortométricas según el IGN)"}
    for s in sources:
        s.close()
    dem = array[0].astype(np.float32)
    # Sin datos: el valor declarado, el relleno del mosaico y cotas imposibles en la Península.
    dem[(dem <= -1000) | (dem > 4000)] = np.nan
    if np.issubdtype(np.dtype(info["dtype"]), np.integer):
        dem = binomial_smooth(dem)
        info["suavizado"] = "binomial 5×5 (σ≈1 px de origen) por estar cuantizado en enteros de 1 m"
    return dem, transform, crs, info


# --------------------------------------------------------------------------- MDT25 de referencia
def reference_heights(z_ref, bounds3857, width, height):
    """Altura que el visor ya muestra (teselas MDT25 de nivel z_ref) en una rejilla 3857.

    Interpola igual que el navegador (centros de píxel, bilineal sobre alturas
    descodificadas), para que la fusión del borde coincida con el respaldo real.
    """
    left, bottom, right, top = bounds3857
    size = EARTH / 2 ** z_ref / TILE
    xs = left + (np.arange(width) + 0.5) * (right - left) / width
    ys = top - (np.arange(height) + 0.5) * (top - bottom) / height
    px = (xs + HALF) / size - 0.5
    py = (HALF - ys) / size - 0.5
    gx0, gx1 = int(math.floor(px.min())) - 1, int(math.floor(px.max())) + 2
    gy0, gy1 = int(math.floor(py.min())) - 1, int(math.floor(py.max())) + 2
    tx0, tx1, ty0, ty1 = gx0 // TILE, gx1 // TILE, gy0 // TILE, gy1 // TILE
    mosaic = np.full(((ty1 - ty0 + 1) * TILE, (tx1 - tx0 + 1) * TILE), np.nan)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            data = read_tile_or_parent(z_ref, tx, ty)
            mosaic[(ty - ty0) * TILE:(ty - ty0 + 1) * TILE, (tx - tx0) * TILE:(tx - tx0 + 1) * TILE] = data
    px -= tx0 * TILE
    py -= ty0 * TILE
    ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
    fx, fy = px - ix, py - iy
    a = mosaic[np.ix_(iy, ix)]
    b = mosaic[np.ix_(iy, ix + 1)]
    c = mosaic[np.ix_(iy + 1, ix)]
    d = mosaic[np.ix_(iy + 1, ix + 1)]
    fx, fy = fx[None, :], fy[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------------- teselas
def build_tiles(zone_id, zone, dem, transform, crs):
    zooms = sorted(zone["zooms"])
    zmax, zmin = zooms[-1], zooms[0]
    detail = tiles_for_bbox(zone["bbox"], zmax)
    # Campo continuo a resolución zmax sobre la huella de las teselas de zmin.
    parents = sorted({(zmin, x >> (zmax - zmin), y >> (zmax - zmin)) for _, x, y in detail})
    px0 = min(x for _, x, _ in parents) << (zmax - zmin)
    py0 = min(y for _, _, y in parents) << (zmax - zmin)
    px1 = (max(x for _, x, _ in parents) + 1) << (zmax - zmin)
    py1 = (max(y for _, _, y in parents) + 1) << (zmax - zmin)
    width, height = (px1 - px0) * TILE, (py1 - py0) * TILE
    left, top = tile_bounds_3857(zmax, px0, py0)[0], tile_bounds_3857(zmax, px0, py0)[3]
    right, bottom = tile_bounds_3857(zmax, px1 - 1, py1 - 1)[2], tile_bounds_3857(zmax, px1 - 1, py1 - 1)[1]
    bounds = (left, bottom, right, top)

    print(f"  Reproyectando a EPSG:3857 · {width}×{height} px (z{zmax})")
    field = np.full((height, width), np.nan, dtype=np.float32)
    source = np.where(np.isnan(dem), -32767, dem).astype(np.float32)
    reproject(source, field, src_transform=transform, src_crs=crs, src_nodata=-32767,
              dst_transform=from_bounds(*bounds, width, height), dst_crs="EPSG:3857",
              dst_nodata=np.nan, resampling=Resampling.bilinear)

    ref = reference_heights(12, bounds, width, height).astype(np.float32)
    # Huella de las teselas de detalle (zmax), en píxeles del campo.
    inside = np.zeros((height, width), bool)
    for _, x, y in detail:
        c, r = (x - px0) * TILE, (y - py0) * TILE
        inside[r:r + TILE, c:c + TILE] = True
    # Distancia al borde de esa huella (rectángulo de teselas), en metros sobre el terreno.
    lat_c = (zone["bbox"][1] + zone["bbox"][3]) / 2
    pixel_m = EARTH / 2 ** zmax / TILE * math.cos(math.radians(lat_c))
    dx0 = min(x for _, x, _ in detail) - px0
    dy0 = min(y for _, _, y in detail) - py0
    dx1 = max(x for _, x, _ in detail) - px0 + 1
    dy1 = max(y for _, _, y in detail) - py0 + 1
    cols = np.arange(width) + 0.5
    rows = np.arange(height) + 0.5
    dist_x = np.minimum(cols - dx0 * TILE, dx1 * TILE - cols)[None, :]
    dist_y = np.minimum(rows - dy0 * TILE, dy1 * TILE - rows)[:, None]
    weight = smoothstep(np.minimum(dist_x, dist_y) * pixel_m / BLEND_M) * inside
    missing = np.isnan(field)
    weight[missing] = 0
    blended = np.where(weight > 0, np.nan_to_num(field) * weight + ref * (1 - weight), ref).astype(np.float32)

    diff = (field - ref)[inside & ~missing]
    stats = {"diferencia_media_m": round(float(np.mean(diff)), 2), "diferencia_p95_abs_m": round(float(np.percentile(np.abs(diff), 95)), 2),
             "pixeles_sin_dato": int(missing[inside].sum())}
    print(f"  Detalle − MDT25: media {stats['diferencia_media_m']} m · p95 |Δ| {stats['diferencia_p95_abs_m']} m · sin dato {stats['pixeles_sin_dato']}")

    written = []
    for z in zooms:
        factor = 2 ** (zmax - z)
        if z == zmax:
            keys = detail
            data = blended
        else:
            keys = sorted({(z, x // factor, y // factor) for _, x, y in detail})
            data = blended.reshape(height // factor, factor, width // factor, factor).mean(axis=(1, 3))
        ox, oy = px0 // factor, py0 // factor
        for _, x, y in keys:
            block = data[(y - oy) * TILE:(y - oy + 1) * TILE, (x - ox) * TILE:(x - ox + 1) * TILE]
            out = TILES / str(z) / str(x) / f"{y}.png"
            out.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(encode_terrarium(block), "RGB").save(out, optimize=True)
            written.append(f"{z}/{x}/{y}")
    size = sum((TILES / f"{k}.png").stat().st_size for k in written)
    print(f"  {len(written)} teselas · {size / 1e6:.1f} MB")
    return written, size, stats, pixel_m


# --------------------------------------------------------------------------- MDT25 z12
def rebuild_mdt25(manifest):
    """Rehace las teselas z12 ya publicadas de cada paisaje (MDT25) sin el rayado de origen.

    Las z12 originales se generaron en enteros y con bandas horizontales y verticales que el
    sombreado hace visibles al inclinar el mapa. Mismo WCS (MDT25), mismas teselas y mismo
    formato; solo cambian el suavizado de la cuantización y el remuestreo (bilineal).
    """
    tiles12 = {_tile_key(k) for k in manifest["tiles"] if k.startswith("12/")}
    done = 0
    for name, bbox in manifest.get("detail_areas", {}).items():
        if "·" in name:
            continue  # zonas piloto: las rellena el MDT05
        keys = [k for k in tiles_for_bbox(bbox, 12) if k in tiles12]
        if not keys:
            continue
        x0, x1 = min(k[1] for k in keys), max(k[1] for k in keys) + 1
        y0, y1 = min(k[2] for k in keys), max(k[2] for k in keys) + 1
        west, north = tile_to_lonlat(x0, y0, 12)
        east, south = tile_to_lonlat(x1, y1, 12)
        slug = re.sub(r"[^a-z]+", "-", name.split(" (")[0].lower().translate(str.maketrans("áéíóúñ", "aeioun"))).strip("-")
        print(f"  {name.split(' (')[0]}: {len(keys)} teselas z12")
        files, _ = download_wcs_mdt05(f"mdt25-{slug}", [west, south, east, north], "Elevacion25830_25", 25, "mdt25")
        dem, transform, crs, _ = load_dem(files)
        for _, x, y in keys:
            block = np.full((TILE, TILE), np.nan, np.float32)
            reproject(np.where(np.isnan(dem), -32767, dem).astype(np.float32), block, src_transform=transform, src_crs=crs,
                      src_nodata=-32767, dst_transform=from_bounds(*tile_bounds_3857(12, x, y), TILE, TILE),
                      dst_crs="EPSG:3857", dst_nodata=np.nan, resampling=Resampling.bilinear)
            if np.isnan(block).any():
                old = read_tile(12, x, y)
                block = np.where(np.isnan(block), old if old is not None else 0, block)
            Image.fromarray(encode_terrarium(block), "RGB").save(TILES / "12" / str(x) / f"{y}.png", optimize=True)
            done += 1
    manifest["mdt25_z12"] = {"fecha": dt.date.today().isoformat(), "cobertura_wcs": "Elevacion25830_25", "url": WCS,
                             "teselas": done, "proceso": "suavizado binomial 5×5 de la cuantización entera y remuestreo bilineal a EPSG:3857"}
    write_manifest(manifest)
    print(f"  {done} teselas z12 rehechas. Vuelve a generar después las zonas piloto (se funden con estas).")


# --------------------------------------------------------------------------- ortofoto
def build_orthophoto(zone_id, zone):
    """Recorte PNOA MA (WMTS, Web Mercator) exactamente al bbox de la zona."""
    bbox, target = zone["bbox"], zone.get("ortofoto_px", 2048)
    # Menor zoom WMTS cuyo recorte iguala o supera el tamaño pedido (después se reduce).
    x0, y0 = lonlat_to_tile(bbox[0], bbox[3], 0)
    x1, y1 = lonlat_to_tile(bbox[2], bbox[1], 0)
    z = max(0, min(18, math.ceil(math.log2(target / (max(x1 - x0, y1 - y0) * TILE)))))
    fx0, fy0 = lonlat_to_tile(bbox[0], bbox[3], z)
    fx1, fy1 = lonlat_to_tile(bbox[2], bbox[1], z)
    tx0, ty0, tx1, ty1 = int(fx0), int(fy0), int(fx1), int(fy1)
    folder = CACHE / zone_id / f"pnoa-z{z}"
    folder.mkdir(parents=True, exist_ok=True)
    canvas = Image.new("RGB", ((tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE))
    total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
    print(f"  Ortofoto PNOA MA · z{z} · {total} teselas WMTS")
    for x in range(tx0, tx1 + 1):
        for y in range(ty0, ty1 + 1):
            path = folder / f"{x}_{y}.jpg"
            if not path.exists():
                path.write_bytes(get(WMTS.format(z=z, x=x, y=y)).content)
                time.sleep(0.05)
            canvas.paste(Image.open(path).convert("RGB"), ((x - tx0) * TILE, (y - ty0) * TILE))
    crop = canvas.crop((round((fx0 - tx0) * TILE), round((fy0 - ty0) * TILE),
                        round((fx1 - tx0) * TILE), round((fy1 - ty0) * TILE)))
    scale = target / max(crop.size)
    if scale < 1:
        crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
    ASSETS.mkdir(parents=True, exist_ok=True)
    out = ASSETS / f"{zone_id}-pnoa.jpg"
    crop.save(out, quality=82, optimize=True, progressive=True)
    lat_c = (bbox[1] + bbox[3]) / 2
    ground = (lonlat_to_tile(bbox[2], lat_c, 0)[0] - lonlat_to_tile(bbox[0], lat_c, 0)[0]) * EARTH * math.cos(math.radians(lat_c))
    info = {"archivo": f"assets/terrain/{out.name}", "px": list(crop.size), "bytes": out.stat().st_size,
            "zoom_wmts": z, "m_por_pixel": round(ground / crop.width, 2),
            "servicio": "https://www.ign.es/wmts/pnoa-ma", "capa": "OI.OrthoimageCoverage",
            "atribucion": "PNOA cedido por © Instituto Geográfico Nacional · CC BY 4.0 scne.es",
            "proyeccion": "EPSG:3857 recortada al bbox (norte arriba)"}
    print(f"  {out.name}: {crop.width}×{crop.height} px · {info['m_por_pixel']} m/px · {info['bytes'] / 1e6:.2f} MB")
    return info


# --------------------------------------------------------------------------- manifiesto
def read_manifest():
    text = MANIFEST.read_text(encoding="utf-8")
    match = re.match(r"\s*window\.IGN_TERRAIN_MANIFEST\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not match:
        raise SystemExit("terrain-manifest.js no tiene el formato esperado.")
    return json.loads(match.group(1))


def write_manifest(data):
    MANIFEST.write_text("window.IGN_TERRAIN_MANIFEST=" + json.dumps(data, ensure_ascii=False) + ";", encoding="utf-8")


def _tile_key(key):
    return tuple(int(v) for v in key.split("/"))


def update_manifest(zone_id, zone, record):
    data = read_manifest()
    tiles = set(data.get("tiles", []))
    tiles.update(record["teselas"])
    data["tiles"] = sorted(tiles, key=_tile_key)
    data["maxzoom"] = max(data.get("maxzoom", 12), max(zone["zooms"]))
    zones = {z["id"]: z for z in data.get("detail_zones", [])}
    zones[zone_id] = {k: v for k, v in record.items() if k != "teselas"} | {"tiles": len(record["teselas"])}
    data["detail_zones"] = list(zones.values())
    areas = data.setdefault("detail_areas", {})
    areas[zone["nombre"]] = zone["bbox"]
    write_manifest(data)


# --------------------------------------------------------------------------- principal
def main():
    zones = json.loads(ZONES.read_text(encoding="utf-8"))["zonas"]
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--zona", choices=sorted(zones))
    parser.add_argument("--fuente", choices=["mdt05", "local"], default="mdt05")
    parser.add_argument("--dem", nargs="*", type=Path, default=[], help="GeoTIFF/COG locales (con --fuente local)")
    parser.add_argument("--producto", default=None, help="Nombre del producto local, p. ej. «MDT02 2ª cobertura»")
    parser.add_argument("--sin-ortofoto", action="store_true")
    parser.add_argument("--listar", action="store_true", help="Muestra las zonas y las hojas MTN50 del MDT02")
    parser.add_argument("--rehacer-mdt25", action="store_true", help="Rehace las teselas z12 (MDT25) de los paisajes sin el rayado de origen")
    args = parser.parse_args()

    if args.rehacer_mdt25:
        rebuild_mdt25(read_manifest())
        return

    if args.listar or not args.zona:
        for zid, z in zones.items():
            hojas = ", ".join(z["hojas_mtn50"]) or "sin comprobar"
            print(f"{zid}: {z['nombre']} · bbox {z['bbox']} · zooms {z['zooms']} · hojas MTN50 (MDT02): {hojas}")
        print("\nMDT02: https://centrodedescargas.cnig.es/CentroDescargas/modelo-digital-terreno-mdt02-segunda-cobertura"
              " → filtra por «Hoja MTN50» y descarga las cuatro hojas MTN25 (-1 a -4) en ETRS89 HU30.")
        return
    zone = zones[args.zona]
    print(f"{zone['nombre']} · bbox {zone['bbox']}")
    today = dt.date.today().isoformat()
    if args.fuente == "mdt05":
        files, urls = download_wcs_mdt05(args.zona, footprint(zone))
        product = {"producto": "MDT05 (PNOA LiDAR, 1ª cobertura) · WCS INSPIRE del IGN",
                   "cobertura_wcs": "Elevacion25830_5", "url": WCS, "peticiones": len(urls)}
    else:
        if not args.dem:
            raise SystemExit("--fuente local necesita --dem con al menos un GeoTIFF.")
        files, urls = args.dem, []
        product = {"producto": args.producto or "MDT local", "archivos": [Path(f).name for f in files],
                   "url": "https://centrodedescargas.cnig.es/CentroDescargas/modelo-digital-terreno-mdt02-segunda-cobertura"}
    dem, transform, crs, info = load_dem(files)
    print(f"  Origen: {info['crs']} · {info['resolution_m'][0]} m · {info['dtype']} · {dem.shape[1]}×{dem.shape[0]} px")
    written, size, stats, pixel_m = build_tiles(args.zona, zone, dem, transform, crs)
    record = {"id": args.zona, "nombre": zone["nombre"], "bbox": zone["bbox"], "fecha": today,
              **product, "origen": info, "zooms": zone["zooms"],
              "salida": {"formato": "Terrarium PNG 256 px, EPSG:3857", "m_por_pixel_zmax": round(pixel_m, 2),
                         "bytes": size, "fusion_borde_m": BLEND_M},
              "comparacion_mdt25": stats,
              "atribucion": "Obra derivada de MDT05 IGN · CC BY 4.0 scne.es" if args.fuente == "mdt05"
              else "Obra derivada de MDT IGN/CNIG · CC BY 4.0 scne.es",
              "teselas": written}
    if not args.sin_ortofoto:
        try:
            record["ortofoto"] = build_orthophoto(args.zona, zone) | {"fecha": today}
        except Exception as error:  # la ortofoto es opcional: el relieve ya está escrito
            print(f"  Ortofoto no disponible: {error}")
    update_manifest(args.zona, zone, record)
    print("  Manifiesto actualizado. Después: node tools/version-assets.mjs")


if __name__ == "__main__":
    main()
