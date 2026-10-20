/* ═══════════════════════════════════════════════
   area-privada-second-brain.js: pestaña «Second Brain» del área privada (#/second-brain)
   ─────────────────────────────────────────────────
   Mapa 3D del conocimiento profesional. Esta página SOLO muestra un snapshot que ya
   calculó el motor (tools/second-brain) y que está guardado en Supabase:

     · lee public.sb_snapshots / public.sb_runs con la sesión del área privada, así que
       solo un miembro autenticado recibe datos (RLS, supabase/second-brain.sql);
     · no abre documentos, no llama a ningún modelo de IA y no analiza nada: seleccionar un
       nodo, mover la cámara o filtrar son operaciones locales sobre datos ya descargados;
     · valida el snapshot (second-brain/contract.js) antes de dibujarlo;
     · todo texto que viene de la base se pinta con textContent, nunca como HTML.

   Disposición: el escenario 3D ocupa todo el ancho (con búsqueda, vistas, filtros y leyenda
   superpuestos) y debajo van el detalle del elemento, las recomendaciones y la lista accesible.
   Three.js se carga solo al abrir esta pestaña (paquete recortado de vendor/).
   ═══════════════════════════════════════════════ */
window.APSecondBrain = (function () {
  'use strict';

  const THREE_URL = './vendor/three-0.186.1-sb2.min.js';
  const DEMO_URL = './second-brain/demo-snapshot.json';
  const STALE_DAYS = 14;

  const STATE = {
    respaldado: { label: 'Respaldado por evidencias', short: 'Respaldado', cls: 'is-navy', hint: 'Hay proyectos, código o documentación propia que lo respaldan. No equivale a dominio profesional.' },
    mencionado: { label: 'Mencionado, sin práctica detectable', short: 'Mencionado', cls: 'is-steel', hint: 'Aparece en documentos o listas, pero no hay evidencia práctica suficiente.' },
    pendiente: { label: 'Pendiente de validar', short: 'Por validar', cls: 'is-mist', hint: 'La información disponible no permite saber si existe ni su profundidad.' },
    brecha_probable: { label: 'Brecha probable', short: 'Brecha probable', cls: 'is-mist is-gap', hint: 'Relevante para el objetivo y sin evidencia en fuentes que sí se han analizado. Puede existir fuera de ellas.' },
    brecha_confirmada: { label: 'Brecha confirmada', short: 'Brecha confirmada', cls: 'is-mist is-gap', hint: 'Registrada por ti con motivo y origen.' },
    oportunidad: { label: 'Oportunidad de mejora', short: 'Oportunidad', cls: 'is-amber', hint: 'Una acción que podría aportar valor; no implica una carencia.' },
    neutral: { label: 'Referencia', short: 'Referencia', cls: 'is-ink', hint: 'Objetivo o referencia del marco; no es un conocimiento.' },
  };
  const TYPE = {
    tecnologia: ['Tecnología', '●'], concepto: ['Concepto', '⬢'], tecnica: ['Técnica', '◆'], competencia: ['Competencia', '⬟'],
    proyecto: ['Proyecto', '■'], objetivo: ['Objetivo', '◯'], recomendacion: ['Recomendación', '▼'],
  };
  const EDGE = {
    usa: ['Usa', 'usa'], 'parte-de': ['Parte de', 'es parte de'], requiere: ['Requiere', 'requiere'], mejora: ['Mejora', 'mejora'],
    habilita: ['Habilita', 'habilita'], demuestra: ['Demuestra (proyecto → concepto)', 'demuestra'], agrupa: ['Agrupa (competencia → concepto)', 'agrupa'],
    necesita: ['Necesita (objetivo → competencia)', 'necesita'], recomienda: ['Recomienda', 'recomienda'],
  };
  const EDGE_DEFAULT_OFF = ['agrupa', 'necesita'];
  const BUCKET = { ahora: 'Ahora', despues: 'Después', todavia_no: 'Todavía no' };
  const LEVELS = { junior: 'Junior', consolidado: 'Junior consolidado', mid: 'Mid-Level' };

  const fmtDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  let ctx = null, h = null;
  let demoNotes = [];          // en la demostración los cambios viven solo en memoria
  let pendingSelect = null;    // tras guardar, se vuelve a seleccionar lo que estabas editando
  let viewer = null, cleanups = [];
  let S = null;

  /* ═══════════ CICLO DE VIDA ═══════════ */
  function dispose() {
    cleanups.forEach((f) => { try { f(); } catch (e) { /* ya liberado */ } });
    cleanups = [];
    if (viewer) { try { viewer.dispose(); } catch (e) { /* ya liberado */ } viewer = null; }
    S = null;
  }
  function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); }

  /* ═══════════ DATOS ═══════════ */
  function assetUrl(name, fallback) {
    const l = document.querySelector('link[data-ap-asset="' + name + '"]');
    return new URL(l ? l.getAttribute('href') : fallback, document.baseURI).href;
  }
  function loadEngine() {
    return Promise.all([
      import(assetUrl('sb-contract', './second-brain/contract.js')),
      import(assetUrl('sb-viewer', './second-brain/viewer.js')),
      import(assetUrl('sb-icons', './second-brain/icons.js')),
      import(assetUrl('sb-logos', './second-brain/logos.js')),
      import(assetUrl('sb-taxonomy', './second-brain/taxonomy.js')),
      import(new URL(THREE_URL, document.baseURI).href),
    ]).then((m) => ({ contract: m[0], viewer: m[1], icons: m[2], logos: m[3], taxonomy: m[4], THREE: m[5] }));
  }
  function isMissingTable(err) {
    return !!err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01' || err.code === 'PGRST200');
  }
  function loadData(engine, wantDemo) {
    if (wantDemo) {
      return fetch(new URL(DEMO_URL, document.baseURI).href, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error('No se han podido cargar los datos de demostración.');
        return r.json();
      }).then((g) => {
        const v = engine.contract.validateSnapshot(g);
        if (!v.ok) throw new Error('Los datos de demostración no son válidos: ' + v.errors[0]);
        return { snapshot: g, fallback: false, run: null, demo: true, notes: demoNotes, notesMissing: false };
      });
    }
    return Promise.all([
      ctx.api('/rest/v1/sb_snapshots?select=id,generated_at,created_at,engine_version,graph&mode=eq.real&order=generated_at.desc&limit=3'),
      ctx.api('/rest/v1/sb_runs?select=id,started_at,finished_at,status,message&order=started_at.desc&limit=1')
        .catch((e) => { if (e && e.auth) throw e; return []; }),
      // tu información (supabase/second-brain-notas.sql); si la tabla aún no existe, el mapa funciona igual
      ctx.api('/rest/v1/sb_notas?select=node_id,es_propio,label,tipo,area,descripcion,nota,valoracion,enlaces,relacionados,updated_at&order=updated_at.asc')
        .catch((e) => { if (e && e.auth) throw e; return isMissingTable(e) ? { missing: true } : { error: true }; }),
    ]).then((res) => {
      const rows = res[0] || [];
      const run = (res[1] || [])[0] || null;
      const notes = Array.isArray(res[2]) ? res[2] : [];
      const notesMissing = !!(res[2] && res[2].missing);
      if (!rows.length) return { snapshot: null, run };
      let invalid = null;
      for (let i = 0; i < rows.length; i++) {
        const v = engine.contract.validateSnapshot(rows[i].graph);
        if (v.ok) return { snapshot: rows[i].graph, fallback: i > 0, invalidFirst: invalid, run, demo: false, notes, notesMissing };
        if (!invalid) invalid = v.errors[0];
      }
      throw new Error('Los últimos análisis guardados no cumplen el contrato de datos (' + invalid + '). Vuelve a ejecutar el análisis.');
    });
  }

  /* ═══════════ RENDER ═══════════ */
  function render(c) {
    ctx = c; h = c.h;
    dispose();
    const wantDemo = c.arg === 'demo';
    let engine;
    return loadEngine().catch(() => { throw new Error('No se ha podido cargar el visor 3D. Revisa la conexión.'); })
      .then((e) => { engine = e; return loadData(e, wantDemo); })
      .then((data) => () => paint(engine, data), (err) => {
        if (err && err.auth) throw err;
        if (isMissingTable(err)) return message('setup');
        return message('error', err);
      });
  }

  function message(kind, arg) {
    return function () {
      ctx.view.textContent = '';
      const box = h('div', { class: 'ap-empty sb-msg', role: kind === 'error' ? 'alert' : null });
      if (kind === 'setup') {
        box.append(h('p', { class: 'ap-empty-title', text: 'Second Brain aún no está activado' }),
          h('p', { text: 'Ejecuta supabase/second-brain.sql en el SQL Editor de Supabase (una sola vez). Después ejecuta el análisis en tu equipo con «node tools/second-brain/analyze.mjs --publish».' }),
          demoLink());
      } else if (kind === 'empty') {
        const run = arg;
        box.append(h('p', { class: 'ap-empty-title', text: 'Todavía no hay ningún análisis' }),
          h('p', { text: 'Second Brain muestra el resultado de un análisis de tus fuentes. Aún no se ha publicado ninguno.' }),
          run && run.status === 'error' ? h('p', { class: 'sb-warn', text: 'El último intento falló: ' + (run.message || 'sin detalle') }) : '',
          h('ol', { class: 'sb-steps' }, [
            h('li', { text: 'Copia tools/second-brain/config.example.json a .second-brain/config.json y declara tus carpetas.' }),
            h('li', { text: 'Ejecuta supabase/second-brain.sql en Supabase (si no lo has hecho).' }),
            h('li', { text: 'Ejecuta «node tools/second-brain/analyze.mjs --publish» (con SB_PASSWORD en el entorno).' }),
          ]),
          demoLink());
      } else {
        box.append(h('p', { class: 'ap-empty-title', text: 'No se ha podido cargar Second Brain' }),
          h('p', { text: (arg && arg.message) || 'Error desconocido.' }),
          h('p', null, [h('button', { type: 'button', class: 'ap-tool', text: 'Reintentar', onclick: () => window.dispatchEvent(new HashChangeEvent('hashchange')) }), ' ', demoLink()]));
      }
      ctx.view.appendChild(box);
    };
  }
  function demoLink() { return h('a', { class: 'ap-tool', href: '#/second-brain/demo', text: 'Ver con datos de demostración (ficticios)' }); }

  /* ═══════════ PINTADO PRINCIPAL ═══════════ */
  /* Tu información sobre el mapa: elementos propios, valoraciones y relaciones. Todo queda
     marcado como «añadido por ti» y se valida con el mismo contrato que el snapshot. */
  const VALORACION = { domino: 'Lo domino', practicando: 'Lo estoy practicando', aprender: 'Quiero aprenderlo', brecha: 'Lo reconozco como brecha' };
  const TIPO_ICON = { tecnologia: 'cube', concepto: 'dot', tecnica: 'wrench', proyecto: 'folder', competencia: 'hexagon' };
  function mergeNotes(engine, g0, notes) {
    if (!notes || !notes.length) return { g: g0, ok: true };
    const g = JSON.parse(JSON.stringify(g0));
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const region = new Map(g.regions.map((x) => [x.id, x]));
    notes.forEach((nt, k) => {
      let n = byId.get(nt.node_id);
      if (!n && nt.es_propio && region.has(nt.area) && TIPO_ICON[nt.tipo]) {
        const c = (nt.tipo === 'proyecto' ? region.get('practica') : region.get(nt.area)) || region.get(nt.area);
        const j = ((k * 37) % 17) - 8;
        n = {
          id: nt.node_id, label: String(nt.label).slice(0, 118), type: nt.tipo, region: nt.tipo === 'proyecto' && region.has('practica') ? 'practica' : nt.area, area: nt.area, family: (region.get(nt.area) || {}).family || null,
          icon: TIPO_ICON[nt.tipo], state: nt.valoracion === 'aprender' ? 'pendiente' : 'mencionado', ...(nt.tipo === 'proyecto' ? {} : { stage: 'identificado', depth: 0 }),
          summary: (nt.descripcion || 'Elemento añadido por ti.').slice(0, 600), size: 0.5,
          evidence: { practica: 0, explicativa: 0, declarativa: 1, projects: 0, breadth: 'ninguna' },
          uncertainty: ['Añadido por ti: el análisis no lo ha detectado en tus fuentes.'], pos: [c.center[0] + j, c.center[1] + j / 2, c.center[2] - j],
        };
        g.nodes.push(n); byId.set(n.id, n);
      }
      if (!n) return;
      n.user = { propio: !!nt.es_propio, nota: nt.nota || '', descripcion: nt.descripcion || '', valoracion: nt.valoracion || '', enlaces: (nt.enlaces || []).filter((u) => /^https?:\/\//i.test(u)), relacionados: nt.relacionados || [], updated: nt.updated_at || null };
      if (nt.valoracion === 'domino' && n.stage !== undefined) {
        n.stage = 'dominio';
        n.stageNote = { reason: (nt.nota || 'Dominio confirmado por ti.').slice(0, 600), source: 'Tu valoración en Second Brain', date: nt.updated_at || null };
      }
      if (nt.valoracion === 'brecha') {
        n.state = 'brecha_confirmada';
        n.assessment = { reason: (nt.nota || 'Registrada por ti como brecha.').slice(0, 600), source: 'Tu valoración en Second Brain', date: nt.updated_at || null };
      }
      (nt.relacionados || []).forEach((rid) => {
        if (byId.has(rid) && rid !== n.id && !g.edges.some((e) => e.source === n.id && e.target === rid && e.type === 'usa')) {
          g.edges.push({ source: n.id, target: rid, type: 'usa', confidence: 'baja', rationale: 'Relación añadida por ti.' });
        }
      });
    });
    g.stats = Object.assign({}, g.stats, { nodes: g.nodes.length, edges: g.edges.length });
    const v = engine.contract.validateSnapshot(g);
    return v.ok ? { g, ok: true } : { g: g0, ok: false, error: v.errors[0] };
  }

  function paint(engine, data) {
    if (!data.snapshot) return message('empty', data.run)();
    ctx.view.textContent = '';
    const merged = mergeNotes(engine, data.snapshot, data.notes);
    const g = merged.g;
    const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
    const adj = new Map(g.nodes.map((n) => [n.id, []]));
    g.edges.forEach((e) => { adj.get(e.source).push({ e, other: e.target, out: true }); adj.get(e.target).push({ e, other: e.source, out: false }); });
    const bucketOf = new Map();
    g.recommendations.forEach((r) => { bucketOf.set(r.nodeId, r.priority.bucket); bucketOf.set(r.targetId, r.priority.bucket); });

    S = {
      g, nodeById, adj, bucketOf, demo: data.demo, selected: null,
      recById: new Map(g.recommendations.map((r) => [r.id, r])),
      compOf: new Map(g.competencies.map((k) => [k.nodeId, k])),
      f: { states: new Set(Object.keys(STATE)), types: new Set(Object.keys(TYPE)), regions: new Set(g.regions.map((r) => r.id)), families: new Set((g.families || []).map((f) => f.id).concat('_none')), priority: '', edges: new Set(Object.keys(EDGE).filter((k) => EDGE_DEFAULT_OFF.indexOf(k) < 0)), edgeMode: 'foco' },
      // en pantallas estrechas y verticales el disco se lee mejor desde arriba
      icons: engine.icons, logos: engine.logos, edgeStyle: engine.viewer.EDGE_STYLE, highlight: null,
      notesMissing: !!data.notesMissing, notesError: merged.ok ? null : merged.error, notes: data.notes || [],
      areaColor: new Map(g.regions.map((r) => [r.id, r.color || '#273a5f'])),
      famMap: new Map((g.families || []).map((f) => [f.id, f])), listGroup: 'familia', listQ: '', listOpen: new Set(),
      layout: 'mapa', camera: window.matchMedia && matchMedia('(max-width: 700px)').matches ? 'cenital' : '3d', els: {}, visible: null,
    };
    S.taxApi = engine.taxonomy;
    S.tax = S.taxApi.buildTaxonomy(g);
    S.dim = false;
    resetFilterState();
    on(window, 'hashchange', () => { if (!/^#\/second-brain/.test(location.hash)) dispose(); });
    on(window, 'pagehide', dispose);
    // el desplegable de filtros se cierra al pulsar fuera o con Esc (devuelve el foco a su botón)
    const closeFilters = (ev) => {
      const d = S && S.els.filters;
      if (!d || !d.open) return;
      if (ev.type === 'keydown') { if (ev.key === 'Escape') { d.open = false; d.querySelector('summary').focus(); } }
      else if (!d.contains(ev.target)) d.open = false;
    };
    on(document, 'pointerdown', closeFilters, true);
    on(document, 'keydown', closeFilters);

    const root = h('section', { class: 'sb', 'aria-label': 'Second Brain' }, [
      headerEl(data),
      stageEl(),
      exploreEl(),
      askCard(),
      h('div', { class: 'sb-below' }, [detailCard(), recsCard()]),
      listCard(),
    ]);
    ctx.view.appendChild(root);

    try {
      viewer = engine.viewer.createViewer(S.els.stage, engine.THREE, {
        icons: engine.icons,
        logos: engine.logos,
        onSelect: (id) => selectNode(id, 'viewer'),
        onHover: (id, x, y) => showTip(id, x, y),
        onDetached: () => dispose(),
        onContextLost: () => stageMessage('El navegador ha perdido el contexto gráfico. Recarga la sección para recuperar el mapa 3D.'),
      });
      viewer.setInsets(insetsNow(), false);
      viewer.setData(g);
      // la barra superior cambia de altura (vistas rápidas, filtros activos): el encuadre deja los nodos fuera de ella
      const bar = S.els.stage.parentNode.querySelector('.sb-bar');
      if (bar && window.ResizeObserver) {
        let last = insetsNow().top;
        const ro = new ResizeObserver(() => { const t = insetsNow().top; if (Math.abs(t - last) > 3 && viewer) { last = t; viewer.setInsets(insetsNow(), true); } });
        ro.observe(bar);
        cleanups.push(() => ro.disconnect());
      }
      if (S.camera !== '3d') viewer.setCamera(S.camera, true);
      const stage = S.els.stage;
      stage.__sbViewer = viewer;                       // acceso para pruebas y diagnóstico; se suelta al salir
      cleanups.push(() => { delete stage.__sbViewer; });
    } catch (err) {
      viewer = null;
      stageMessage('Tu navegador no puede mostrar el mapa 3D (WebGL no está disponible). Toda la información está debajo: detalle, recomendaciones y lista completa.');
    }
    applyFilters(true);
    renderDetail();
    if (pendingSelect && S.nodeById.has(pendingSelect)) { const id = pendingSelect; pendingSelect = null; selectNode(id, 'panel'); }
    pendingSelect = null;
    if (S.notesError) ctx.setStatus('Parte de tu información no se ha podido aplicar: ' + S.notesError, true);
  }

  /* Zona superior que tapan los controles superpuestos (barra, vistas rápidas, filtros activos), en píxeles del lienzo */
  function insetsNow() {
    const st = S.els.stage.getBoundingClientRect();
    const bar = S.els.stage.parentNode.querySelector('.sb-bar');
    const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom - st.top) + 10 : 92;
    // mandos, leyenda y barra: las etiquetas del mapa no se colocan debajo de ellos
    const rects = [];
    for (const sel of ['.sb-bar', '.sb-legend', '.sb-nav']) {
      const el = S.els.stage.parentNode.querySelector(sel);
      if (!el || el.hidden || getComputedStyle(el).position !== 'absolute') continue;
      const r = el.getBoundingClientRect();
      rects.push({ x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height });
    }
    return { top: Math.round(top), bottom: 0, left: 0, right: 0, rects };
  }

  function stageMessage(text) {
    if (!S) return;
    S.els.stageMsg.textContent = text;
    S.els.stageMsg.hidden = false;
  }

  /* ── Cabecera: estado, fecha y cifras reales del snapshot ── */
  function headerEl(data) {
    const g = S.g, st = g.stats;
    const gen = new Date(g.generatedAt);
    const days = Math.floor((Date.now() - gen.getTime()) / 86400000);
    const stale = days > STALE_DAYS;
    const failedRun = data.run && data.run.status === 'error' && Date.parse(data.run.started_at) > gen.getTime();
    const head = h('header', { class: 'sb-head' }, [
      h('div', { class: 'sb-status' }, [
        data.demo ? h('span', { class: 'ape-badge is-warn', text: 'DATOS FICTICIOS · DEMO' }) : h('span', { class: 'ape-badge is-ok', text: 'Análisis real' }),
        h('span', { class: 'sb-date' }, [h('span', { class: 'sb-muted', text: 'Último análisis: ' }), h('time', { datetime: g.generatedAt, text: fmtDate.format(gen) })]),
        data.demo ? '' : h('span', { class: 'ape-badge ' + (stale ? 'is-warn' : 'is-ok'), text: stale ? 'Desactualizado · hace ' + plural(days, 'día', 'días') : (days <= 0 ? 'Actualizado hoy' : 'Actualizado · hace ' + plural(days, 'día', 'días')) }),
        h('span', { class: 'sb-muted', text: 'Objetivo: ' + g.meta.targetLabel }),
        h('ul', { class: 'sb-kpis', 'aria-label': 'Resumen del análisis' }, [
          kpi(st.concepts, 'conceptos'), kpi(st.edges, 'relaciones'), kpi(st.projects, 'proyectos'),
          kpi(g.regions.filter((r) => r.count > 0).length, 'áreas'), kpi(st.priorities, 'prioridades'),
        ]),
        h('p', { class: 'sb-muted sb-kpi-note', text: (() => {
          const by = (t) => g.nodes.filter((n) => t.indexOf(n.type) > -1).length;
          return plural(g.nodes.length, 'elemento', 'elementos') + ' en el mapa = ' + by(['tecnologia', 'concepto', 'tecnica']) + ' conceptos + ' + by(['competencia']) + ' competencias + ' + by(['proyecto']) + ' proyectos + ' + by(['objetivo', 'recomendacion']) + ' objetivos y recomendaciones.';
        })() }),
      ]),
    ]);
    if (data.demo) head.appendChild(h('p', { class: 'sb-banner is-demo', role: 'note' }, [h('strong', { text: 'Estos datos son inventados. ' }), 'Sirven para probar la interfaz y no describen tu conocimiento real. ', h('a', { href: '#/second-brain', text: 'Volver al análisis real' })]));
    if (data.fallback) head.appendChild(h('p', { class: 'sb-banner is-warn', role: 'status', text: 'El análisis más reciente no cumple el contrato de datos (' + (data.invalidFirst || 'error') + '). Se muestra el último análisis válido.' }));
    if (failedRun) head.appendChild(h('p', { class: 'sb-banner is-warn', role: 'status', text: 'El último intento de actualización (' + fmtDate.format(new Date(data.run.started_at)) + ') falló: ' + (data.run.message || 'sin detalle') + '. Se muestra el último análisis válido.' }));
    return head;
  }
  function kpi(n, label) { return h('li', null, [h('strong', { text: String(n) }), ' ' + label]); }

  /* ═══════════ ESCENARIO ═══════════ */
  function stageEl() {
    const e = S.els;
    e.stage = h('div', { class: 'sb-stage', tabindex: '0', role: 'group', id: 'sb-stage', 'aria-label': 'Mapa 3D del conocimiento. Toda la información está también en la lista de debajo.', 'aria-describedby': 'sb-keys' });
    e.stageMsg = h('p', { class: 'sb-stage-msg', role: 'status', hidden: true });
    e.empty = h('div', { class: 'sb-stage-empty', hidden: true }, [
      h('p', { text: 'Ningún elemento cumple los filtros actuales.' }),
      h('button', { type: 'button', class: 'ap-tool', text: 'Restablecer filtros', onclick: resetAll }),
    ]);
    e.chip = h('div', { class: 'sb-chip', hidden: true, role: 'status', 'aria-live': 'polite' });
    e.tip = h('div', { class: 'sb-tip', hidden: true, 'aria-hidden': 'true' });
    return h('div', { class: 'sb-stage-card' }, [
      toolbarEl(), e.stage, e.stageMsg, e.empty, e.chip, e.tip, legendEl(), navEl(),
    ]);
  }

  function seg(label, options, current, onPick, cls) {
    return h('div', { class: 'sb-seg ' + (cls || ''), role: 'group', 'aria-label': label }, options.map((o) =>
      h('button', { type: 'button', 'data-v': o[0], 'aria-pressed': o[0] === current ? 'true' : 'false', title: o[2] || null, text: o[1], onclick: (ev) => {
        ev.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === ev.currentTarget ? 'true' : 'false'));
        onPick(o[0]);
      } })));
  }

  function toolbarEl() {
    const e = S.els;
    e.search = h('input', { type: 'search', id: 'sb-search', placeholder: 'Buscar un concepto, competencia o proyecto', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'sb-results', 'aria-autocomplete': 'list', oninput: onSearch, onkeydown: onSearchKey });
    e.results = h('ul', { class: 'sb-results', id: 'sb-results', role: 'listbox', 'aria-label': 'Resultados', hidden: true });
    e.count = h('p', { class: 'sb-count', role: 'status', 'aria-live': 'polite' });
    e.filterBtn = h('summary', { class: 'sb-btn', text: 'Filtros' });
    e.filters = h('details', { class: 'sb-filters' }, [e.filterBtn, filtersEl()]);
    e.active = h('div', { class: 'sb-active', hidden: true });
    return h('div', { class: 'sb-bar' }, [
      h('div', { class: 'sb-bar-l' }, [
        h('div', { class: 'sb-search' }, [h('label', { class: 'sr-only', for: 'sb-search', text: 'Buscar en el mapa' }), e.search, e.results]),
        e.count,
      ]),
      h('div', { class: 'sb-bar-r' }, [
        seg('Distribución', [['mapa', 'Mapa', 'Posición con significado: área, solidez de la evidencia y tipo'], ['red', 'Red', 'Red de relaciones calculada por el motor']], S.layout, (v) => { S.layout = v; if (viewer) viewer.setLayout(v); }),
        seg('Punto de vista', [['3d', 'Perspectiva'], ['cenital', 'Cenital'], ['lateral', 'Lateral']], S.camera, (v) => { S.camera = v; if (viewer) viewer.setCamera(v); }, 'sb-seg--cam'),
        e.filters,
        h('button', { type: 'button', class: 'sb-btn', text: 'Restablecer', title: 'Quita filtros y selección y vuelve a la vista general', onclick: resetAll }),
        h('button', { type: 'button', class: 'sb-btn sb-btn--dark', text: '+ Añadir', title: 'Añade un concepto, técnica o proyecto que el análisis no ha detectado', onclick: () => editNote(null) }),
      ]),
      quickEl(),
      e.active,
    ]);
  }

  /* Color = familia tecnológica (snapshot.families). Sin familia: gris neutro («Sin clasificar»). Un snapshot antiguo
     sin familias se colorea por área. Los tonos claros (amarillo) usan su «tinta» oscura en bordes y texto. */
  function areaOf(n) { return n.area || n.region; }
  const hexRgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lumHex = (x) => { const [r, g, b] = hexRgb(x).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round((v + (B[i] - v) * t) * 255).toString(16).padStart(2, '0')).join(''); };
  const NEUTRAL = { color: '#9aa5b5', ink: '#5b6678' };
  function paintOf(color, ink, label) {
    const light = lumHex(color) > 0.42;
    return { color, ink, label, light, edge: light ? mixHex(color, ink, 0.6) : color, fg: light ? '#273a5f' : '#ffffff' };
  }
  function famInfo(n) {
    if (n.type === 'objetivo') return paintOf('#273a5f', '#273a5f', 'Objetivo');
    if (!S.famMap.size) { const c = S.areaColor.get(areaOf(n)) || '#273a5f'; return paintOf(c, c, regionLabel(areaOf(n))); }
    const f = n.family && S.famMap.get(n.family);
    return f ? paintOf(f.color, f.ink || f.color, f.label) : paintOf(NEUTRAL.color, NEUTRAL.ink, 'Sin clasificar');
  }
  function setPaint(el, p) { el.style.setProperty('--c', p.color); el.style.setProperty('--ink', p.ink); el.style.setProperty('--fg', p.fg); el.style.setProperty('--edge', p.edge); }
  function famPill(n) {
    const p = famInfo(n);
    const el = h('span', { class: 'sb-fampill', text: p.label });
    setPaint(el, p);
    return el;
  }
  function famChip(f) {
    const el = h('span', { class: 'sb-ichip is-solid', 'aria-hidden': 'true' });
    setPaint(el, paintOf(f.color, f.ink || f.color, f.label));
    el.appendChild(S.icons.iconSvg(f.icon || 'dot'));
    return el;
  }
  const famKey = (n) => (n.type === 'objetivo' ? '_obj' : n.family || '_none');

  /* Ficha de color + icono de un nodo o un área (la misma gramática que el mapa) */
  function chip(n, big) {
    const p = n.type === 'recomendacion' ? paintOf('#d9952c', '#8a5a00', 'Recomendación') : famInfo(n);
    const cls = n.type === 'proyecto' ? 'is-card' : n.type === 'recomendacion' || n.type === 'objetivo' || n.state === 'respaldado' || n.state === 'neutral' ? 'is-solid' : n.state === 'mencionado' ? 'is-tint' : 'is-open';
    const shape = n.type === 'proyecto' ? ' is-square' : n.type === 'competencia' ? ' is-hex' : n.type === 'objetivo' ? ' is-diamond' : '';
    const el = h('span', { class: 'sb-ichip ' + cls + shape + (big ? ' is-big' : ''), 'aria-hidden': 'true' });
    setPaint(el, p);                                    // CSSOM: permitido por la CSP
    const logo = n.id.indexOf('c:') === 0 && S.logos ? S.logos.logoUrl(n.id.slice(2)) : null;
    if (logo) { el.classList.add('is-logo'); el.appendChild(h('img', { src: logo, alt: '' })); }
    else el.appendChild(S.icons.iconSvg(n.icon || 'dot'));
    if (n.state === 'brecha_probable' || n.state === 'brecha_confirmada') el.classList.add('is-gap');
    return el;
  }
  function areaChip(r) {
    const el = h('span', { class: 'sb-ichip is-solid', 'aria-hidden': 'true' });
    el.style.setProperty('--c', r.color || '#273a5f');
    el.appendChild(S.icons.iconSvg(r.icon || 'dot'));
    return el;
  }
  function lineSample(style) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 34 8'); svg.setAttribute('class', 'sb-line'); svg.setAttribute('aria-hidden', 'true');
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', '1'); l.setAttribute('y1', '4'); l.setAttribute('x2', '33'); l.setAttribute('y2', '4');
    l.setAttribute('stroke', style.color || '#2f6db5'); l.setAttribute('stroke-width', style.strong ? '3.5' : style.thin ? '1.2' : '2.2'); l.setAttribute('stroke-linecap', 'round');
    if (style.thin) l.setAttribute('stroke-opacity', '0.7');
    if (style.dash) l.setAttribute('stroke-dasharray', style.dash[0] * 2 + ' ' + style.dash[1] * 2);
    svg.appendChild(l);
    return svg;
  }

  function legendEl() {
    const small = window.matchMedia && matchMedia('(max-width: 900px)').matches;
    const areas = S.g.regions.filter((r) => S.g.nodes.some((n) => n.region === r.id || n.area === r.id));
    const sw = (cls, label) => h('li', null, [h('span', { class: 'sb-sw ' + cls, 'aria-hidden': 'true' }), label]);
    const fams = (S.g.families || []).map((f) => ({ key: f.id, f, n: S.g.nodes.filter((x) => x.family === f.id).length }));
    const none = S.g.nodes.filter((x) => x.type !== 'objetivo' && !x.family).length;
    const famBtn = (key, chipEl, label, n) => h('li', null, [h('button', { type: 'button', class: 'sb-fam', 'data-fam': key, 'aria-pressed': 'false', title: 'Mostrar solo esta familia (otro clic la quita)', onclick: () => soloFamily(key) }, [chipEl, h('span', { class: 'sb-fam-t', text: label }), h('span', { class: 'sb-muted', text: String(n) })])]);
    const famList = fams.length
      ? h('ul', { class: 'sb-leg-fams' }, fams.map((x) => famBtn(x.key, famChip(x.f), x.f.label, x.n)).concat(none ? [famBtn('_none', (() => { const e = h('span', { class: 'sb-ichip is-solid', 'aria-hidden': 'true' }); setPaint(e, paintOf(NEUTRAL.color, NEUTRAL.ink, '')); e.appendChild(S.icons.iconSvg('dot')); return e; })(), 'Sin clasificar', none)] : []))
      : h('ul', { class: 'sb-leg-areas' }, areas.map((r) => h('li', null, [areaChip(r), h('span', { text: r.label })])));
    let stored = null;
    try { stored = localStorage.getItem('sb-legend-open'); } catch (e) { /* sin almacenamiento: se queda cerrada */ }
    const dots = h('span', { class: 'sb-leg-dots', 'aria-hidden': 'true' }, (S.g.families || []).map((f) => { const d = h('span', { title: f.label }); d.style.background = f.color; return d; }));
    const det = h('details', { class: 'sb-legend', open: !small && stored === '1' ? true : null }, [
      h('summary', null, [h('span', { text: 'Cómo leer el mapa' }), dots]),
      h('p', { class: 'sb-leg-h', text: fams.length ? 'Color = familia tecnológica · clic para aislarla' : 'Color = área' }),
      famList,
      h('details', { class: 'sb-legend-more' }, [
        h('summary', { text: 'Relleno, formas, relaciones y áreas' }),
        h('p', { class: 'sb-leg-h', text: 'Relleno = evidencia' }),
        h('ul', { class: 'sb-leg-ev' }, [
          sw('is-solid', 'Respaldado'), sw('is-tint', 'Mencionado'), sw('is-open', 'Por validar'),
          sw('is-gap', 'Brecha'), sw('is-now', 'Prioridad ahora'), sw('is-rec', 'Recomendación'),
        ]),
        h('p', { class: 'sb-leg-h', text: 'Forma = tipo de elemento' }),
        h('ul', { class: 'sb-leg-ev' }, [sw('is-solid', 'Círculo: conocimiento'), sw('is-solid is-hex', 'Hexágono: competencia'), sw('is-solid is-square', 'Ficha: proyecto'), sw('is-solid is-diamond', 'Rombo: objetivo')]),
        h('p', { class: 'sb-leg-h', text: 'Relaciones' }),
        h('ul', { class: 'sb-leg-lines' }, Object.values(S.edgeStyle).map((st) => h('li', null, [lineSample(st), st.label]))),
        fams.length ? h('p', { class: 'sb-leg-h', text: 'Sectores del suelo = áreas' }) : '',
        fams.length ? h('ul', { class: 'sb-leg-areas' }, areas.map((r) => h('li', null, [areaChip(r), h('span', { text: r.label })]))) : '',
        h('p', { class: 'sb-read', text: 'Del centro al borde: de respaldado a por validar. Arriba: competencias y recomendaciones. Anillo exterior: proyectos. Eje central: objetivos.' }),
        h('p', { class: 'sb-keys', id: 'sb-keys', text: 'Arrastra para girar (en cenital, para desplazar) · rueda o pellizco: zoom · con el mapa enfocado: flechas giran, Mayús + flechas desplazan, + / − acercan, 0 vista general, Esc quita la selección.' }),
      ]),
    ]);
    det.addEventListener('toggle', () => { try { localStorage.setItem('sb-legend-open', det.open ? '1' : '0'); } catch (e) { /* sin almacenamiento */ } if (viewer) viewer.setInsets(insetsNow(), false); });
    return det;
  }
  /* Aislar una familia desde la leyenda: marca solo esa en los filtros; otro clic sobre la misma vuelve a todas */
  function soloFamily(key) {
    const all = (S.g.families || []).map((f) => f.id).concat('_none');
    const only = S.f.families.size === 1 && S.f.families.has(key);
    S.f.families = new Set(only ? all : [key]);
    syncFamilyUi();
    applyFilters();
  }
  function syncFamilyUi() {
    S.els.filters.querySelectorAll('input[id^="sb-f-fam-"]').forEach((c) => { c.checked = S.f.families.has(c.id.slice('sb-f-fam-'.length)); });
    const solo = S.f.families.size === 1 ? [...S.f.families][0] : null;
    document.querySelectorAll('.sb-fam').forEach((b) => b.setAttribute('aria-pressed', b.getAttribute('data-fam') === solo ? 'true' : 'false'));
  }

  /* ── Tooltip al pasar el ratón: qué es, de qué área, su evidencia y una frase ── */
  function showTip(id, x, y) {
    if (!S) return;
    const tip = S.els.tip;
    const n = id && S.nodeById.get(id);
    if (!n) { tip.hidden = true; return; }
    const st = STATE[n.state] || STATE.neutral;
    const sum = (n.user && n.user.descripcion) || n.summary.replace(/^Competencia del marco general\.\s*/, '');
    const first = sum.length > 190 ? sum.slice(0, sum.lastIndexOf(' ', 186)) + '…' : sum;
    tip.textContent = '';
    tip.append(
      h('div', { class: 'sb-tip-h' }, [chip(n), h('div', null, [h('strong', { text: n.label }), h('span', { class: 'sb-muted', text: TYPE[n.type][0] + ' · ' + famInfo(n).label })])]),
      h('p', { class: 'sb-tip-st' }, [h('span', { class: 'sb-sw ' + (n.type === 'recomendacion' ? 'is-rec' : st.cls.indexOf('is-navy') > -1 ? 'is-solid' : n.state === 'mencionado' ? 'is-tint' : 'is-open'), 'aria-hidden': 'true' }), st.short + (n.evidence && n.evidence.projects ? ' · ' + plural(n.evidence.projects, 'proyecto', 'proyectos') : '')]),
      h('p', { class: 'sb-tip-d', text: first }),
      n.user ? h('p', { class: 'sb-tip-u', text: n.user.propio ? 'Añadido por ti' : 'Con información tuya' + (n.user.valoracion ? ' · ' + VALORACION[n.user.valoracion] : '') }) : '',
      h('p', { class: 'sb-tip-f', text: plural(S.adj.get(n.id).length, 'relación', 'relaciones') + ' · clic para ver el detalle' }),
    );
    tip.hidden = false;
    const box = S.els.stage.getBoundingClientRect();
    const tw = Math.min(320, box.width - 24);
    let left = x - box.left + 16, top = y - box.top + 16;
    if (left + tw > box.width - 8) left = x - box.left - tw - 16;
    if (top + tip.offsetHeight > box.height - 8) top = y - box.top - tip.offsetHeight - 12;
    tip.style.transform = 'translate(' + Math.max(8, Math.round(left)) + 'px,' + Math.max(8, Math.round(top + S.els.stage.offsetTop)) + 'px)';
  }

  /* ═══════════ TU INFORMACIÓN: notas, valoración y elementos propios ═══════════ */
  function userBlock(n) {
    const u = n.user;
    const box = h('section', { class: 'sb-block sb-user', 'aria-labelledby': 'sb-user-h' }, [
      h('div', { class: 'sb-user-top' }, [
        h('h3', { class: 'sb-h3', id: 'sb-user-h', text: u && u.propio ? 'Añadido por ti' : 'Tu información' }),
        h('button', { type: 'button', class: 'sb-btn sb-btn--sm', text: u ? 'Editar' : 'Añadir tu información', onclick: () => editNote(n) }),
      ]),
    ]);
    if (!u) {
      box.appendChild(h('p', { class: 'sb-muted', text: 'Puedes valorar este elemento, añadir una descripción propia, notas, enlaces que lo demuestren o relacionarlo con otros. Lo verás siempre separado de lo que calcula el análisis.' }));
      return box;
    }
    const dl = h('dl', { class: 'sb-dl' });
    if (u.valoracion) dl.append(...dt('Tu valoración', VALORACION[u.valoracion]));
    if (u.descripcion) dl.append(...dt('Tu descripción', u.descripcion));
    if (u.relacionados.length) dl.append(...dt('Relacionado por ti con', u.relacionados.map((id) => (S.nodeById.get(id) || { label: id }).label).join(', ')));
    if (u.updated) dl.append(...dt('Actualizado', fmtDate.format(new Date(u.updated))));
    box.appendChild(dl);
    if (u.nota) box.appendChild(h('p', { class: 'sb-user-note', text: u.nota }));
    if (u.enlaces.length) {
      box.appendChild(h('ul', { class: 'sb-user-links' }, u.enlaces.map((url) => h('li', null, [
        h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70) }, []),
      ]))));
    }
    return box;
  }

  function saveNote(row) {
    if (S.demo) {
      const i = demoNotes.findIndex((x) => x.node_id === row.node_id);
      const rec = Object.assign({ updated_at: new Date().toISOString() }, i >= 0 ? demoNotes[i] : {}, row);
      if (i >= 0) demoNotes[i] = rec; else demoNotes.push(rec);
      return Promise.resolve();
    }
    if (S.notesMissing) return Promise.reject(new Error('Para guardar tu información, ejecuta una vez supabase/second-brain-notas.sql en el SQL Editor de Supabase.'));
    return ctx.api('/rest/v1/sb_notas?on_conflict=node_id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  }
  function deleteNote(id) {
    if (S.demo) { demoNotes = demoNotes.filter((x) => x.node_id !== id); return Promise.resolve(); }
    return ctx.api('/rest/v1/sb_notas?node_id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }
  function reloadAfter(id, msg) {
    pendingSelect = id;
    ctx.setStatus(msg + (S.demo ? ' (demostración: no se guarda al salir).' : ''));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  /* n = nodo existente (o propio) que se edita; null = elemento nuevo */
  function editNote(n) {
    const u = ctx.ui;
    const isNew = !n;
    const cur = (n && n.user) || {};
    const areas = S.g.regions.filter((x) => ['practica', 'objetivos'].indexOf(x.id) < 0);
    const f = {
      label: isNew || cur.propio ? u.input('text', n ? n.label : '', { required: true, maxlength: '120' }) : null,
      tipo: isNew || cur.propio ? u.select([['tecnologia', 'Tecnología'], ['concepto', 'Concepto'], ['tecnica', 'Técnica'], ['proyecto', 'Proyecto'], ['competencia', 'Competencia']], n ? n.type : 'concepto') : null,
      area: isNew || cur.propio ? u.select(areas.map((x) => [x.id, x.label]), n ? (n.area || n.region) : (areas[0] && areas[0].id)) : null,
      val: u.select(Object.keys(VALORACION).map((k) => [k, VALORACION[k]]), cur.valoracion || '', 'Sin valorar'),
      desc: u.area(cur.descripcion || '', 3, 1200),
      nota: u.area(cur.nota || '', 4, 4000),
      links: u.area((cur.enlaces || []).join('\n'), 3, 2000),
      rel: h('select', { multiple: true, size: '7', class: 'apf-select sb-multi' }, S.g.nodes.filter((x) => (!n || x.id !== n.id) && x.type !== 'recomendacion' && x.type !== 'objetivo').slice().sort((a, b) => Object.keys(TYPE).indexOf(a.type) - Object.keys(TYPE).indexOf(b.type) || a.label.localeCompare(b.label, 'es')).map((x) => h('option', { value: x.id, text: x.label + ' · ' + TYPE[x.type][0], selected: (cur.relacionados || []).indexOf(x.id) > -1 }))),
    };
    const fields = [];
    if (f.label) fields.push(u.field('sb-n-label', 'Nombre', f.label, { wide: true }), u.field('sb-n-tipo', 'Tipo', f.tipo), u.field('sb-n-area', 'Área', f.area));
    fields.push(
      u.field('sb-n-val', 'Tu valoración', f.val, { hint: '«Lo reconozco como brecha» la marca como brecha confirmada en el mapa (con tus notas como motivo).' }),
      u.field('sb-n-desc', 'Tu descripción', f.desc, { wide: true, hint: 'Se muestra antes que la descripción del análisis.' }),
      u.field('sb-n-nota', 'Notas', f.nota, { wide: true }),
      u.field('sb-n-links', 'Enlaces que lo demuestran', f.links, { wide: true, hint: 'Uno por línea: repositorio, informe publicado, certificado… (http o https).' }),
      u.field('sb-n-rel', 'Relacionado con', f.rel, { wide: true, hint: 'Ctrl/⌘ + clic para elegir varios (máximo 10).' }),
    );
    if (S.demo) fields.unshift(h('p', { class: 'sb-banner is-demo apf-wide', text: 'Modo demostración: los cambios se ven, pero no se guardan.' }));
    else if (S.notesMissing) fields.unshift(h('p', { class: 'sb-banner is-warn apf-wide', text: 'Aún no se puede guardar: ejecuta una vez supabase/second-brain-notas.sql en Supabase.' }));
    const title = isNew ? 'Añadir un elemento propio' : (cur.propio ? 'Editar «' + n.label + '»' : 'Tu información sobre «' + n.label + '»');
    u.formDialog(title, 'Guardar', fields, () => {
      const links = f.links.value.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      const bad = links.find((x) => !/^https?:\/\/\S+$/i.test(x));
      if (bad) throw u.invalid('Este enlace no es válido (tiene que empezar por http:// o https://): ' + bad.slice(0, 60), f.links);
      if (links.length > 10) throw u.invalid('Como máximo 10 enlaces.', f.links);
      const rel = [].filter.call(f.rel.options, (o) => o.selected).map((o) => o.value);
      if (rel.length > 10) throw u.invalid('Como máximo 10 relaciones.', f.rel);
      const row = {
        node_id: n ? n.id : 'u:' + norm(f.label.value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) + '-' + Date.now().toString(36).slice(-4),
        es_propio: isNew || !!cur.propio,
        valoracion: f.val.value || null, descripcion: f.desc.value.trim() || null, nota: f.nota.value.trim() || null,
        enlaces: links, relacionados: rel,
      };
      if (f.label) {
        if (!f.label.value.trim()) throw u.invalid('Ponle un nombre.', f.label);
        Object.assign(row, { label: f.label.value.trim().slice(0, 120), tipo: f.tipo.value, area: f.area.value });
      }
      return saveNote(row).then(() => reloadAfter(row.node_id, isNew ? 'Añadido: «' + row.label + '».' : 'Guardado.'));
    }, f.label || f.val);
    // eliminar: tu información (o el elemento entero si es propio)
    if (!isNew && n.user) {
      const dlg = document.querySelector('dialog[open]');
      const actions = dlg && dlg.querySelector('.ap-dialog-actions, .apf-actions, form > div:last-child');
      const del = h('button', { type: 'button', class: 'ap-link-btn ap-link-btn--danger', text: cur.propio ? 'Eliminar este elemento' : 'Borrar tu información', onclick: () => {
        ctx.ask({ title: cur.propio ? '¿Eliminar el elemento?' : '¿Borrar tu información?', text: cur.propio ? '«' + n.label + '» desaparecerá del mapa. No se puede deshacer.' : 'Se borran tu valoración, descripción, notas, enlaces y relaciones de «' + n.label + '». El análisis no cambia.', ok: 'Eliminar', danger: true })
          .then((yes) => { if (!yes) return; if (dlg) dlg.close(); return deleteNote(n.id).then(() => reloadAfter(cur.propio ? null : n.id, 'Eliminado.')); })
          .catch(ctx.fail);
      } });
      if (actions) actions.insertBefore(del, actions.firstChild);
    }
  }

  /* ═══════════ PREGUNTAS: el mapa responde ═══════════
     Respuestas calculadas sobre el snapshot (sin IA ni red). Cada respuesta resalta
     sus elementos en el mapa y se puede recorrer con clic. */
  function knowledge() { return S.g.nodes.filter((n) => ['tecnologia', 'concepto', 'tecnica'].indexOf(n.type) > -1); }
  function questions() {
    const g = S.g, t = g.meta.targetLevel, tl = g.meta.targetLabel;
    const compNode = (k) => S.nodeById.get(k.nodeId);
    const incomplete = (k) => k.state !== 'respaldado' || k.partial || k.extendable;
    const areasOf = (id) => new Set(S.adj.get(id).filter((a) => a.e.type !== 'agrupa' && a.e.type !== 'necesita').map((a) => areaOf(S.nodeById.get(a.other))));
    return [
      { id: 'fuerte', q: '¿Qué tengo mejor demostrado?', run: () => {
        const ns = knowledge().filter((n) => n.state === 'respaldado').sort((a, b) => b.evidence.projects - a.evidence.projects || b.evidence.practica - a.evidence.practica).slice(0, 12);
        return { text: knowledge().filter((n) => n.state === 'respaldado').length + ' conceptos tienen evidencia; estos aparecen en más proyectos.', items: ns.map((n) => [n, plural(n.evidence.projects, 'proyecto', 'proyectos') + ' · ' + plural(n.evidence.practica, 'archivo con práctica', 'archivos con práctica')]) };
      } },
      { id: 'falta', q: '¿Qué me falta para «' + tl + '»?', run: () => {
        const ks = g.competencies.filter((k) => k.levels[t] >= 2 && incomplete(k)).sort((a, b) => b.priority.score - a.priority.score);
        return { text: ks.length ? ks.length + ' competencias relevantes para «' + tl + '» tienen aspectos sin demostrar.' : 'Todas las competencias relevantes para «' + tl + '» tienen su núcleo respaldado.', items: ks.map((k) => [compNode(k), (k.unverified.filter((u) => !/^No analizado|pbix|Muy pocas/.test(u)).slice(0, 2).join(' · ') || STATE[k.state].short)]) };
      } },
      { id: 'mid', q: '¿Qué me separa de Mid-Level?', run: () => {
        const ks = g.competencies.filter((k) => (k.levels.mid || 0) >= 2 && (incomplete(k) || (k.levels.mid > (k.levels[t] || 0) && k.state !== 'respaldado'))).sort((a, b) => (b.levels.mid - (b.levels[t] || 0)) - (a.levels.mid - (a.levels[t] || 0)) || b.priority.score - a.priority.score);
        return { text: 'Competencias que pesan más en Mid-Level y aún no están completas en tus fuentes.', items: ks.map((k) => [compNode(k), 'Mid ' + k.levels.mid + '/3 · ' + (LEVELS[t] || t) + ' ' + (k.levels[t] || 0) + '/3 · ' + STATE[k.state].short + (k.partial ? ' (parcial)' : k.extendable ? ' (ampliable)' : '')]) };
      } },
      { id: 'ahora', q: '¿Qué hago ahora?', run: () => {
        const rs = g.recommendations.filter((x) => x.priority.bucket !== 'todavia_no').sort((a, b) => (a.priority.bucket === 'ahora' ? 0 : 1) - (b.priority.bucket === 'ahora' ? 0 : 1) || b.priority.score - a.priority.score);
        return { text: rs.length ? 'En orden de prioridad. La acción concreta está en cada recomendación.' : 'No hay recomendaciones con la información disponible.', items: rs.map((x) => [S.nodeById.get(x.nodeId), BUCKET[x.priority.bucket] + ' · ' + x.action]) };
      } },
      { id: 'mencionado', q: '¿Qué solo está mencionado?', run: () => {
        const ns = knowledge().filter((n) => n.state === 'mencionado');
        return { text: ns.length + ' conceptos aparecen en documentos o listas pero sin práctica detectable: son lo más fácil de convertir en evidencia.', items: ns.map((n) => [n, n.uncertainty[0] || '']) };
      } },
      { id: 'brechas', q: '¿Dónde hay brechas o dudas?', run: () => {
        const ns = S.g.nodes.filter((n) => ['brecha_probable', 'brecha_confirmada', 'pendiente'].indexOf(n.state) > -1);
        return { text: ns.length ? ns.length + ' elementos sin evidencia. «Brecha probable» solo se marca si se analizaron las fuentes donde estaría.' : 'No hay brechas ni elementos pendientes con las fuentes actuales.', items: ns.map((n) => [n, STATE[n.state].short + ' · ' + (n.uncertainty[0] || '')]) };
      } },
      { id: 'proyectos', q: '¿Qué proyectos demuestran más?', run: () => {
        const ps = S.g.nodes.filter((n) => n.type === 'proyecto').map((n) => [n, S.adj.get(n.id).filter((a) => a.e.type === 'demuestra').length]).sort((a, b) => b[1] - a[1] || b[0].evidence.practica - a[0].evidence.practica).slice(0, 12);
        return { text: 'Los proyectos con práctica en más conceptos distintos (útiles para tu CV y tus entrevistas).', items: ps.map(([n, k]) => [n, 'demuestra ' + plural(k, 'concepto', 'conceptos') + ' · ' + regionLabel(areaOf(n))]) };
      } },
      { id: 'puentes', q: '¿Qué conecta más áreas?', run: () => {
        const ns = knowledge().map((n) => [n, areasOf(n.id).size]).filter((x) => x[1] > 1).sort((a, b) => b[1] - a[1] || b[0].evidence.projects - a[0].evidence.projects).slice(0, 10);
        return { text: 'Conceptos que unen áreas distintas: son buenos ejes para un proyecto integrador.', items: ns.map(([n, k]) => [n, 'conecta ' + k + ' áreas']) };
      } },
    ];
  }
  function askCard() {
    const e = S.els;
    e.askOut = h('div', { class: 'sb-ask-out', 'aria-live': 'polite' });
    e.askInput = h('input', { type: 'search', id: 'sb-ask-q', placeholder: 'O escribe un tema: «DAX», «retail», «machine learning»…', autocomplete: 'off', onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); askFree(ev.currentTarget.value); } } });
    return h('section', { class: 'sb-card sb-ask', 'aria-labelledby': 'sb-ask-h' }, [
      h('div', { class: 'sb-ask-top' }, [
        h('div', null, [h('p', { class: 'sb-eyebrow', text: 'Pregunta a tu Second Brain' }), h('h2', { class: 'sb-h sb-h--sm', id: 'sb-ask-h', text: 'Respuestas calculadas sobre tu mapa' })]),
        h('div', { class: 'sb-ask-free' }, [h('label', { class: 'sr-only', for: 'sb-ask-q', text: 'Preguntar por un tema' }), e.askInput, h('button', { type: 'button', class: 'sb-btn', text: 'Preguntar', onclick: () => askFree(e.askInput.value) })]),
      ]),
      h('div', { class: 'sb-qs', role: 'group', 'aria-label': 'Preguntas frecuentes' }, questions().map((q) => h('button', { type: 'button', class: 'sb-q', 'data-q': q.id, 'aria-pressed': 'false', text: q.q, onclick: (ev) => runQuestion(q, ev.currentTarget) }))),
      e.askOut,
    ]);
  }
  function renderAnswer(title, res) {
    const out = S.els.askOut;
    out.textContent = '';
    const ids = new Set(res.items.map((x) => x[0].id));
    S.highlight = ids;
    if (viewer) { viewer.setHighlight(ids); if (ids.size) viewer.focusIds([...ids]); }
    out.append(
      h('div', { class: 'sb-ans-h' }, [
        h('p', null, [h('strong', { text: title + ' ' }), res.text]),
        h('button', { type: 'button', class: 'ap-link-btn', text: 'Quitar resaltado', onclick: clearAnswer }),
      ]),
      res.items.length ? h('ol', { class: 'sb-ans' }, res.items.map(([n, meta]) => h('li', null, [
        h('button', { type: 'button', class: 'sb-ans-i', onclick: () => selectNode(n.id, 'ask') }, [chip(n), h('span', { class: 'sb-ans-t' }, [h('strong', { text: n.label }), h('span', { class: 'sb-muted', text: meta })])]),
      ]))) : h('p', { class: 'sb-muted', text: 'Nada que mostrar.' }),
    );
  }
  function runQuestion(q, btn) {
    S.els.askOut.parentNode.querySelectorAll('.sb-q').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    renderAnswer(q.q, q.run());
  }
  function askFree(text) {
    const q = norm(text).trim();
    if (!q) return;
    S.els.askOut.parentNode.querySelectorAll('.sb-q').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    const region = S.g.regions.find((r) => words.some((w) => norm(r.label).indexOf(w) > -1));
    const direct = S.g.nodes.filter((n) => { const hay = norm(n.label + ' ' + n.summary); return words.length && words.every((w) => hay.indexOf(w) > -1); });
    let items;
    if (direct.length) {
      const seed = new Set(direct.map((n) => n.id));
      direct.forEach((n) => S.adj.get(n.id).forEach((a) => { if (a.e.type !== 'necesita') seed.add(a.other); }));
      items = [...seed].map((id) => S.nodeById.get(id)).sort((a, b) => (direct.indexOf(b) > -1) - (direct.indexOf(a) > -1) || b.size - a.size).slice(0, 16)
        .map((n) => [n, (direct.indexOf(n) > -1 ? 'coincide · ' : 'relacionado · ') + TYPE[n.type][0] + ' · ' + (STATE[n.state] || STATE.neutral).short]);
      renderAnswer('«' + text.trim() + '»:', { text: direct.length + ' coincidencias y lo que se relaciona con ellas.', items });
    } else if (region) {
      const ns = S.g.nodes.filter((n) => (n.region === region.id || n.area === region.id) && n.type !== 'recomendacion');
      const cnt = (st) => ns.filter((n) => n.state === st).length;
      items = ns.sort((a, b) => (a.state === 'respaldado' ? 0 : 1) - (b.state === 'respaldado' ? 0 : 1) || b.size - a.size).map((n) => [n, TYPE[n.type][0] + ' · ' + (STATE[n.state] || STATE.neutral).short]);
      renderAnswer(region.label + ':', { text: cnt('respaldado') + ' respaldados, ' + cnt('mencionado') + ' mencionados y ' + (cnt('pendiente') + cnt('brecha_probable') + cnt('brecha_confirmada')) + ' por validar.', items });
    } else renderAnswer('«' + text.trim() + '»:', { text: 'No aparece en tu mapa. Puede que no esté en el marco o en las fuentes analizadas.', items: [] });
  }
  function clearAnswer() {
    S.highlight = null;
    S.els.askOut.textContent = '';
    S.els.askOut.parentNode.querySelectorAll('.sb-q').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    if (viewer) { viewer.setHighlight(null); viewer.reset(); }
  }

  function navEl() {
    const b = (label, txt, fn) => h('button', { type: 'button', class: 'sb-nav-btn', 'aria-label': label, title: label, text: txt, onclick: fn });
    return h('div', { class: 'sb-nav', role: 'group', 'aria-label': 'Controles de vista' }, [
      b('Girar a la izquierda', '↺', () => viewer && viewer.rotate(-0.3, 0)), b('Girar a la derecha', '↻', () => viewer && viewer.rotate(0.3, 0)),
      b('Inclinar hacia arriba', '↑', () => viewer && viewer.rotate(0, -0.2)), b('Inclinar hacia abajo', '↓', () => viewer && viewer.rotate(0, 0.2)),
      b('Acercar', '+', () => viewer && viewer.zoom(0.75)), b('Alejar', '−', () => viewer && viewer.zoom(1.33)),
      b('Centrar en la selección', '◎', () => { if (viewer && S.selected) viewer.focus(S.selected); }),
      b('Vista general', '⌂', () => viewer && viewer.reset()),
    ]);
  }

  /* ── Filtros ── */
  const FILTER_KEY = { state: 'states', type: 'types', region: 'regions', fam: 'families', stage: 'stages', kind: 'kinds', edge: 'edges' };
  function checkGroup(title, items, set, name) {   // item: { key, label, color? }
    return h('fieldset', { class: 'sb-fs' }, [
      h('legend', { text: title }),
      items.map((it) => {
        const id = 'sb-f-' + name + '-' + it.key;
        return h('label', { class: 'sb-check', for: id }, [
          h('input', { type: 'checkbox', id, checked: set.has(it.key), onchange: (ev) => { const cur = S.f[FILTER_KEY[name]] || set; ev.currentTarget.checked ? cur.add(it.key) : cur.delete(it.key); if (name === 'fam') syncFamilyUi(); applyFilters(); } }),
          it.color ? h('span', { class: 'sb-fdot', 'aria-hidden': 'true' }) : '',
          h('span', { text: it.label }),
        ]);
      }),
    ]);
  }
  function filtersEl() {
    const f = S.f;
    const regs = S.g.regions.filter((r) => r.count > 0);
    const relFs = checkGroup('Tipos de relación', Object.keys(EDGE).map((k) => ({ key: k, label: EDGE[k][0] })), f.edges, 'edge');
    relFs.insertBefore(h('label', { class: 'sb-select-label', for: 'sb-edgemode' }, ['Mostrar relaciones', h('select', { id: 'sb-edgemode', onchange: (ev) => { f.edgeMode = ev.currentTarget.value; applyFilters(); } }, [
      h('option', { value: 'foco', text: 'Solo del elemento señalado (recomendado)' }), h('option', { value: 'todas', text: 'Todas las de los tipos marcados' }),
    ])]), relFs.children[1]);
    const famFs = (S.g.families || []).length ? checkGroup('Familia tecnológica', (S.g.families || []).map((x) => ({ key: x.id, label: x.label, color: x.color })).concat(S.g.nodes.some((x) => x.type !== 'objetivo' && !x.family) ? [{ key: '_none', label: 'Sin clasificar', color: NEUTRAL.color }] : []), f.families, 'fam') : null;
    if (famFs) famFs.classList.add('is-fams');
    if (famFs) famFs.querySelectorAll('.sb-fdot').forEach((d, i) => { const x = (S.g.families || [])[i]; const p = x ? paintOf(x.color, x.ink || x.color, '') : paintOf(NEUTRAL.color, NEUTRAL.ink, ''); setPaint(d, p); });
    return h('div', { class: 'sb-filter-grid' }, [
      famFs || '',
      checkGroup('Etapa de conocimiento', S.taxApi.STAGES.map((x) => ({ key: x.id, label: x.label })), f.stages, 'stage'),
      checkGroup('Tipo de evidencia', Object.keys(KINDS).map((k) => ({ key: k, label: KINDS[k] })), f.kinds, 'kind'),
      h('label', { class: 'sb-check sb-dim', for: 'sb-dim' }, [h('input', { type: 'checkbox', id: 'sb-dim', checked: S.dim, onchange: (ev) => { S.dim = ev.currentTarget.checked; applyFilters(); } }), h('span', { text: 'Atenuar lo que no coincide en vez de ocultarlo (conserva el contexto del mapa)' })]),
      h('p', { class: 'sb-muted sb-filter-note' }, 'Lo que filtras se oculta del mapa y sus relaciones no se dibujan. Nada se borra: «Restablecer» lo devuelve todo.'),
      checkGroup('Estado de evidencia', Object.keys(STATE).map((k) => ({ key: k, label: STATE[k].short })), f.states, 'state'),
      checkGroup('Tipo', Object.keys(TYPE).map((k) => ({ key: k, label: TYPE[k][1] + ' ' + TYPE[k][0] })), f.types, 'type'),
      (() => {
        const fs = checkGroup('Áreas', regs.map((r) => ({ key: r.id, label: r.label })), f.regions, 'region');
        fs.appendChild(h('label', { class: 'sb-select-label', for: 'sb-goto' }, ['Acercar la cámara a', h('select', { id: 'sb-goto', onchange: (ev) => { if (viewer && ev.currentTarget.value) viewer.focusRegion(ev.currentTarget.value); ev.currentTarget.value = ''; } }, [h('option', { value: '', text: 'Elegir área…' }), regs.map((r) => h('option', { value: r.id, text: r.label }))])]));
        return fs;
      })(),
      h('fieldset', { class: 'sb-fs' }, [
        h('legend', { text: 'Prioridad' }),
        h('label', { class: 'sb-select-label', for: 'sb-prio' }, ['Mostrar', h('select', { id: 'sb-prio', onchange: (ev) => { f.priority = ev.currentTarget.value; applyFilters(); } }, [
          h('option', { value: '', text: 'Todo' }), h('option', { value: 'ahora', text: 'Solo lo prioritario ahora' }), h('option', { value: 'conRec', text: 'Solo lo que tiene recomendación' }),
        ])]),
      ]),
      relFs,
    ]);
  }

  function matchesFilters(n) {
    const f = S.f;
    if (!f.states.has(n.state) || !f.types.has(n.type) || !f.regions.has(n.region)) return false;
    if (n.type !== 'objetivo' && (S.g.families || []).length && !f.families.has(n.family || '_none')) return false;
    if (S.branchSet && !S.branchSet.has(n.id)) return false;
    if (S.viewSet && !S.viewSet.has(n.id)) return false;
    // etapa y tipo de evidencia solo hablan de conocimiento y proyectos: al acotarlos, el resto se oculta
    if (f.stages.size < S.taxApi.STAGES.length && !(n.stage && f.stages.has(n.stage))) return false;
    if (f.kinds.size < Object.keys(KINDS).length) {
      const k = n.evidence && n.evidence.kinds;
      if (!k || !Object.keys(k).some((x) => f.kinds.has(x))) return false;
    }
    if (f.priority) {
      const b = S.bucketOf.get(n.id);
      if (f.priority === 'ahora' && b !== 'ahora') return false;
      if (f.priority === 'conRec' && b !== 'ahora' && b !== 'despues') return false;
    }
    return true;
  }
  function activeFilters() {
    const f = S.f; let k = 0;
    if (f.states.size < Object.keys(STATE).length) k++;
    if (f.types.size < Object.keys(TYPE).length) k++;
    if (f.regions.size < S.g.regions.length) k++;
    if (f.families.size < (S.g.families || []).length + 1) k++;
    if (f.priority) k++;
    if (f.stages.size < S.taxApi.STAGES.length) k++;
    if (f.kinds.size < Object.keys(KINDS).length) k++;
    if (f.branch) k++;
    if (f.view) k++;
    return k;
  }
  function updateCount() {
    const total = S.g.nodes.length, n = S.visible.size;
    S.els.count.textContent = n === total ? plural(total, 'elemento', 'elementos') : n + ' de ' + plural(total, 'elemento', 'elementos') + ' (filtrado)';
  }
  function applyFilters(initial) {
    if (!S) return;
    S.branchSet = S.f.branch ? S.tax.branchSet(S.f.branch) : null;
    S.viewSet = S.f.view && S.views.has(S.f.view) ? S.taxApi.viewSet(S.g, S.tax, S.views.get(S.f.view)) : null;
    const vis = new Set(S.g.nodes.filter(matchesFilters).map((n) => n.id));
    S.visible = vis;
    const total = S.g.nodes.length;
    updateCount();
    const nAct = activeFilters();
    S.els.filterBtn.textContent = nAct ? 'Filtros (' + nAct + ')' : 'Filtros';
    S.els.filterBtn.classList.toggle('is-active', nAct > 0);
    syncFamilyUi();
    S.els.empty.hidden = vis.size > 0;
    if (S.selected && !vis.has(S.selected)) selectNode(null, 'filter');
    if (viewer) {
      const narrowed = vis.size < total;
      viewer.setFilter({ visible: narrowed && !S.dim ? vis : null, edgeTypes: S.f.edges, edgeMode: S.f.edgeMode });
      if (!S.highlight && !S.searchHl) viewer.setHighlight(narrowed && S.dim ? vis : null);
      if (vis.size > 0) viewer.refit(initial === true);
    }
    renderList();
    renderActive();
    renderQuick();
    syncIso();
  }
  function resetAll() {
    if (!S) return;
    const f = S.f;
    f.states = new Set(Object.keys(STATE)); f.types = new Set(Object.keys(TYPE)); f.regions = new Set(S.g.regions.map((r) => r.id));
    f.families = new Set((S.g.families || []).map((x) => x.id).concat('_none'));
    f.priority = ''; f.edgeMode = 'foco'; f.edges = new Set(Object.keys(EDGE).filter((k) => EDGE_DEFAULT_OFF.indexOf(k) < 0));
    S.els.filters.querySelectorAll('input[type=checkbox]').forEach((c) => {
      const m = /^sb-f-(\w+)-(.+)$/.exec(c.id);
      if (m) c.checked = m[1] === 'edge' ? f.edges.has(m[2]) : true;
    });
    syncFamilyUi();
    resetFilterState();
    S.dim = false;
    const dimBox = S.els.filters.querySelector('#sb-dim'); if (dimBox) dimBox.checked = false;
    syncFilterUi();
    S.els.filters.querySelector('#sb-prio').value = '';
    S.els.filters.querySelector('#sb-edgemode').value = 'foco';
    S.els.filters.open = false;
    S.els.search.value = ''; closeResults();
    if (S.highlight) { S.highlight = null; S.els.askOut.textContent = ''; if (viewer) viewer.setHighlight(null); }
    selectNode(null, 'reset');
    applyFilters();
    if (viewer) viewer.reset();
  }

  /* ── Búsqueda ── */
  function onSearch() {
    const q = norm(S.els.search.value).trim();
    const list = S.els.results;
    list.textContent = '';
    if (!q) { closeResults(); clearSearchHighlight(); return; }
    const words = q.split(/\s+/);
    const all = S.g.nodes.filter((n) => { const hay = norm(n.label + ' ' + n.summary + ' ' + famInfo(n).label); return words.every((w) => hay.indexOf(w) > -1); })
      .sort((a, b) => (norm(a.label).indexOf(q) === 0 ? 0 : 1) - (norm(b.label).indexOf(q) === 0 ? 0 : 1) || b.size - a.size);
    const hits = all.slice(0, 8);
    S.searchHl = all.length && all.length <= 80 ? new Set(all.map((n) => n.id)) : null;
    if (viewer && !S.highlight) viewer.setHighlight(S.searchHl);
    S.els.count.textContent = all.length ? plural(all.length, 'coincidencia', 'coincidencias') + (all.length > 8 ? ' (se listan 8)' : '') : 'Sin coincidencias';
    if (!hits.length) list.appendChild(h('li', { class: 'sb-noresult', role: 'option', 'aria-disabled': 'true', text: 'Sin resultados. Prueba con otra palabra o con el nombre de una tecnología.' }));
    hits.forEach((n, i) => list.appendChild(h('li', { role: 'option', id: 'sb-r-' + i, 'aria-selected': 'false' }, [
      h('button', { type: 'button', tabindex: '-1', onclick: () => pickResult(n.id) }, [
        chip(n), h('span', { class: 'sb-r-b' }, [h('span', { class: 'sb-r-t', text: n.label }), h('span', { class: 'sb-muted', text: TYPE[n.type][0] + ' · ' + famInfo(n).label })]),
      ]),
    ])));
    list.hidden = false; S.els.search.setAttribute('aria-expanded', 'true');
    S.hits = hits.map((n) => n.id); S.hitIdx = -1;
  }
  function onSearchKey(ev) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!S.hits || !S.hits.length) return;
      ev.preventDefault();
      S.hitIdx = (S.hitIdx + (ev.key === 'ArrowDown' ? 1 : -1) + S.hits.length) % S.hits.length;
      S.els.results.querySelectorAll('[role=option]').forEach((o, i) => o.setAttribute('aria-selected', i === S.hitIdx ? 'true' : 'false'));
      S.els.search.setAttribute('aria-activedescendant', 'sb-r-' + S.hitIdx);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (S.hits && S.hits.length) pickResult(S.hits[Math.max(0, S.hitIdx)]);
    } else if (ev.key === 'Escape') closeResults();
  }
  function clearSearchHighlight() { S.searchHl = null; if (viewer && !S.highlight) viewer.setHighlight(S.dim && S.visible && S.visible.size < S.g.nodes.length ? S.visible : null); if (S.visible) updateCount(); }
  function closeResults() { S.els.results.hidden = true; S.els.search.setAttribute('aria-expanded', 'false'); S.els.search.removeAttribute('aria-activedescendant'); S.hits = []; }
  function pickResult(id) {
    closeResults();
    clearSearchHighlight();
    if (!S.visible.has(id)) { const n = S.nodeById.get(id); resetAll(); ctx.setStatus('Se han quitado los filtros para mostrar «' + (n ? n.label : '') + '».'); }
    selectNode(id, 'search');
  }

  /* ═══════════ SELECCIÓN ═══════════ */
  // origin: 'viewer' (clic en el mapa), 'search', 'list', 'panel', 'rec', 'filter', 'reset'
  function selectNode(id, origin) {
    if (!S) return;
    S.selected = id || null;
    if (origin !== 'viewer' && viewer) viewer.select(S.selected, { silent: true });
    renderChip();
    renderDetail();
    syncTree(S.selected, origin);
    S.els.list.querySelectorAll('.sb-node').forEach((b) => { const onIt = b.getAttribute('data-id') === S.selected; b.classList.toggle('is-on', onIt); onIt ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'); });
    if (id && (origin === 'list' || origin === 'panel' || origin === 'ask')) S.els.detail.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (id && origin === 'rec') S.els.stage.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  function renderChip() {
    const chip = S.els.chip;
    chip.textContent = '';
    const n = S.selected && S.nodeById.get(S.selected);
    chip.hidden = !n;
    if (!n) return;
    const st = STATE[n.state] || STATE.neutral;
    chip.append(
      h('span', { class: 'sb-dot ' + st.cls, 'aria-hidden': 'true' }),
      h('span', { class: 'sb-chip-t' }, [h('strong', { text: n.label }), h('span', { class: 'sb-muted', text: ' · ' + TYPE[n.type][0] + ' · ' + st.short })]),
      h('button', { type: 'button', class: 'sb-chip-go', text: 'Ver detalle ↓', onclick: () => { S.els.detail.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); S.els.detail.focus({ preventScroll: true }); } }),
      h('button', { type: 'button', class: 'sb-chip-x', 'aria-label': 'Quitar selección', text: '×', onclick: () => selectNode(null, 'panel') }),
    );
  }

  /* ═══════════ DEBAJO DEL MAPA: DETALLE ═══════════ */
  function detailCard() {
    S.els.detail = h('section', { class: 'sb-card sb-detail', id: 'sb-detail', tabindex: '-1', 'aria-labelledby': 'sb-detail-h' });
    return S.els.detail;
  }
  function stateBadge(state) {
    const m = STATE[state] || STATE.neutral;
    return h('span', { class: 'sb-badge', title: m.hint }, [h('span', { class: 'sb-dot ' + m.cls, 'aria-hidden': 'true' }), m.label]);
  }
  function dt(k, v) { return [h('dt', { text: k }), h('dd', { text: v })]; }
  function regionLabel(id) { const r = S.g.regions.find((x) => x.id === id); return r ? r.label : id; }

  function renderDetail() {
    const box = S.els.detail;
    box.textContent = '';
    const n = S.selected && S.nodeById.get(S.selected);
    if (!n) {
      box.append(
        h('p', { class: 'sb-eyebrow', text: 'Detalle' }),
        h('h2', { class: 'sb-h', id: 'sb-detail-h', text: 'Selecciona un elemento del mapa' }),
        h('p', { class: 'sb-lead', text: 'Haz clic en un nodo, búscalo o elígelo en la lista. Aquí verás qué significa, qué evidencia lo respalda, qué no se ha podido comprobar y con qué se relaciona.' }),
        h('p', { class: 'sb-muted', text: 'Este panel explica el significado del nodo; no abre ni muestra tus documentos de origen.' }),
        overviewBlock(),
      );
      return;
    }
    const comp = S.compOf.get(n.id);
    box.append(
      h('div', { class: 'sb-detail-head' }, [
        h('div', null, [
          h('p', { class: 'sb-eyebrow', text: TYPE[n.type][0] + ' · ' + regionLabel(areaOf(n)) }),
          h('h2', { class: 'sb-h sb-h--icon', id: 'sb-detail-h' }, [chip(n, true), h('span', { text: n.label })]),
        ]),
        h('button', { type: 'button', class: 'ap-link-btn sb-nowrap', text: 'Quitar selección', onclick: () => selectNode(null, 'panel') }),
      ]),
      h('p', { class: 'sb-badges' }, [stateBadge(n.state)].concat(n.type === 'objetivo' ? [] : [famPill(n)]).concat((n.families || []).filter((f) => f !== n.family && S.famMap.has(f)).map((f) => famPill({ type: 'x', family: f })))),
      crumbEl(n),
      h('p', { class: 'sb-lead', text: n.summary }),
    );
    if (n.type === 'proyecto' && (n.group || n.link)) {
      box.append(h('p', { class: 'sb-muted' }, [
        n.group ? n.group : '',
        n.group && n.link ? ' · ' : '',
        n.link && /^https:\/\//.test(n.link) ? h('a', { href: n.link, target: '_blank', rel: 'noopener noreferrer', text: 'Ver lo publicado ↗' }) : '',
      ]));
    }
    const cols = h('div', { class: 'sb-detail-cols' });
    const left = h('div'), right = h('div');
    if (['tecnologia', 'concepto', 'tecnica', 'proyecto'].indexOf(n.type) > -1) {
      const ev = n.evidence;
      left.appendChild(h('section', { class: 'sb-block', 'aria-labelledby': 'sb-ev-h' }, [
        h('h3', { class: 'sb-h3', id: 'sb-ev-h', text: 'Evidencia' }),
        h('dl', { class: 'sb-dl' }, [
          dt('Práctica (código y artefactos)', plural(ev.practica, 'archivo', 'archivos')),
          dt('Documentación propia', plural(ev.explicativa, 'archivo', 'archivos')),
          n.type === 'proyecto' ? '' : dt('Declarada (CV, listas)', plural(ev.declarativa, 'fuente', 'fuentes')),
          n.type === 'proyecto' ? '' : dt('Amplitud', ev.projects ? plural(ev.projects, 'proyecto', 'proyectos') + ' (' + ev.breadth + ')' : 'ninguna'),
        ]),
      ]));
    }
    { const stg = stageBlock(n); if (stg) left.appendChild(stg); }
    { const br = branchBlock(n); if (br) left.appendChild(br); }
    if (comp) left.appendChild(competencyBlock(comp));
    if (n.uncertainty.length) left.appendChild(h('section', { class: 'sb-block', 'aria-labelledby': 'sb-unc-h' }, [h('h3', { class: 'sb-h3', id: 'sb-unc-h', text: 'Incertidumbres' }), h('ul', { class: 'sb-list' }, n.uncertainty.map((u) => h('li', { text: u })))]));
    if (n.assessment) left.appendChild(h('p', { class: 'sb-banner is-warn' }, [h('strong', { text: 'Evaluación registrada: ' }), n.assessment.reason + ' (' + n.assessment.source + ')']));
    const imp = importanceBlock(n); if (imp) right.appendChild(imp);
    { const ap = appliesBlock(n); if (ap) right.appendChild(ap); }
    { const so = sourcesBlock(n); if (so) right.appendChild(so); }
    const rel = relationsBlock(n); if (rel) right.appendChild(rel);
    const rec = n.recommendationId && S.recById.get(n.recommendationId);
    if (rec) right.appendChild(h('section', { class: 'sb-block', 'aria-labelledby': 'sb-recd-h' }, [h('h3', { class: 'sb-h3', id: 'sb-recd-h', text: 'Recomendación asociada' }), recCard(rec, true)]));
    right.insertBefore(userBlock(n), right.firstChild);
    cols.append(left, right);
    box.appendChild(cols);
  }

  function overviewBlock() {
    const g = S.g;
    const count = (st) => g.nodes.filter((n) => ['tecnologia', 'concepto', 'tecnica'].indexOf(n.type) > -1 && n.state === st).length;
    const rows = [['respaldado', count('respaldado')], ['mencionado', count('mencionado')], ['pendiente', count('pendiente')], ['brecha_probable', count('brecha_probable')], ['brecha_confirmada', count('brecha_confirmada')]].filter((r) => r[1] > 0);
    const max = Math.max.apply(null, rows.map((r) => r[1]).concat(1));
    return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-ov-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-ov-h', text: 'Conceptos por estado de evidencia' }),
      h('ul', { class: 'sb-bars' }, rows.map((r) => {
        const fill = h('span', { class: 'sb-bar-fill ' + STATE[r[0]].cls });
        fill.style.width = Math.max(2, Math.round((r[1] / max) * 100)) + '%';   // CSSOM: permitido por la CSP
        return h('li', null, [
          h('span', { class: 'sb-bar-l2', text: STATE[r[0]].short }),
          h('span', { class: 'sb-bar-track', 'aria-hidden': 'true' }, [fill]),
          h('span', { class: 'sb-bar-v', text: String(r[1]) }),
        ]);
      })),
      h('p', { class: 'sb-muted', text: 'Cuenta conceptos, técnicas y tecnologías. «Respaldado» indica que hay evidencia de haber trabajado con ello, no el nivel de dominio.' }),
    ]);
  }

  function competencyBlock(comp) {
    const meta = S.g.meta;
    return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-comp-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-comp-h', text: 'Frente a los niveles de referencia' }),
      h('table', { class: 'sb-table' }, [
        h('caption', { class: 'sr-only', text: 'Relevancia de la competencia por nivel' }),
        h('thead', null, [h('tr', null, [h('th', { scope: 'col', text: 'Nivel' }), h('th', { scope: 'col', text: 'Relevancia' })])]),
        h('tbody', null, meta.levels.map((l) => h('tr', { class: l.id === meta.targetLevel ? 'is-target' : null }, [
          h('th', { scope: 'row', text: (LEVELS[l.id] || l.label) + (l.id === meta.targetLevel ? ' · objetivo' : '') }),
          h('td', null, [h('span', { class: 'sb-pips', 'aria-hidden': 'true' }, [0, 1, 2].map((i) => h('span', { class: 'sb-pip' + (i < comp.levels[l.id] ? ' is-on' : '') }))), h('span', { text: ' ' + comp.levels[l.id] + ' / 3' })]),
        ]))),
      ]),
      h('dl', { class: 'sb-dl' }, [
        dt('Prioridad', comp.priority.score + ' (relevancia × distancia)'),
        dt('Confianza', comp.confidence),
        dt('Esfuerzo orientativo', comp.effort + ' · estimación genérica'),
      ]),
      comp.unverified.length ? h('details', { class: 'sb-more', open: true }, [h('summary', { text: 'Sin comprobar (' + comp.unverified.length + ')' }), h('ul', { class: 'sb-list' }, comp.unverified.map((u) => h('li', { text: u })))]) : '',
    ]);
  }

  function importanceBlock(n) {
    if (['tecnologia', 'concepto', 'tecnica'].indexOf(n.type) < 0) return null;
    const items = S.adj.get(n.id).filter((a) => a.e.type === 'agrupa').map((a) => {
      const comp = S.compOf.get(a.other);
      return comp ? `${S.nodeById.get(a.other).label}: relevancia ${comp.levels[S.g.meta.targetLevel]}/3 para «${S.g.meta.targetLabel}»` : null;
    }).filter(Boolean);
    if (!items.length) return null;
    return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-imp-h' }, [h('h3', { class: 'sb-h3', id: 'sb-imp-h', text: 'Importancia para tus objetivos' }), h('ul', { class: 'sb-list' }, items.map((t) => h('li', { text: t })))]);
  }

  function relationsBlock(n) {
    const order = ['demuestra', 'requiere', 'usa', 'parte-de', 'habilita', 'mejora', 'recomienda', 'agrupa', 'necesita'];
    const list = S.adj.get(n.id).slice().sort((a, b) => order.indexOf(a.e.type) - order.indexOf(b.e.type) || S.nodeById.get(a.other).label.localeCompare(S.nodeById.get(b.other).label, 'es'));
    if (!list.length) return null;
    const shown = list.slice(0, 10);
    return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-rel-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-rel-h', text: 'Relaciones principales (' + list.length + ')' }),
      h('ul', { class: 'sb-rels' }, shown.map((a) => {
        const o = S.nodeById.get(a.other);
        return h('li', null, [
          h('button', { type: 'button', class: 'sb-rel', onclick: () => selectNode(o.id, 'panel') }, [
            h('span', { class: 'sb-rel-k', text: a.out ? EDGE[a.e.type][1] + ' →' : '← ' + EDGE[a.e.type][1] }),
            chip(o),
            h('span', { class: 'sb-rel-t', text: o.label }),
          ]),
          h('span', { class: 'sb-why', text: a.e.rationale + ' (confianza ' + a.e.confidence + ')' }),
        ]);
      })),
      list.length > shown.length ? h('p', { class: 'sb-muted', text: 'Se muestran ' + shown.length + ' de ' + list.length + '.' }) : '',
    ]);
  }

  /* ═══════════ DEBAJO DEL MAPA: RECOMENDACIONES ═══════════ */
  function recCard(r, open) {
    return h('details', { class: 'sb-rec' + (r.priority.bucket === 'ahora' ? ' is-now' : ''), open: open ? true : null }, [
      h('summary', null, [
        h('span', { class: 'sb-prio sb-prio--' + r.priority.bucket, text: BUCKET[r.priority.bucket] + ' · ' + r.priority.score }),
        h('span', { class: 'sb-rec-t', text: r.what }),
      ]),
      h('dl', { class: 'sb-rec-dl' }, [
        dt('Por qué', r.why), dt('Evidencia o requisito', r.evidence), dt('Acción concreta', r.action), dt('Resultado que se busca', r.result),
        dt('Objetivo', r.objective), dt('Esfuerzo', r.effort), dt('Confianza', r.confidence),
      ]),
      h('p', null, [h('button', { type: 'button', class: 'ap-link-btn', text: 'Ver en el mapa', onclick: () => selectNode(r.targetId, 'rec') })]),
    ]);
  }
  function recsCard() {
    const g = S.g;
    const box = h('section', { class: 'sb-card sb-recs', 'aria-labelledby': 'sb-recs-h' }, [
      h('p', { class: 'sb-eyebrow', text: 'Recomendaciones' }),
      h('h2', { class: 'sb-h', id: 'sb-recs-h', text: 'Qué hacer, en orden' }),
      h('p', { class: 'sb-muted', text: 'Prioridad = relevancia para «' + g.meta.targetLabel + '» × distancia al objetivo, ponderada por la confianza. Es una guía para decidir, no una evaluación.' }),
    ]);
    ['ahora', 'despues'].forEach((b) => {
      const recs = g.recommendations.filter((r) => r.priority.bucket === b).sort((x, y) => y.priority.score - x.priority.score);
      box.appendChild(h('h3', { class: 'sb-h3', text: BUCKET[b] + ' (' + recs.length + ')' }));
      if (!recs.length) box.appendChild(h('p', { class: 'sb-muted', text: b === 'ahora' ? 'Nada urgente con la información disponible.' : 'Sin recomendaciones.' }));
      recs.forEach((r) => box.appendChild(recCard(r, b === 'ahora')));
    });
    const later = g.meta.deferred || [];
    box.appendChild(h('details', { class: 'sb-more' }, [
      h('summary', { text: 'Todavía no (' + later.length + ')' }),
      later.length ? h('ul', { class: 'sb-list' }, later.map((d) => h('li', null, [h('strong', { text: d.label + ': ' }), d.reason]))) : h('p', { class: 'sb-muted', text: 'Nada aplazado.' }),
    ]));
    box.appendChild(h('details', { class: 'sb-more' }, [
      h('summary', { text: 'Cómo se calcula la prioridad' }),
      h('p', { text: g.meta.scoring.formula }),
      h('p', { text: 'Distancia según estado: ' + Object.keys(g.meta.scoring.distance).map((k) => k + ' ' + g.meta.scoring.distance[k]).join(' · ') + '.' }),
      h('p', { text: g.meta.scoring.buckets }),
      h('p', { text: g.meta.basis }),
    ]));
    const cov = g.coverage;
    box.appendChild(h('details', { class: 'sb-more' }, [
      h('summary', { text: 'Qué se ha analizado y qué límites tiene' }),
      h('p', { text: 'Fuentes: ' + cov.sources.map((s) => s.label + ' (' + plural(s.supported, 'archivo leído', 'archivos leídos') + ')').join(' · ') + '.' }),
      h('ul', { class: 'sb-list' }, g.meta.limitations.map((l) => h('li', { text: l }))),
    ]));
    return box;
  }

  /* ═══════════ LISTA ACCESIBLE ═══════════ */
  function listCard() {
    S.els.list = h('div', { class: 'sb-list-body' });
    return h('details', { class: 'sb-card sb-all' }, [
      h('summary', null, [h('span', { class: 'sb-eyebrow', text: 'Alternativa al mapa' }), h('span', { class: 'sb-h sb-h--sm', text: 'Todos los elementos, agrupados' })]),
      S.els.list,
    ]);
  }
  /* Lista completa: agrupada por familia, área o tipo; cada grupo se pliega y tiene su contador. Respeta los filtros. */
  function listGroups() {
    const key = S.listGroup;
    if (key === 'area') return S.g.regions.map((r) => ({ id: r.id, label: r.label, paint: paintOf(r.color || '#273a5f', r.color || '#273a5f', ''), of: (n) => n.region === r.id }));
    if (key === 'tipo') return Object.keys(TYPE).map((t) => ({ id: t, label: TYPE[t][0] + 's', paint: paintOf('#273a5f', '#273a5f', ''), of: (n) => n.type === t }));
    const fams = (S.g.families || []).map((f) => ({ id: f.id, label: f.label, paint: paintOf(f.color, f.ink || f.color, ''), of: (n) => n.type !== 'objetivo' && n.family === f.id }));
    return fams.concat([{ id: '_none', label: 'Sin clasificar', paint: paintOf(NEUTRAL.color, NEUTRAL.ink, ''), of: (n) => n.type !== 'objetivo' && !n.family }, { id: '_obj', label: 'Objetivos', paint: paintOf('#273a5f', '#273a5f', ''), of: (n) => n.type === 'objetivo' }]);
  }
  function listControls() {
    const box = S.els.list;
    S.els.listBody = h('div', { class: 'sb-list-groups' });
    const sel = h('select', { id: 'sb-list-by', onchange: (ev) => { S.listGroup = ev.currentTarget.value; S.listOpen = new Set(); renderList(); } }, [
      (S.g.families || []).length ? h('option', { value: 'familia', text: 'Familia tecnológica' }) : '', h('option', { value: 'area', text: 'Área' }), h('option', { value: 'tipo', text: 'Tipo' }),
    ]);
    if (!(S.g.families || []).length) { S.listGroup = 'area'; }
    sel.value = S.listGroup;
    const all = (open) => { S.listOpen = new Set(open ? listGroups().map((g) => g.id) : []); renderList(); };
    box.append(
      h('div', { class: 'sb-list-ctl' }, [
        h('label', { class: 'sb-select-label', for: 'sb-list-by' }, ['Agrupar por', sel]),
        h('label', { class: 'sb-select-label', for: 'sb-list-q' }, ['Buscar en la lista', h('input', { type: 'search', id: 'sb-list-q', placeholder: 'Nombre o palabra', autocomplete: 'off', oninput: (ev) => { S.listQ = ev.currentTarget.value; renderList(); } })]),
        h('button', { type: 'button', class: 'sb-btn', text: 'Expandir todo', onclick: () => all(true) }),
        h('button', { type: 'button', class: 'sb-btn', text: 'Contraer todo', onclick: () => all(false) }),
      ]),
      S.els.listBody,
    );
  }
  function renderList() {
    if (!S) return;
    if (!S.els.listBody) listControls();
    const body = S.els.listBody;
    body.textContent = '';
    const q = norm(S.listQ).trim();
    let shown = 0;
    listGroups().forEach((gr) => {
      const ns = S.g.nodes.filter((n) => gr.of(n) && S.visible.has(n.id) && (!q || norm(n.label).indexOf(q) > -1)).sort((a, b) => a.label.localeCompare(b.label, 'es'));
      if (!ns.length) return;
      shown += ns.length;
      const open = !!q || S.listOpen.has(gr.id) || (S.selected && ns.some((n) => n.id === S.selected));
      const det = h('details', { class: 'sb-grp', open: open ? true : null, 'data-g': gr.id }, [
        h('summary', null, [h('span', { class: 'sb-gdot', 'aria-hidden': 'true' }), h('span', { class: 'sb-gname', text: gr.label }), h('span', { class: 'sb-gcount', text: String(ns.length) })]),
        h('ul', { class: 'sb-nodelist' }, ns.map((n) => h('li', null, [
          h('button', { type: 'button', class: 'sb-node' + (S.selected === n.id ? ' is-on' : ''), 'data-id': n.id, 'aria-current': S.selected === n.id ? 'true' : null, onclick: () => selectNode(n.id, 'list') }, [
            chip(n),
            h('span', { class: 'sb-node-b' }, [
              h('span', { class: 'sb-node-t', text: n.label + (n.user && n.user.propio ? ' ✎' : '') }),
              h('span', { class: 'sb-muted', text: TYPE[n.type][0] + ' · ' + (STATE[n.state] || STATE.neutral).short }),
            ]),
          ]),
        ]))),
      ]);
      setPaint(det.querySelector('.sb-gdot'), gr.paint);
      det.addEventListener('toggle', () => { det.open ? S.listOpen.add(gr.id) : S.listOpen.delete(gr.id); });
      body.appendChild(det);
    });
    if (!shown) body.appendChild(h('p', { class: 'sb-muted', text: q ? 'Ningún elemento coincide con «' + S.listQ + '».' : 'Ningún elemento cumple los filtros actuales.' }));
  }

  /* ═══════════ v7: JERARQUÍA DEL CONOCIMIENTO, VISTAS RÁPIDAS Y COBERTURA ═══════════
     Toda la lógica (árbol, ramas, vistas, resumen) vive en second-brain/taxonomy.js y es pura; aquí solo se pinta. */
  const KINDS = { notebook: 'Notebook', script: 'Script de Python', sql: 'SQL', modelo: 'Modelo (DAX, Power Query)', informe: 'Informe (.pbix)', publicado: 'Publicado en el portfolio', documento: 'Documento (README, manual)', otro: 'Otro' };
  const stageOf = (id) => S.taxApi.STAGE_BY_ID.get(id);
  const plus = (n, one, many) => plural(n, one, many);

  function stagePill(n) {
    const st = stageOf(n.stage);
    if (!st) return '';
    return h('span', { class: 'sb-stg is-' + n.stage, title: st.hint }, [h('span', { class: 'sb-stg-d', 'aria-hidden': 'true' }), st.short]);
  }
  const countProjects = (n) => S.tax.projectsOf(n.id, true).length;

  /* ── Explorador: el árbol ── */
  function exploreEl() {
    return h('div', { class: 'sb-explore' }, [treeCard(), summaryCard()]);
  }
  function treeCard() {
    const withKids = S.tax.roots.filter((r) => (S.tax.kids.get(r.id) || []).length);
    S.treeOpen = new Set(withKids.map((r) => r.id));
    S.els.treeBody = h('div', { class: 'sb-tree' });
    const card = h('section', { class: 'sb-card sb-treecard', 'aria-labelledby': 'sb-tree-h' }, [
      h('p', { class: 'sb-eyebrow', text: 'Explorar' }),
      h('h2', { class: 'sb-h sb-h--sm', id: 'sb-tree-h', text: 'Qué conoces y dónde lo has aplicado' }),
      h('p', { class: 'sb-muted', text: 'Área → disciplina → técnica → proyectos. La estructura sale de cómo organizas tus carpetas. «Aislar» deja en el mapa solo esa rama y los proyectos que la aplican.' }),
      h('div', { class: 'sb-tree-ctl' }, [
        h('button', { type: 'button', class: 'sb-btn', text: 'Expandir todo', onclick: () => { S.treeOpen = new Set(S.tax.tree.filter((n) => (S.tax.kids.get(n.id) || []).length).map((n) => n.id).concat('_otros')); renderTree(); } }),
        h('button', { type: 'button', class: 'sb-btn', text: 'Contraer todo', onclick: () => { S.treeOpen = new Set(); renderTree(); } }),
      ]),
      S.els.treeBody,
    ]);
    renderTree();
    return card;
  }
  function treeRow(n) {
    const kids = S.tax.kids.get(n.id) || [];
    const open = S.treeOpen.has(n.id);
    const sel = S.selected === n.id, iso = S.f.branch === n.id;
    const np = countProjects(n);
    const bits = [stageOf(n.stage) ? stageOf(n.stage).short : ''];
    if (n.branch) bits.push(n.branch.aplicado + '/' + n.branch.leaves + ' con práctica');
    if (np) bits.push(plus(np, 'proyecto', 'proyectos'));
    const li = h('li', { class: 'sb-tn' });
    li.appendChild(h('div', { class: 'sb-tn-row' }, [
      kids.length
        ? h('button', { type: 'button', class: 'sb-tn-tog', 'data-tog': n.id, 'aria-expanded': open ? 'true' : 'false', 'aria-label': (open ? 'Contraer ' : 'Expandir ') + n.label, text: open ? '▾' : '▸', onclick: () => { open ? S.treeOpen.delete(n.id) : S.treeOpen.add(n.id); renderTree(n.id); } })
        : h('span', { class: 'sb-tn-sp', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'sb-tn-main' + (sel ? ' is-on' : ''), 'data-id': n.id, 'aria-current': sel ? 'true' : null, onclick: () => selectNode(n.id, 'tree') }, [
        chip(n), h('span', { class: 'sb-tn-b' }, [h('span', { class: 'sb-tn-t', text: n.label }), h('span', { class: 'sb-muted', text: bits.filter(Boolean).join(' · ') })]),
      ]),
      (kids.length || np) ? h('button', { type: 'button', class: 'sb-tn-iso' + (iso ? ' is-on' : ''), 'data-iso': n.id, 'aria-pressed': iso ? 'true' : 'false', title: 'Mostrar en el mapa solo esta rama y los proyectos que la aplican', 'aria-label': 'Aislar la rama ' + n.label, text: iso ? 'Aislada ✓' : 'Aislar', onclick: () => isolateBranch(n.id) }) : '',
    ]));
    if (kids.length && open) li.appendChild(h('ul', { class: 'sb-tn-kids' }, kids.map(treeRow)));
    return li;
  }
  function renderTree(focusTog) {
    const body = S.els.treeBody;
    body.textContent = '';
    const withKids = S.tax.roots.filter((r) => (S.tax.kids.get(r.id) || []).length);
    const single = S.tax.roots.filter((r) => !(S.tax.kids.get(r.id) || []).length);
    body.appendChild(h('ul', { class: 'sb-tn-roots' }, withKids.map(treeRow)));
    if (single.length) {
      const open = S.treeOpen.has('_otros');
      body.appendChild(h('div', { class: 'sb-tn-other' }, [
        h('button', { type: 'button', class: 'sb-tn-tog', 'data-tog': '_otros', 'aria-expanded': open ? 'true' : 'false', text: (open ? '▾ ' : '▸ ') + 'Otros conceptos sueltos (' + single.length + ')', onclick: () => { open ? S.treeOpen.delete('_otros') : S.treeOpen.add('_otros'); renderTree('_otros'); } }),
        open ? h('ul', { class: 'sb-tn-roots' }, single.map(treeRow)) : '',
      ]));
    }
    if (focusTog) { const b = body.querySelector('[data-tog="' + focusTog + '"]'); if (b) b.focus(); }
  }
  /* al seleccionar desde el mapa o la lista, el árbol abre el camino y marca el elemento sin robar el foco */
  function syncTree(id, origin) {
    if (!S.els.treeBody) return;
    let needs = false;
    if (id && origin !== 'tree') for (const a of S.tax.pathOf(id)) { if (a.id !== id && !S.treeOpen.has(a.id) && (S.tax.kids.get(a.id) || []).length) { S.treeOpen.add(a.id); needs = true; } }
    if (needs) renderTree();
    S.els.treeBody.querySelectorAll('.sb-tn-main').forEach((b) => { const on = b.getAttribute('data-id') === id; b.classList.toggle('is-on', on); on ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'); });
  }
  function isolateBranch(id) {
    S.f.branch = S.f.branch === id ? null : id;
    S.f.view = null; S.quick = S.f.branch && S.views.has('branch:' + id) ? 'branch:' + id : null;
    applyFilters();
  }

  /* ── Cobertura por área y calidad de la clasificación ── */
  function stackBar(a, b, c) {
    const total = Math.max(1, a + b + c);
    const el = h('span', { class: 'sb-stack', 'aria-hidden': 'true' });
    [['is-ap', a], ['is-doc', b], ['is-none', c]].forEach(([cls, v]) => { if (!v) return; const s = h('span', { class: cls }); s.style.width = (v / total * 100) + '%'; el.appendChild(s); });
    return el;
  }
  function summaryCard() {
    const sm = S.taxApi.summary(S.g, S.tax);
    S.sum = sm;
    const q = sm.quality;
    const qrow = (n, text, viewId) => (n > 0 ? h('li', null, [h('strong', { text: String(n) }), ' ' + text + ' ', S.views.has(viewId) ? h('button', { type: 'button', class: 'ap-link-btn', text: 'Ver', onclick: () => applyView(S.views.get(viewId)) }) : '']) : '');
    return h('section', { class: 'sb-card sb-sumcard', 'aria-labelledby': 'sb-sum-h' }, [
      h('p', { class: 'sb-eyebrow', text: 'Cobertura' }),
      h('h2', { class: 'sb-h sb-h--sm', id: 'sb-sum-h', text: 'Qué hay en cada área' }),
      h('p', { class: 'sb-muted', text: 'Cuenta técnicas (hojas del árbol): con práctica detectada, solo documentadas o sin evidencia. Mide cobertura y aplicación, no dominio: una técnica con cinco proyectos no se sabe mejor que una con uno bien evaluado.' }),
      h('ul', { class: 'sb-cov' }, sm.areas.map((a) => h('li', null, [
        h('button', { type: 'button', class: 'ap-link-btn sb-cov-n', text: a.node.label, title: 'Aislar esta área en el mapa', onclick: () => isolateBranch(a.node.id) }),
        stackBar(a.aplicado, a.documentado, a.sinEvidencia),
        h('span', { class: 'sb-muted', text: a.aplicado + ' con práctica' + (a.documentado ? ' · ' + a.documentado + ' documentadas' : '') + (a.sinEvidencia ? ' · ' + a.sinEvidencia + ' sin evidencia' : '') + ' · ' + plus(a.projects, 'proyecto', 'proyectos') }),
      ]))),
      sm.others.nodes ? h('p', { class: 'sb-muted', text: 'Además, ' + plus(sm.others.nodes, 'concepto suelto', 'conceptos sueltos') + ' sin ramas propias (' + sm.others.aplicado + ' con práctica, ' + sm.others.documentado + ' documentados).' }) : '',
      h('ul', { class: 'sb-leg-ev sb-cov-key' }, [h('li', null, [h('span', { class: 'sb-key is-ap', 'aria-hidden': 'true' }), 'Con práctica']), h('li', null, [h('span', { class: 'sb-key is-doc', 'aria-hidden': 'true' }), 'Solo documentada']), h('li', null, [h('span', { class: 'sb-key is-none', 'aria-hidden': 'true' }), 'Sin evidencia'])]),
      h('h3', { class: 'sb-h3', text: 'Calidad de la clasificación' }),
      h('ul', { class: 'sb-qual' }, [
        h('li', null, [h('strong', { text: String(q.projects) }), ' proyectos, cada uno como una sola entidad con todas sus fuentes.']),
        qrow(q.merged, q.merged === 1 ? 'proyecto unificado desde varias fuentes (carpeta del portfolio, repositorio, página publicada).' : 'proyectos unificados desde varias fuentes (carpeta del portfolio, repositorio, página publicada).'),
        S.g.quality && S.g.quality.candidates && S.g.quality.candidates.length ? h('li', null, [h('strong', { text: String(S.g.quality.candidates.length) }), ' posible duplicado sin vínculo explícito (no se ha unido): ' + S.g.quality.candidates.map((c) => c.title).join(' · ') + '.']) : '',
        S.g.quality && S.g.quality.notInspected && S.g.quality.notInspected.length ? h('li', null, [h('strong', { text: String(S.g.quality.notInspected.length) }), ' fuente(s) sin inspeccionar: ' + S.g.quality.notInspected.map((c) => c.label).join(', ') + '. Lo que hay en ellas no está en el mapa.']) : '',
        qrow(q.indexes, q.indexes === 1 ? 'índice ignorado (README que enlaza a otros proyectos).' : 'índices ignorados (README que enlazan a otros proyectos).'),
        qrow(q.noReadme, q.noReadme === 1 ? 'proyecto sin documentación escrita.' : 'proyectos sin documentación escrita.', 'sin-documentar'),
        qrow(q.docOnly, 'proyectos donde la carpeta declara una técnica que el código no confirma.', 'discrepancias'),
        qrow(q.unclassified, 'proyectos sin clasificar.', 'sin-clasificar'),
        q.docOnly === 0 && q.unclassified === 0 ? h('li', { class: 'sb-muted', text: 'Sin discrepancias entre carpetas y código ni proyectos sin clasificar.' }) : '',
      ]),
    ]);
  }

  /* ── Vistas rápidas y filtros activos ── */
  function quickEl() {
    S.views = new Map(S.taxApi.quickViews(S.g, S.tax).map((v) => [v.id, v]));
    S.quick = null;
    S.els.quick = h('div', { class: 'sb-quick', role: 'group', 'aria-label': 'Vistas rápidas' });
    renderQuick();
    return S.els.quick;
  }
  function renderQuick() {
    const box = S.els.quick;
    box.textContent = '';
    const on = (id) => (S.quick || 'todo') === id;
    const btn = (id, label, hint, fn) => h('button', { type: 'button', class: 'sb-q-chip', 'aria-pressed': on(id) ? 'true' : 'false', title: hint, onclick: fn }, label);
    box.appendChild(btn('todo', 'Todo', 'Quita los filtros y muestra todo el conocimiento', () => applyView(null)));
    for (const v of S.views.values()) box.appendChild(btn(v.id, v.label + ' (' + v.count + ')', v.hint, () => applyView(v)));
  }
  function applyView(v) {
    const f = S.f;
    resetFilterState();
    if (v) { if (v.branch) f.branch = v.branch; else if (v.stages) f.stages = new Set(v.stages); else f.view = v.id; }
    S.quick = v ? v.id : null;
    syncFilterUi();
    applyFilters();
  }
  function activeList() {
    const f = S.f, out = [];
    const tot = (set, all) => set.size < all;
    if (f.branch) out.push(['Rama: ' + (S.nodeById.get(f.branch) || {}).label, () => { f.branch = null; S.quick = null; }]);
    if (f.view && S.views.has(f.view)) out.push(['Vista: ' + S.views.get(f.view).label, () => { f.view = null; S.quick = null; }]);
    if (tot(f.stages, S.taxApi.STAGES.length)) out.push(['Etapa: ' + [...f.stages].map((x) => (stageOf(x) || {}).short).join(', '), () => { f.stages = new Set(S.taxApi.STAGES.map((x) => x.id)); S.quick = null; }]);
    if (tot(f.families, (S.g.families || []).length + 1)) out.push(['Familia: ' + [...f.families].map((x) => (S.famMap.get(x) || { label: 'Sin clasificar' }).label).slice(0, 3).join(', '), () => { f.families = new Set((S.g.families || []).map((x) => x.id).concat('_none')); }]);
    if (tot(f.kinds, Object.keys(KINDS).length)) out.push(['Evidencia: ' + [...f.kinds].map((x) => KINDS[x]).slice(0, 3).join(', '), () => { f.kinds = new Set(Object.keys(KINDS)); }]);
    if (tot(f.states, Object.keys(STATE).length)) out.push(['Estado: ' + [...f.states].map((x) => STATE[x].short).slice(0, 3).join(', '), () => { f.states = new Set(Object.keys(STATE)); }]);
    if (tot(f.types, Object.keys(TYPE).length)) out.push(['Tipo: ' + [...f.types].map((x) => TYPE[x][0]).slice(0, 3).join(', '), () => { f.types = new Set(Object.keys(TYPE)); }]);
    if (tot(f.regions, S.g.regions.length)) out.push(['Áreas: ' + f.regions.size + ' de ' + S.g.regions.length, () => { f.regions = new Set(S.g.regions.map((r) => r.id)); }]);
    if (f.priority) out.push(['Prioridad: ' + (f.priority === 'ahora' ? 'ahora' : 'con recomendación'), () => { f.priority = ''; }]);
    return out;
  }
  function renderActive() {
    const box = S.els.active;
    const list = activeList();
    box.textContent = '';
    box.hidden = !list.length;
    if (!list.length) return;
    box.appendChild(h('span', { class: 'sb-muted', text: 'Filtros activos:' }));
    list.forEach(([text, clear]) => box.appendChild(h('span', { class: 'sb-fchip' }, [text, h('button', { type: 'button', 'aria-label': 'Quitar el filtro «' + text + '»', text: '×', onclick: () => { clear(); syncFilterUi(); applyFilters(); } })])));
    box.appendChild(h('button', { type: 'button', class: 'ap-link-btn', text: 'Quitar todos', onclick: () => { resetFilterState(); syncFilterUi(); applyFilters(); } }));
    box.appendChild(h('span', { class: 'sb-muted sb-fmode', text: S.dim ? 'Lo que no coincide se atenúa.' : 'Lo que no coincide se oculta (sus relaciones no se dibujan).' }));
  }
  function resetFilterState() {
    const f = S.f;
    f.states = new Set(Object.keys(STATE)); f.types = new Set(Object.keys(TYPE)); f.regions = new Set(S.g.regions.map((r) => r.id));
    f.families = new Set((S.g.families || []).map((x) => x.id).concat('_none'));
    f.stages = new Set(S.taxApi.STAGES.map((x) => x.id)); f.kinds = new Set(Object.keys(KINDS));
    f.branch = null; f.view = null; f.priority = '';
    S.quick = null;
  }
  /* sincroniza las casillas de los filtros con el estado (tras una vista rápida o al quitar un filtro) */
  function syncFilterUi() {
    const f = S.f;
    const sets = { state: f.states, type: f.types, region: f.regions, fam: f.families, stage: f.stages, kind: f.kinds };
    S.els.filters.querySelectorAll('input[type=checkbox]').forEach((c) => {
      const m = /^sb-f-(\w+)-(.+)$/.exec(c.id);
      if (m && sets[m[1]]) c.checked = sets[m[1]].has(m[2]);
    });
    const prio = S.els.filters.querySelector('#sb-prio'); if (prio) prio.value = f.priority;
    renderQuick();
  }

  /* ── Detalle: ruta, etapa, rama, proyectos que lo aplican, técnicas, fuentes ── */
  function crumbEl(n) {
    const path = S.tax.pathOf(n.id);
    if (path.length < 2) return '';
    return h('nav', { class: 'sb-crumb', 'aria-label': 'Ruta en la jerarquía' }, [h('ol', null, path.map((p, i) => h('li', null, [
      i === path.length - 1 ? h('span', { 'aria-current': 'page', text: p.label }) : h('button', { type: 'button', class: 'ap-link-btn', text: p.label, onclick: () => selectNode(p.id, 'panel') }),
    ])))]);
  }
  function stageBlock(n) {
    const st = stageOf(n.stage);
    if (!st) return null;
    const ladder = S.taxApi.STAGES.filter((s) => s.id !== 'sin_evidencia');
    const cur = st.order;
    return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-stage-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-stage-h', text: 'Etapa de conocimiento' }),
      h('p', null, [stagePill(n), ' ', h('span', { class: 'sb-muted', text: st.hint })]),
      h('ol', { class: 'sb-steps', 'aria-label': 'Etapas' }, ladder.map((s) => h('li', { class: stageOf(s.id).order < cur ? 'is-done' : stageOf(s.id).order === cur ? 'is-now' : '', 'aria-current': stageOf(s.id).order === cur ? 'step' : null }, [s.short]))),
      h('p', { class: 'sb-muted', text: S.taxApi.stageNext(n) }),
      n.stageNote ? h('p', { class: 'sb-banner' }, [h('strong', { text: 'Registrado por ti: ' }), n.stageNote.reason + ' (' + n.stageNote.source + ')']) : '',
      h('p', { class: 'sb-muted', text: 'Es una etapa de evidencia, no una nota: ni el número de proyectos ni la antigüedad miden el dominio.' }),
    ]);
  }
  function relBtn(o, extra) {
    return h('li', null, [h('button', { type: 'button', class: 'sb-rel', onclick: () => selectNode(o.id, 'panel') }, [chip(o), h('span', { class: 'sb-rel-t', text: o.label }), extra ? h('span', { class: 'sb-muted', text: extra }) : ''])]);
  }
  function branchBlock(n) {
    const kids = S.tax.kids.get(n.id) || [];
    if (!kids.length || !n.branch) return null;
    const b = n.branch;
    return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-branch-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-branch-h', text: 'Esta rama' }),
      h('p', { text: b.aplicado + ' de ' + plus(b.leaves, 'técnica', 'técnicas') + ' con práctica detectada' + (b.documentado ? ', ' + b.documentado + ' solo documentadas' : '') + (b.sinEvidencia ? ', ' + b.sinEvidencia + ' sin evidencia' : '') + '.' }),
      stackBar(b.aplicado, b.documentado, b.sinEvidencia),
      h('ul', { class: 'sb-rels' }, kids.map((k) => relBtn(k, (stageOf(k.stage) || {}).short + (countProjects(k) ? ' · ' + plus(countProjects(k), 'proyecto', 'proyectos') : '')))),
      h('p', null, [h('button', { type: 'button', class: 'sb-btn', text: S.f.branch === n.id ? 'Quitar el aislamiento' : 'Aislar esta rama en el mapa', onclick: () => isolateBranch(n.id) })]),
      h('p', { class: 'sb-muted', text: 'Cobertura de técnicas, no dominio de la disciplina.' }),
    ]);
  }
  function appliesBlock(n) {
    if (n.type === 'proyecto') {
      const all = S.tax.techniques.get(n.id) || [];
      const covered = new Set();
      all.forEach((t) => S.tax.pathOf(t.node.id).forEach((a) => { if (a.id !== t.node.id) covered.add(a.id); }));
      const list = all.filter((t) => !covered.has(t.node.id));
      if (!list.length && !(n.docOnly && n.docOnly.length)) return null;
      return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-tech-h' }, [
        h('h3', { class: 'sb-h3', id: 'sb-tech-h', text: 'Técnicas y conceptos que aplica' }),
        list.length ? h('ul', { class: 'sb-rels' }, list.map((t) => relBtn(t.node, plus(t.edge.evidenceCount || 1, 'archivo', 'archivos') + ' · confirmado por código'))) : '',
        n.docOnly && n.docOnly.length ? h('p', { class: 'sb-banner is-warn' }, [h('strong', { text: 'La carpeta lo declara, el código no lo confirma: ' }), n.docOnly.join(', ') + '. Puede estar en otro archivo o la carpeta puede estar desactualizada.']) : '',
      ]);
    }
    if (n.stage === undefined) return null;
    const projects = S.tax.projectsOf(n.id, true);
    const kinds = Object.entries((n.evidence && n.evidence.kinds) || {}).filter(([, v]) => v > 0);
    if (!projects.length && !kinds.length) return null;
    const direct = S.tax.appliers.get(n.id) || new Set();
    const shown = projects.slice(0, 12);
    return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-proj-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-proj-h', text: projects.length ? 'Proyectos que lo aplican (' + projects.length + ')' : 'Evidencia' }),
      kinds.length ? h('p', { class: 'sb-muted', text: 'Tipo de evidencia: ' + kinds.map(([k, v]) => v + ' ' + (KINDS[k] || k).toLowerCase()).join(' · ') + '.' }) : '',
      projects.length ? h('ul', { class: 'sb-rels' }, shown.map((p) => relBtn(p, direct.has(p.id) ? '' : 'en una técnica de esta rama'))) : '',
      projects.length > shown.length ? h('p', null, [h('button', { type: 'button', class: 'sb-btn', text: 'Ver los ' + projects.length + ' en el mapa', onclick: () => isolateBranch(n.id) })]) : '',
    ]);
  }
  function sourcesBlock(n) {
    if (n.type !== 'proyecto') return null;
    const src = n.sources || [];
    if (!src.length && !n.noReadme && !(n.merged && n.merged.length)) return null;
    const kinds = Object.entries((n.evidence && n.evidence.kinds) || {}).filter(([, v]) => v > 0);
    return h('section', { class: 'sb-block', 'aria-labelledby': 'sb-src-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-src-h', text: 'Fuentes' }),
      src.length ? h('ul', { class: 'sb-srcs' }, src.map((s) => h('li', null, [h('span', { class: 'sb-muted', text: s.kind + ' · ' }), h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.label + ' ↗' })]))) : '',
      n.merged && n.merged.length ? h('p', { class: 'sb-muted', text: 'Unificado con: ' + n.merged.join(' · ').replace(/[.?!]+$/, '') + '.' }) : '',
      kinds.length ? h('p', { class: 'sb-muted', text: 'Evidencia práctica: ' + kinds.map(([k, v]) => v + ' ' + (KINDS[k] || k).toLowerCase()).join(' · ') + '.' }) : '',
      n.noReadme ? h('p', { class: 'sb-banner is-warn', text: 'No se ha encontrado un README ni otra documentación escrita en este proyecto.' }) : '',
    ]);
  }

  function syncIso() {
    if (!S.els.treeBody) return;
    S.els.treeBody.querySelectorAll('.sb-tn-iso').forEach((b) => { const on = b.getAttribute('data-iso') === S.f.branch; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? 'Aislada ✓' : 'Aislar'; });
  }

  return { render: render };
})();
