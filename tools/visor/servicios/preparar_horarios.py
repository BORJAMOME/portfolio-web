"""Horas de paso por tren para el buscador de rutas del visor (capas/horarios.json).

Lee los mismos GTFS oficiales de Renfe que services-catalog.json (se comprueba su SHA-256) y, para cada
variante vigente de capas/servicios.json, guarda la hora de llegada y salida de cada tren en cada parada
comercial y los días en que circula. OUIGO sale del PDF oficial (fuentes/ouigo-horario-2026-2027.json).

Formato compacto (lo descomprime ruta.js):
- days: calendarios únicos como bits base64, un bit por día desde «start» (bit 0 = start).
- patterns: perfiles de marcha únicos, en minutos relativos a la salida de origen:
  [llegada_1, salida_1, llegada_2, salida_2, …, llegada_n] (la primera salida es 0).
- trips[variante]: [[salida_origen_min, perfil, calendario, número], …]; minutos desde la medianoche
  del día de servicio (pueden pasar de 1440 en trenes que cruzan la medianoche).

    python preparar_horarios.py --national <google_transit.zip> --commuter <gtfs_renfe_cercanias.zip> \
      --catalog <tmp>/services-catalog.json [--servicios …/capas/servicios.json] [--out …/capas/horarios.json]

Copiado de manual-ferrocarriles/mapa/preparar_horarios.py (27-11-2026): solo cambian las rutas y los argumentos.
"""
import argparse
import base64
import csv
import hashlib
import io
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent
FUENTES = ROOT / "fuentes"
VISOR = ROOT.parents[2] / "visor-ferroviario"
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def rows(archive, name):
    with io.TextIOWrapper(archive.open(name + ".txt"), encoding="utf-8-sig") as stream:
        return [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(stream)]


def minutes(text):
    h, m, *_ = text.split(":")
    return int(h) * 60 + int(m)


def parse(d):
    return date(int(d[:4]), int(d[4:6]), int(d[6:]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--national", type=Path, required=True)
    parser.add_argument("--commuter", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True, help="services-catalog.json de preparar_servicios.py")
    parser.add_argument("--servicios", type=Path, default=VISOR / "capas" / "servicios.json")
    parser.add_argument("--out", type=Path, default=VISOR / "capas" / "horarios.json")
    args = parser.parse_args()
    FEEDS = {"renfe-national": args.national, "renfe-commuter": args.commuter}

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    services = json.loads(args.servicios.read_text(encoding="utf-8"))
    for kind, path in FEEDS.items():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == catalog["sources"][kind]["sha256"], (kind, "el GTFS no es el que generó services-catalog.json")

    wanted = {v["id"]: v for v in services["variants"] if v["source"] in FEEDS}
    trip_variant = {}
    for route in catalog["routes"]:
        if route["id"] in wanted:
            for t in route["trips"]:
                trip_variant[t["id"]] = (route["id"], t["service"], t["number"])

    # Calendarios: días concretos de cada servicio.
    weekly = {c["service_id"]: c for c in catalog["calendar"]}
    extra = defaultdict(lambda: ([], []))
    for e in catalog["exceptions"]:
        extra[e["service_id"]][0 if e["exception_type"] == "1" else 1].append(e["date"])
    used = {sid for _, sid, _ in trip_variant.values()}
    active = {}
    for sid in used:
        dates = set()
        c = weekly.get(sid)
        if c:
            d, end = parse(c["start_date"]), parse(c["end_date"])
            while d <= end:
                if c[DAYS[d.weekday()]] == "1":
                    dates.add(d)
                d += timedelta(days=1)
        add, remove = extra.get(sid, ([], []))
        dates |= {parse(x) for x in add}
        dates -= {parse(x) for x in remove}
        active[sid] = dates
    start = min(min(d) for d in active.values() if d)
    end = max(max(d) for d in active.values() if d)
    span = (end - start).days + 1
    cal_index, cal_list = {}, []

    def calendar(sid):
        return bitset(active[sid])

    def bitset(dates):
        bits = bytearray((span + 7) // 8)
        for d in dates:
            k = (d - start).days
            if 0 <= k < span:
                bits[k >> 3] |= 1 << (k & 7)
        key = base64.b64encode(bytes(bits)).decode()
        if key not in cal_index:
            cal_index[key] = len(cal_list)
            cal_list.append(key)
        return cal_index[key]

    pat_index, pat_list = {}, []
    out = defaultdict(list)
    mismatched = 0
    for kind, path in FEEDS.items():
        with ZipFile(path) as archive:
            seq = defaultdict(list)
            for r in rows(archive, "stop_times"):
                tid = kind + ":" + r["trip_id"]
                if tid in trip_variant:
                    seq[tid].append(r)
        for tid, calls in seq.items():
            vid, sid, number = trip_variant[tid]
            calls.sort(key=lambda r: int(r["stop_sequence"]))
            calls = [r for r in calls if (r.get("pickup_type", "0"), r.get("drop_off_type", "0")) != ("1", "1")]
            if len(calls) != len(wanted[vid]["calls"]) or not active[sid]:
                mismatched += len(calls) != len(wanted[vid]["calls"])
                continue
            t0 = minutes(calls[0]["departure_time"])
            profile = []
            for i, r in enumerate(calls[1:], 1):
                profile.append(minutes(r["arrival_time"]) - t0)
                if i < len(calls) - 1:
                    profile.append(minutes(r["departure_time"]) - t0)
            key = ",".join(map(str, profile))
            if key not in pat_index:
                pat_index[key] = len(pat_list)
                pat_list.append(profile)
            out[vid].append([t0, pat_index[key], calendar(sid), number if kind == "renfe-national" else None])
    for trips in out.values():
        trips.sort(key=lambda t: t[0])

    # OUIGO: trayectos origen-destino del PDF oficial (extraer_calendario_ouigo.py), cada uno con su calendario.
    ouigo = json.loads((FUENTES / "ouigo-horario-2026-2027.json").read_text(encoding="utf-8"))
    by_name = {s["name"]: sid for sid, s in services["stations"].items() if sid.startswith("renfe-national:")}
    city = {"ALBACETE": "Albacete-Los Llanos", "ALICANTE": "Alicante/Alacant-Terminal", "BARCELONA": "Barcelona-Sants",
            "CUENCA": "Cuenca-Fernando Zóbel", "CÓRDOBA": "Córdoba-Julio Anguita", "ELCHE": "Elche/Elx AV", "MURCIA": "Murcia del Carmen",
            "MÁLAGA": "Málaga María Zambrano", "SEGOVIA": "Segovia-Guiomar", "SEVILLA": "Sevilla-Santa Justa", "TARRAGONA": "Camp de Tarragona",
            "VALENCIA": "València-Joaquín Sorolla", "VALLADOLID": "Valladolid-Campo Grande", "ZARAGOZA": "Zaragoza Delicias",
            "MADRID/Atocha": "Madrid-Puerta de Atocha-Almudena Grandes", "MADRID/Chamartín": "Madrid-Chamartín-Clara Campoamor"}
    ouigo_end = date(2027, 6, 14)
    # Aviso de OUIGO consultado el 17-11-2026: trenes entre Madrid y Andalucía suspendidos «hasta al menos el 29/11».
    andalucia, suspended_to = {"CÓRDOBA", "SEVILLA", "MÁLAGA"}, date(2026, 11, 29)
    extra = []
    for r in ouigo["trayectos"]:
        c = r["calendario"]
        first = max(start, date.fromisoformat(c["start"])) if c["start"] else start
        closed = {date.fromisoformat(x) for x in c["closed"]}
        ranges = [(set(x["days"]), date.fromisoformat(x["from"]), date.fromisoformat(x["to"])) for x in c["closed_ranges"]]
        touches_andalucia = any(p[0] in andalucia for p in r["paradas"])
        dates, d = set(), first
        while d <= min(ouigo_end, end):
            if (d.weekday() in c["weekdays"] and d not in closed and not any(d.weekday() in days and a <= d <= b for days, a, b in ranges)
                    and not (touches_andalucia and d <= suspended_to)):
                dates.add(d)
            d += timedelta(days=1)
        if not dates:
            continue
        sids = [by_name[city["MADRID/" + r["estacion_madrid"]] if p[0] == "MADRID" else city[p[0]]] for p in r["paradas"]]
        t0 = minutes(r["paradas"][0][2])
        profile = []
        for i, (_, arr, dep) in enumerate(r["paradas"][1:], 1):
            profile.append(minutes(arr) - t0)
            if i < len(r["paradas"]) - 1:
                profile.append(minutes(dep) - t0)
        key = ",".join(map(str, profile))
        if key not in pat_index:
            pat_index[key] = len(pat_list)
            pat_list.append(profile)
        extra.append([sids, t0, pat_index[key], bitset(dates), 1 if r.get("madrid_por_corredor") else 0])
    payload = {"meta": {"start": start.isoformat(), "end": end.isoformat(),
                        "sources": {**{k: catalog["sources"][k]["edition"] for k in FEEDS}, "ouigo": "PDF oficial «Horarios OUIGO 2026-2027», válido hasta el 14-06-2027"},
                        "ouigo_end": ouigo_end.isoformat(),
                        "note": "Horas de los GTFS oficiales de Renfe (AV/LD/MD y Cercanías) y del PDF oficial de OUIGO (trayectos origen-destino con sus días; "
                                "Madrid–Andalucía suspendido hasta el 29-11-2026 según el aviso de OUIGO)."},
               "days": cal_list, "patterns": pat_list, "trips": out, "ouigo": extra}
    target = args.out
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total = sum(len(t) for t in out.values())
    print(len(out), "variantes con horario de", len(wanted), "·", total, "trenes ·", len(pat_list), "perfiles ·",
          len(cal_list), "calendarios ·", start, "a", end, "· sin cuadrar", mismatched, "· OUIGO", len(extra), "trayectos ·", target.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
