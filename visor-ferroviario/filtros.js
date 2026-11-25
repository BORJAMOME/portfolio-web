/* Shared filtering rules used by the atlas and its regression checks. */
(function (root) {
  const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const reportedGauge = ["1435", "1668", "1000"];
  const qualityValues = ["notApplicable", "pending"];
  const positive = value => Number.isInteger(value) && value > 0;
  function missing(properties, dimension) {
    const status = properties.quality?.[dimension];
    return qualityValues.includes(status) ? status : "unknown";
  }
  function value(feature, dimension) {
    const p = feature.properties;
    if (dimension === "gauge") {
      // Ancho completado con Adif y la topología (capas/ancho.json, preparar_capa_ancho.py).
      if (p.gauge_fix) return p.gauge_fix;
      const widths = Array.isArray(p.gauge_values_mm) ? new Set(p.gauge_values_mm.filter(positive)) : new Set();
      if (widths.size > 1) return "mixed";
      if (positive(p.nominalgauge)) {
        const gauge = String(p.nominalgauge);
        return reportedGauge.includes(gauge) ? gauge : "other";
      }
      const category = p.gauge_category ?? p.nominalgaugecategory;
      if (category === "narrow" || category === "notApplicable") return category;
    }
    if (dimension === "electric") {
      if (p.electrified === true || p.electrified === "true") return "yes";
      if (p.electrified === false || p.electrified === "false") return "no";
    }
    if (dimension === "tracks" && positive(p.numberoftracks)) return String(p.numberoftracks);
    return missing(p, dimension);
  }
  function prepare(feature) {
    for (const dimension of ["gauge", "electric", "tracks"]) {
      feature.properties["filter_" + dimension] = value(feature, dimension);
    }
    return feature;
  }
  function expression(dimension) {
    return ["coalesce", ["get", "filter_" + dimension], "unknown"];
  }
  function matches(feature, filters, except) {
    return Object.entries(filters).every(([dimension, values]) =>
      dimension === except || values.length === 0 || values.includes(value(feature, dimension)));
  }
  function filter(features, filters) {
    return features.filter(feature => matches(feature, filters));
  }
  function counts(features, filters, dimension) {
    const result = new Map();
    for (const feature of features) {
      if (!matches(feature, filters, dimension)) continue;
      const key = value(feature, dimension);
      result.set(key, (result.get(key) || 0) + 1);
    }
    return result;
  }
  const api = { normalize, value, prepare, expression, matches, filter, counts };
  if (typeof module !== "undefined") module.exports = api;
  root.AtlasFilters = api;
})(typeof window === "undefined" ? globalThis : window);
