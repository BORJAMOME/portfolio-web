"""Grafo de la red ferroviaria IGN para inferir el trazado de un servicio entre paradas.

El trazado resultante es el camino de menor coste por la red IGN entre paradas
consecutivas acreditadas por el horario. No es un dato del operador: se publica
siempre como «trazado inferido sobre la red IGN» y se descarta si no hay camino
o si el rodeo frente a la distancia en línea recta es anómalo.
"""
import heapq
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def haversine(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, math.radians(b[0] - a[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def key(point):
    # Los extremos de los tramos IGN coinciden al centímetro; se redondea a ~1 cm.
    return (round(point[0], 7), round(point[1], 7))


class Red:
    def __init__(self, path=ROOT / "fuentes" / "red-ign.geojson"):
        # Red IGN con 7 decimales y solo id, length_m y nominalgauge (datos.json, a 5 decimales, cambia los caminos).
        data = json.loads(path.read_text(encoding="utf-8"))
        self.nodes = {}
        self.coords = []
        self.adj = []
        self.edges = []
        for fid, feature in enumerate(data["features"]):
            p = feature["properties"]
            line = feature["geometry"]["coordinates"]
            a, b = self._node(line[0]), self._node(line[-1])
            if a == b:
                continue
            length = p.get("length_m") or sum(haversine(x, y) for x, y in zip(line, line[1:]))
            gauge = p.get("nominalgauge") or p.get("ancho_mm")
            index = len(self.edges)
            self.edges.append({"a": a, "b": b, "len": length, "gauge": gauge, "line": line, "id": p.get("id"), "fid": fid})
            self.adj[a].append((b, index))
            self.adj[b].append((a, index))
        self._grid = {}
        for index, (lon, lat) in enumerate(self.coords):
            self._grid.setdefault((int(lon * 20), int(lat * 20)), []).append(index)

    def _node(self, point):
        k = key(point)
        if k not in self.nodes:
            self.nodes[k] = len(self.coords)
            self.coords.append(k)
            self.adj.append([])
        return self.nodes[k]

    def nearest(self, point, radius=1500, gauges=None):
        """Nodos de la red a menos de `radius` metros, del más próximo al más lejano."""
        cx, cy = int(point[0] * 20), int(point[1] * 20)
        found = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for n in self._grid.get((cx + dx, cy + dy), []):
                    if gauges and not any(self.edges[e]["gauge"] in gauges for _, e in self.adj[n]):
                        continue
                    d = haversine(point, self.coords[n])
                    if d <= radius:
                        found.append((d, n))
        found.sort()
        return [n for _, n in found[:12]]

    def route(self, a, b, weight, limit_factor=2.2):
        """Camino de menor coste entre dos puntos. Devuelve (coords, metros, edges) o None."""
        starts, ends = self.nearest(a), set(self.nearest(b))
        if not starts or not ends:
            return None
        direct = haversine(a, b)
        best = {}
        heap = []
        for s in starts:
            best[s] = 0
            heapq.heappush(heap, (0, s, None))
        previous = {}
        target = None
        while heap:
            cost, node, via = heapq.heappop(heap)
            if cost > best.get(node, math.inf):
                continue
            if node in ends:
                target = node
                break
            if cost > (direct * limit_factor + 30000) * 25:
                break
            for other, edge in self.adj[node]:
                c = cost + self.edges[edge]["len"] * weight(self.edges[edge])
                if c < best.get(other, math.inf):
                    best[other] = c
                    previous[other] = (node, edge)
                    heapq.heappush(heap, (c, other, edge))
        if target is None:
            return None
        chain = []
        node = target
        while node in previous:
            node, edge = previous[node]
            chain.append(edge)
        chain.reverse()
        coords = [list(self.coords[node])]  # `node` es ahora el nodo de salida
        for edge in chain:
            e = self.edges[edge]
            line = e["line"] if e["a"] == node else e["line"][::-1]
            node = e["b"] if e["a"] == node else e["a"]
            coords.extend(line[1:])
        metres = sum(self.edges[e]["len"] for e in chain)
        if direct > 2000 and metres > direct * limit_factor:
            return None
        return coords, metres, chain


def weight_for(kind):
    """Pesos por ancho: favorece la red por la que circula cada tipo de tren."""
    if kind == "highspeed":
        return lambda e: 1.0 if e["gauge"] == 1435 else 2.2
    if kind == "metric":
        # Muchos tramos de la red métrica no tienen ancho informado en el IGN.
        return lambda e: 1.0 if e["gauge"] == 1000 else (1.3 if e["gauge"] is None else 20.0)
    if kind == "conventional":
        return lambda e: 1.0 if e["gauge"] in (1668, None) else (1.6 if e["gauge"] == 1435 else 50.0)
    return lambda e: 1.0 if e["gauge"] != 1000 else 50.0
