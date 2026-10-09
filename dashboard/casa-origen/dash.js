/* ═══════════════════════════════════════════════
   dashboard/casa-origen/dash.js — motor mínimo del dashboard
   ─────────────────────────────────────────────────
   Sustituye al runtime de Claude Dashboards para que la página funcione
   como web estática: lee los datos de window.CO_DATA (data.js del idioma),
   ejecuta los cálculos (dash.calc) bajo demanda y avisa a la página
   (dash.onData) cuando cambian los filtros o el ancho.
   Sin dependencias: solo el navegador.
   ═══════════════════════════════════════════════ */
(() => {
  const RAW = window.CO_DATA || {};
  const DEFAULTS = window.CO_PARAMS || { local: 'Ambos', franja: null };
  const calcs = {}, cache = {}, subs = [];
  let params = { ...DEFAULTS };

  function data(id) {
    if (cache[id]) return cache[id];
    if (RAW[id]) {
      const rows = RAW[id];
      return (cache[id] = { status: 'ok', data: rows, rows, columns: Object.keys(rows[0] || {}), meta: [] });
    }
    const c = calcs[id];
    if (!c) return { status: 'missing', data: [] };
    const ins = c.inputs.map((i) => data(i));
    if (ins.some((x) => x.status !== 'ok')) return { status: 'error', data: [] };
    try {
      const out = c.fn(...ins.map((x) => x.data));
      cache[id] = { status: 'ok', data: out, rows: out, columns: Object.keys((out && out[0]) || {}), meta: [] };
    } catch (e) {
      console.error('calc', id, e);
      cache[id] = { status: 'error', data: [], message: String(e) };
    }
    return cache[id];
  }

  const run = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; run(); }); };

  window.dash = {
    calc: (id, o) => { calcs[id] = o; },
    loader: () => {},
    data,
    colors: ['#4A628E', '#B9C5D6', '#273A5F', '#1D2638', '#6b8158', '#c34031', '#8a877f', '#c9c6bd'],
    onData: (fn) => { subs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params: () => ({ ...params }),
    setParams: (p) => { params = { ...params, ...p }; schedule(); },
    resetParams: () => { params = { ...DEFAULTS }; schedule(); },
    setLink: (name) => { try { history.replaceState(null, '', '#' + name); } catch (e) { /* sin historial */ } },
    refresh: () => {},
  };

  let lastW = window.innerWidth, rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; run(); } }, 150);
  });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', schedule);
})();
