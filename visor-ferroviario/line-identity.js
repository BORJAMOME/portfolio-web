/* Relates IGN geometry to the independent, dated Hermes inventory. */
(function (root) {
  "use strict";

  const metresPerDegree = 111195;
  const cellSize = 0.01;
  const tolerance = 20;
  const separation = 8;
  const cell = value => Math.floor(value / cellSize);

  function distance(point, start, end) {
    const scaleX = metresPerDegree * Math.cos(point[1] * Math.PI / 180);
    const x = (point[0] - start[0]) * scaleX;
    const y = (point[1] - start[1]) * metresPerDegree;
    const dx = (end[0] - start[0]) * scaleX;
    const dy = (end[1] - start[1]) * metresPerDegree;
    const lengthSquared = dx * dx + dy * dy;
    const position = lengthSquared ? Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared)) : 0;
    return Math.hypot(x - position * dx, y - position * dy);
  }

  function build(catalog) {
    const grid = new Map();
    for (const feature of catalog.features) {
      const properties = feature.properties;
      if (!properties.line_code || feature.geometry?.type !== "LineString") continue;
      const points = feature.geometry.coordinates;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const edge = {a, b, properties};
        for (let x = cell(Math.min(a[0], b[0])); x <= cell(Math.max(a[0], b[0])); x++) {
          for (let y = cell(Math.min(a[1], b[1])); y <= cell(Math.max(a[1], b[1])); y++) {
            const key = x + "," + y;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(edge);
          }
        }
      }
    }

    function closest(point, start, end) {
      const scaleX = Math.cos(point[1] * Math.PI / 180);
      const dx = (end[0] - start[0]) * scaleX;
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      const distances = new Map();
      const radiusY = (tolerance + separation) / metresPerDegree;
      const radiusX = radiusY / scaleX;
      for (let x = cell(point[0] - radiusX); x <= cell(point[0] + radiusX); x++) {
        for (let y = cell(point[1] - radiusY); y <= cell(point[1] + radiusY); y++) {
          for (const {a, b, properties} of grid.get(x + "," + y) || []) {
            const edgeX = (b[0] - a[0]) * scaleX;
            const edgeY = b[1] - a[1];
            // A crossing is insufficient evidence of a shared railway alignment.
            const alignment = Math.abs(dx * edgeX + dy * edgeY);
            const edgeLength = Math.hypot(edgeX, edgeY);
            if (!edgeLength || alignment < 0.9 * length * edgeLength) continue;
            const gap = distance(point, a, b);
            const code = properties.line_code;
            if (gap <= tolerance + separation && gap < (distances.get(code)?.gap ?? Infinity)) {
              distances.set(code, {gap, properties});
            }
          }
        }
      }
      const [first, second] = [...distances.values()].sort((a, b) => a.gap - b.gap);
      if (!first || first.gap > tolerance || (second && second.gap - first.gap < separation)) return null;
      return first.properties;
    }

    return function match(points) {
      // Sampling along the full IGN feature also checks between its published vertices.
      const sections = new Map();
      let code;
      for (let i = 1; i < points.length; i++) {
        const start = points[i - 1], end = points[i];
        const length = distance(start, end, end);
        if (!length) continue;
        const steps = Math.max(2, Math.ceil(length / 30));
        for (let step = 0; step < steps; step++) {
          const t = (step + 0.5) / steps;
          const point = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
          const section = closest(point, start, end);
          if (!section || (code && code !== section.line_code)) return null;
          code = section.line_code;
          sections.set(section.section_id, section);
        }
      }
      return code ? {code, sections: [...sections.values()], source: catalog.provenance} : null;
    };
  }

  function nearestStation(point, stations) {
    let closest, best = 5000;
    for (const station of stations) {
      const location = station.geometry.coordinates;
      const gap = distance(point, location, location);
      if (gap < best) {
        closest = station.properties.DESCRIPCION;
        best = gap;
      }
    }
    return closest ? {name: closest, metres: best} : null;
  }

  root.AtlasLineIdentity = {build, nearestStation};
})(typeof module === "object" ? module.exports : window);
