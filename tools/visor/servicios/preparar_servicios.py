"""Reproduce variants, commercial calls and calendars from official Renfe GTFS."""
import argparse
import csv
import hashlib
import io
import json
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent
CUTOFF = "2026-11-16"  # valor por defecto de --cutoff
SOURCES = {
    "renfe-national": "https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip",
    "renfe-commuter": "https://opendata.euskadi.eus/transport/moveuskadi/renfe_cercanias/gtfs_renfe_cercanias.zip",
}
# Network and line identifiers in the official feed, contrasted with Renfe network maps.
METRIC_LINES = {
    "10": {"C9"},  # Cercedilla–Cotos: «línea de ancho métrico» (Carta de Servicios Renfe Cercanías Madrid)
    "20": {"C4", "C5", "C5a", "C6", "C7", "C8"},
    "45": {"C1"}, "46": {"C1"}, "47": {"C1"},
    "60": {"C4", "C5"}, "62": {"C2", "C3"},
}
REGIONAL_CATALONIA = {"R11", "R13", "R14", "R15", "R16", "R17"}


def peninsula(point):
    lon, lat = point
    return -9.6 <= lon <= 3.4 and 36 <= lat <= 43.9 and not (lon > 0 and lat < 40.4)


def read_rows(archive, name):
    if name + ".txt" not in archive.namelist():
        return []
    with io.TextIOWrapper(archive.open(name + ".txt"), encoding="utf-8-sig") as stream:
        return [{key.strip(): (value or "").strip() for key, value in row.items() if key}
                for row in csv.DictReader(stream)]


def service_tags(brand, route, kind):
    if kind == "renfe-commuter":
        code = route["route_short_name"]
        network = route["route_id"][:2]
        if network == "51" and code in REGIONAL_CATALONIA:
            return ["md-conventional"], "Regional", []
        tags = ["commuter"]
        if code in METRIC_LINES.get(network, set()):
            tags.append("commuter-metric")
        return tags, "Cercanías", []
    values = {
        "AVE": (["highspeed"], "AVE", []),
        "AVLO": (["highspeed"], "Avlo", []),
        "AVANT": (["avant"], "Avant", []),
        "AVANT EXP": (["avant"], "Avant", ["AVANT EXP"]),
        "AVE EUROMED": (["euromed", "day"], "Euromed", ["AVE Euromed"]),
        "EUROMED": (["euromed", "day"], "Euromed", []),
        "ALVIA": (["alvia", "day"], "Alvia", []),
        "INTERCITY": (["day"], "Intercity", []),
        "REGIONAL": (["md-unresolved"], "Regional", []),
    }
    return values.get(brand.upper(), (["unresolved"], brand, []))


def ingest(path, kind, payload, cutoff=CUTOFF):
    with ZipFile(path) as archive:
        stops = {row["stop_id"]: row for row in read_rows(archive, "stops")}
        routes = {row["route_id"]: row for row in read_rows(archive, "routes")
                  if row["route_type"] == "2" and row["route_short_name"] != "T1"}
        trips = {row["trip_id"]: row for row in read_rows(archive, "trips") if row["route_id"] in routes}
        sequences = defaultdict(list)
        for row in read_rows(archive, "stop_times"):
            if row["trip_id"] in trips:
                sequences[row["trip_id"]].append(row)
        shapes = defaultdict(list)
        for row in read_rows(archive, "shapes"):
            shapes[row["shape_id"]].append((int(row["shape_pt_sequence"]), float(row["shape_pt_lon"]), float(row["shape_pt_lat"])))
        geometry = {key: [[lon, lat] for _, lon, lat in sorted(points)] for key, points in shapes.items()}
        calendars = read_rows(archive, "calendar")
        exceptions = read_rows(archive, "calendar_dates")
        payload["calendar"].extend({**row, "service_id": kind + ":" + row["service_id"]} for row in calendars)
        payload["exceptions"].extend({**row, "service_id": kind + ":" + row["service_id"]} for row in exceptions)
        patterns = {}
        for trip_id, sequence in sequences.items():
            sequence.sort(key=lambda row: int(row["stop_sequence"]))
            trip = trips[trip_id]
            route = routes[trip["route_id"]]
            # A no-boarding/no-alighting entry is a pass-through, never a commercial call.
            calls = [row for row in sequence if (row.get("pickup_type", "0"), row.get("drop_off_type", "0")) != ("1", "1")]
            if len(calls) < 2:
                continue
            coordinates = [[float(stops[row["stop_id"]]["stop_lon"]), float(stops[row["stop_id"]]["stop_lat"])] for row in calls]
            if not any(peninsula(point) for point in coordinates):
                continue
            brand_raw = route["route_short_name"]
            tags, brand, aliases = service_tags(brand_raw, route, kind)
            shape_id = trip.get("shape_id", "")
            key = kind + "|" + brand_raw + "|" + shape_id + "|" + ",".join(row["stop_id"] + ":" + row.get("pickup_type", "0") + ":" + row.get("drop_off_type", "0") for row in calls)
            identifier = kind + ":" + hashlib.sha256(key.encode()).hexdigest()[:16]
            if identifier not in patterns:
                call_data = []
                for row, point in zip(calls, coordinates):
                    stop = stops[row["stop_id"]]
                    stop_id = kind + ":" + row["stop_id"]
                    payload["stations"][stop_id] = {
                        "id": stop_id, "official_id": row["stop_id"], "name": stop["stop_name"],
                        "coordinates": point, "peninsula": peninsula(point), "source": kind,
                    }
                    call_data.append({"station": stop_id, "pickup": row.get("pickup_type", "0"), "dropoff": row.get("drop_off_type", "0")})
                if shape_id in geometry and all(peninsula(point) for point in geometry[shape_id]):
                    geom_id = kind + ":" + shape_id
                    payload["geometries"][geom_id] = geometry[shape_id]
                else:
                    geom_id = None
                patterns[identifier] = {
                    "id": identifier, "brand": brand, "published_brand": brand_raw, "aliases": aliases,
                    "operator": "Renfe Viajeros", "tags": tags, "network": route["route_id"][:2] if kind == "renfe-commuter" else None,
                    "line": brand_raw if kind == "renfe-commuter" else None,
                    "origin": stops[calls[0]["stop_id"]]["stop_name"], "destination": stops[calls[-1]["stop_id"]]["stop_name"],
                    "calls": call_data, "geometry": geom_id, "trips": [], "source": kind,
                    "verification": "published-schedule",
                }
            patterns[identifier]["trips"].append({
                "id": kind + ":" + trip_id, "service": kind + ":" + trip["service_id"],
                "number": trip.get("trip_short_name") or trip_id,
                "departure": calls[0]["departure_time"], "arrival": calls[-1]["arrival_time"],
            })
        payload["routes"].extend(patterns.values())
        dates = [row.get("start_date") or row["date"] for row in calendars + exceptions]
        ends = [row.get("end_date") or row["date"] for row in calendars + exceptions]
        payload["sources"][kind] = {
            "url": SOURCES[kind], "consulted": cutoff, "edition": "GTFS descargado " + cutoff,
            "valid_from": min(dates), "valid_to": max(ends),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "attribution": "Origen de los datos: Renfe Operadora · CC BY 4.0",
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--national", type=Path, required=True)
    parser.add_argument("--commuter", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True, help="services-catalog.json (intermedio, no se versiona)")
    parser.add_argument("--cutoff", default=CUTOFF, help="fecha de corte AAAA-MM-DD (fecha de descarga de los GTFS)")
    args = parser.parse_args()
    payload = {"cutoff": args.cutoff, "stations": {}, "routes": [], "geometries": {}, "calendar": [], "exceptions": [], "sources": {}}
    ingest(args.national, "renfe-national", payload, args.cutoff)
    ingest(args.commuter, "renfe-commuter", payload, args.cutoff)
    assert len({route["id"] for route in payload["routes"]}) == len(payload["routes"])
    target = args.out
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    temporary.replace(target)
    print(len(payload["routes"]), "variantes;", len(payload["stations"]), "estaciones;", len(payload["geometries"]), "geometrías")


if __name__ == "__main__":
    main()
