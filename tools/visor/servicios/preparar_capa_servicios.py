"""Genera capas/servicios.json: variantes comerciales, paradas acreditadas y trazado inferido.

Entrada: services-catalog.json (preparar_servicios.py, GTFS oficiales) y, si existen,
los GTFS de otros operadores declarados en OPERATOR_FEEDS.

Modelo (identificadores estables):
- estación: id del GTFS de origen; se fusionan estaciones de distintos feeds a <250 m con el mismo nombre normalizado.
- variante: secuencia exacta de paradas comerciales de una marca (id = hash de preparar_servicios.py).
- tramo: índice del tramo IGN en red-ign.geojson / datos.js. Una variante guarda la lista de tramos
  por los que pasa; un tramo puede pertenecer a muchas variantes y marcas, pero se dibuja una vez por categoría.
El trazado es INFERIDO (camino de menor coste en la red IGN entre paradas consecutivas). Si un salto no
tiene camino plausible, ese salto queda «pendiente» y no se dibuja: nunca se traza una recta entre ciudades.
"""
import argparse
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from red_grafo import Red, weight_for, haversine

ROOT = Path(__file__).resolve().parent
FUENTES = ROOT / "fuentes"
VISOR = ROOT.parents[2] / "visor-ferroviario"
CUTOFF = "2026-11-16"  # valor por defecto de --cutoff

# Marca publicada en el GTFS -> (marca del visor, categorías de servicio, tipo de trazado)
RENFE = {
    "AVE": ("ave", ["highspeed"], "highspeed"),
    "Avlo": ("avlo", ["highspeed"], "highspeed"),
    "Euromed": (None, ["euromed"], "highspeed"),
    "Avant": (None, ["avant"], "highspeed"),
    "Regional": (None, ["md-conventional"], "any"),
    "Intercity": (None, ["day"], "any"),
}


def norm(text):
    text = "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", text)


def peninsular(point):
    lon, lat = point
    return lat >= 35.98 and not (lon > 1.0 and lat < 40.2) and -9.6 < lon < 3.4 and lat < 43.9


SPAIN = json.loads((FUENTES / "espana.json").read_text(encoding="utf-8"))
SPAIN_RINGS = [poly[0] for poly in (SPAIN["coordinates"] if SPAIN["type"] == "MultiPolygon" else [SPAIN["coordinates"]])]


def inside(point, ring):
    x, y = point
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def spain(point):
    """España peninsular: dentro del contorno nacional y fuera de las islas y ciudades autónomas."""
    return peninsular(point) and any(inside(point, ring) for ring in SPAIN_RINGS)


def validity(trips, calendars, exceptions):
    starts, ends, days = [], [], set()
    for trip in trips:
        cal = calendars.get(trip["service"])
        if not cal:
            continue
        starts.append(cal["start_date"]); ends.append(cal["end_date"])
        for name in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"):
            if cal.get(name) == "1":
                days.add(name)
    if not starts:
        return None
    fmt = lambda s: s[:4] + "-" + s[4:6] + "-" + s[6:]
    return {"from": fmt(min(starts)), "to": fmt(max(ends)), "weekdays": len(days)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True, help="services-catalog.json de preparar_servicios.py")
    parser.add_argument("--out", type=Path, default=VISOR / "capas" / "servicios.json")
    parser.add_argument("--cutoff", default=CUTOFF, help="fecha de corte AAAA-MM-DD")
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    curated = json.loads((FUENTES / "servicios-fuentes.json").read_text(encoding="utf-8"))
    calendars = {c["service_id"]: c for c in catalog["calendar"]}
    by_name = {v["name"]: k for k, v in catalog["stations"].items() if v["source"] == "renfe-national"}
    red = Red()
    cache = {}
    stations = {}
    variants = []
    geometries = {}
    rejected = defaultdict(int)

    def station_id(sid):
        s = catalog["stations"][sid]
        stations.setdefault(sid, {"name": s["name"], "coordinates": [round(v, 6) for v in s["coordinates"]],
                                  "official_id": s["official_id"], "source": s["source"],
                                  "spain": spain(s["coordinates"])})
        return sid

    def segment(a, b, kind):
        k = (a, b, kind)
        if k not in cache:
            pa, pb = catalog["stations"][a]["coordinates"], catalog["stations"][b]["coordinates"]
            if kind == "regional":
                # Regionales: vía ibérica/estándar o red métrica (antigua Feve), la de recorrido más corto.
                options = [r for r in (red.route(pa, pb, weight_for("any")), red.route(pa, pb, weight_for("metric"))) if r]
                result = min(options, key=lambda r: r[1]) if options else None
            else:
                result = red.route(pa, pb, weight_for(kind))
            cache[k] = None if result is None else [red.edges[e]["fid"] for e in result[2]]
        return cache[k]

    def add(base, calls, kind, geometry=None):
        ids = [c["station"] for c in calls]
        points = [catalog["stations"][c]["coordinates"] for c in ids]
        inside_spain = [spain(p) for p in points]
        if sum(inside_spain) < 2:
            rejected["fuera del ámbito peninsular"] += 1
            return
        names = [catalog["stations"][c]["name"] for c in ids]
        edges, pending = [], 0
        if geometry is None:
            for a, b in zip(ids, ids[1:]):
                seg = segment(a, b, kind)
                if seg is None:
                    pending += 1
                else:
                    edges.extend(seg)
        variants.append({**base, "origin": names[0], "destination": names[-1],
            "calls": [{"s": station_id(c["station"]), **({"p": 1} if c.get("pickup") == "1" else {}), **({"d": 1} if c.get("dropoff") == "1" else {})} for c in calls],
            "edges": sorted(set(edges)), **({"geometry": geometry} if geometry else {}),
            "trace": "gtfs" if geometry else "inferred", "pending_segments": pending, "segments": len(ids) - 1,
            **({"international": [n for n, ok in zip(names, inside_spain) if not ok]} if not all(inside_spain) else {})})

    for route in catalog["routes"]:
        if route["source"] == "renfe-commuter":
            if "commuter-metric" not in route["tags"]:
                continue
            brand, categories, kind = None, ["commuter-metric"], "metric"
        elif route["brand"] not in RENFE:
            rejected["marca sin clasificar: " + route["brand"]] += 1
            continue
        else:
            brand, categories, kind = RENFE[route["brand"]]
            if route["brand"] == "Regional":
                kind = "regional"
        numbers = sorted({t["number"].strip() for t in route["trips"]})
        aliases = list(route.get("aliases") or [])
        if any(len(n) == 5 and n.startswith("04") for n in numbers):
            aliases.append("Alvia (serie 04xxx)")
            if route["brand"] == "Intercity":
                categories = ["alvia", *categories]   # localizable por su denominación anterior
        if route["brand"] == "Regional":
            aliases.append("Media Distancia")
        geometry = None
        if route.get("geometry") and route["geometry"] in catalog["geometries"]:
            geometry = route["geometry"]
            geometries[geometry] = [[round(x, 5), round(y, 5)] for x, y in catalog["geometries"][geometry]]
        add({"id": route["id"], "operator": route["operator"], "brand": brand, "published_brand": route["published_brand"],
             "aliases": aliases, "categories": categories, "line": route.get("line"), "network": route.get("network"),
             "trips": len(route["trips"]), "numbers": numbers[:40], "validity": validity(route["trips"], calendars, None),
             "source": route["source"]}, route["calls"], kind, geometry)

    for relation in curated["ouigo"]:
        for stops in relation["variants"]:
            start = relation.get("madrid") or relation["origin"]
            names = [start, *stops, relation["destination"]]
            missing = [n for n in names if n not in by_name]
            assert not missing, (relation["id"], missing)
            calls = [{"station": by_name[n]} for n in names]
            vid = "ouigo:" + hashlib.sha1("|".join(names).encode()).hexdigest()[:12]
            add({"id": vid, "operator": "OUIGO España", "brand": "ouigo", "published_brand": "OUIGO", "aliases": [],
                 "categories": ["highspeed"], "trips": None, "calendar_note": relation["calendar"],
                 "validity": {"from": curated["sources"]["ouigo-horarios"]["valid_from"], "to": curated["sources"]["ouigo-horarios"]["valid_to"],
                              "note": "Horario oficial 2026-2027"},
                 "source": "ouigo-horarios", "madrid_assumed": bool(relation.get("madrid_assumed"))}, calls, "highspeed")

    relations = defaultdict(list)
    for v in variants:
        relations[(v["brand"] or v["categories"][0], v["origin"], v["destination"])].append(v["id"])
    for (label, o, d), ids in relations.items():
        rid = "rel:" + hashlib.sha1((label + "|" + o + "|" + d).encode()).hexdigest()[:12]
        for v in variants:
            if v["id"] in ids:
                v["relation"] = rid
                v["variant_count"] = len(ids)
    payload = {
        "meta": {"cutoff": args.cutoff, "sources": curated["sources"],
                 "geometry": "Trazado inferido sobre la red IGN (camino de menor coste entre paradas consecutivas); no es dato del operador. Cercanías métricas: forma publicada en su GTFS.",
                 "ouigo_note": curated["ouigo_note"], "iryo": curated["iryo"], "iryo_note": curated["iryo_note"],
                 "alvia": curated["alvia"], "renames": curated["renames"], "rejected": rejected},
        "stations": stations, "variants": variants, "geometries": geometries,
    }
    target = args.out
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total = sum(v["segments"] for v in variants if v["trace"] == "inferred")
    pend = sum(v["pending_segments"] for v in variants)
    by = defaultdict(int)
    for v in variants:
        by[v["brand"] or v["categories"][0]] += 1
    print(len(variants), "variantes", dict(by), "| saltos sin trazado", pend, "de", total, "|", dict(rejected), "|", target.stat().st_size // 1024, "KB")
    for v in variants:
        if v["pending_segments"]:
            print("  pendiente:", v["brand"] or v["categories"][0], v["origin"], "->", v["destination"], v["pending_segments"], "/", v["segments"])


if __name__ == "__main__":
    main()
