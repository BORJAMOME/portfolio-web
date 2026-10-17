/* ═══════════════════════════════════════════════
   area-privada-second-brain.js: pestaña «Second Brain» del área privada (#/second-brain)
   ─────────────────────────────────────────────────
   Universo 3D del conocimiento profesional. Esta página SOLO muestra un snapshot que ya
   calculó el motor (tools/second-brain) y que está guardado en Supabase:

     · lee public.sb_snapshots / public.sb_runs con la sesión del área privada, así que
       solo un miembro autenticado recibe datos (RLS, supabase/second-brain.sql);
     · no abre documentos, no llama a ningún modelo de IA y no analiza nada: seleccionar un
       nodo, mover la cámara o filtrar son operaciones locales sobre datos ya descargados;
     · valida el snapshot (second-brain/contract.js) antes de dibujarlo;
     · todo texto que viene de la base se pinta con textContent, nunca como HTML.

   Three.js se carga solo al abrir esta pestaña (paquete recortado de vendor/).
   ═══════════════════════════════════════════════ */
window.APSecondBrain = (function () {
  'use strict';

  const THREE_URL = './vendor/three-0.186.1-sb.min.js';
  const DEMO_URL = './second-brain/demo-snapshot.json';
  const STALE_DAYS = 14;

  const STATE = {
    respaldado: { label: 'Respaldado por evidencias', short: 'Respaldado', cls: 'is-blue', hint: 'Hay proyectos, código o documentación propia que lo respaldan. No equivale a dominio profesional.' },
    mencionado: { label: 'Mencionado, sin práctica detectable', short: 'Mencionado', cls: 'is-gray', hint: 'Aparece en documentos o listas, pero no hay evidencia práctica suficiente.' },
    pendiente: { label: 'Pendiente de validar', short: 'Pendiente', cls: 'is-gray', hint: 'La información disponible no permite saber si existe ni su profundidad.' },
    brecha_probable: { label: 'Brecha probable', short: 'Brecha probable', cls: 'is-gray is-ring', hint: 'Relevante para el objetivo y sin evidencia en fuentes que sí se han analizado. Puede existir fuera de ellas.' },
    brecha_confirmada: { label: 'Brecha confirmada', short: 'Brecha confirmada', cls: 'is-gray is-ring', hint: 'Registrada por ti con motivo y origen.' },
    oportunidad: { label: 'Oportunidad de mejora', short: 'Oportunidad', cls: 'is-amber', hint: 'Una acción que podría aportar valor; no implica una carencia.' },
    neutral: { label: 'Referencia', short: 'Referencia', cls: 'is-neutral', hint: 'Objetivo o referencia del marco; no es un conocimiento.' },
  };
  const TYPE = {
    tecnologia: ['Tecnología', '●'], concepto: ['Concepto', '⬢'], tecnica: ['Técnica', '◆'], competencia: ['Competencia', '⬟'],
    proyecto: ['Proyecto', '■'], objetivo: ['Objetivo', '◯'], recomendacion: ['Recomendación', '▲'],
  };
  const EDGE = {
    usa: ['Usa', 'usa'], 'parte-de': ['Parte de', 'es parte de'], requiere: ['Requiere', 'requiere'], mejora: ['Mejora', 'mejora'],
    habilita: ['Habilita', 'habilita'], demuestra: ['Demuestra (proyecto → concepto)', 'demuestra'], agrupa: ['Agrupa (competencia → concepto)', 'agrupa'],
    necesita: ['Necesita (objetivo → competencia)', 'necesita'], recomienda: ['Recomienda', 'recomienda'],
  };
  const EDGE_DEFAULT_OFF = ['agrupa', 'necesita'];
  const BUCKET = { ahora: 'Ahora', despues: 'Después', todavia_no: 'Todavía no' };
  const LEVELS = { junior: 'Junior', consolidado: 'Consolidado', mid: 'Mid-Level' };

  const fmtDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  let ctx = null, h = null;
  let viewer = null, cleanups = [];
  let S = null;            // estado de la sesión de vista

  /* ═══════════ CICLO DE VIDA ═══════════ */
  function dispose() {
    cleanups.forEach((f) => { try { f(); } catch (e) { /* ya liberado */ } });
    cleanups = [];
    if (viewer) { try { viewer.dispose(); } catch (e) { /* ya liberado */ } viewer = null; }
    S = null;
  }
  function watchLeave() {
    const leave = () => { if (!/^#\/second-brain/.test(location.hash)) dispose(); };
    window.addEventListener('hashchange', leave);
    window.addEventListener('pagehide', dispose);
    cleanups.push(() => { window.removeEventListener('hashchange', leave); window.removeEventListener('pagehide', dispose); });
  }

  /* ═══════════ DATOS ═══════════ */
  function assetUrl(name, fallback) {
    const l = document.querySelector('link[data-ap-asset="' + name + '"]');
    return new URL(l ? l.getAttribute('href') : fallback, document.baseURI).href;
  }
  function loadEngine() {
    return Promise.all([
      import(assetUrl('sb-contract', './second-brain/contract.js')),
      import(assetUrl('sb-viewer', './second-brain/viewer.js')),
      import(new URL(THREE_URL, document.baseURI).href),
    ]).then((m) => ({ contract: m[0], viewer: m[1], THREE: m[2] }));
  }
  function isMissingTable(err) {
    return !!err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01' || err.code === 'PGRST200');
  }

  /* Devuelve { snapshot, fallback, run, mode }. Elige el snapshot válido más reciente. */
  function loadData(engine, wantDemo) {
    if (wantDemo) {
      return fetch(new URL(DEMO_URL, document.baseURI).href, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error('No se han podido cargar los datos de demostración.');
        return r.json();
      }).then((g) => {
        const v = engine.contract.validateSnapshot(g);
        if (!v.ok) throw new Error('Los datos de demostración no son válidos: ' + v.errors[0]);
        return { snapshot: g, fallback: false, run: null, demo: true };
      });
    }
    return Promise.all([
      ctx.api('/rest/v1/sb_snapshots?select=id,generated_at,created_at,engine_version,graph&mode=eq.real&order=generated_at.desc&limit=3'),
      ctx.api('/rest/v1/sb_runs?select=id,started_at,finished_at,status,message&order=started_at.desc&limit=1')
        .catch((e) => { if (e && e.auth) throw e; return []; }),
    ]).then((res) => {
      const rows = res[0] || [];
      if (!rows.length) return { snapshot: null, run: (res[1] || [])[0] || null };
      let invalid = null;
      for (let i = 0; i < rows.length; i++) {
        const v = engine.contract.validateSnapshot(rows[i].graph);
        if (v.ok) return { snapshot: rows[i].graph, fallback: i > 0, invalidFirst: invalid, run: (res[1] || [])[0] || null, demo: false };
        if (!invalid) invalid = v.errors[0];
      }
      const e = new Error('Los últimos análisis guardados no cumplen el contrato de datos (' + invalid + '). Vuelve a ejecutar el análisis.');
      e.invalid = true;
      throw e;
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
        if (isMissingTable(err)) return paintMessage('setup');
        return () => paintMessage('error', err)();
      });
  }

  function paintMessage(kind, err) {
    return function () {
      ctx.view.textContent = '';
      if (kind === 'setup') {
        ctx.view.appendChild(h('div', { class: 'ap-empty sb-msg' }, [
          h('p', { class: 'ap-empty-title', text: 'Second Brain aún no está activado' }),
          h('p', { text: 'Ejecuta supabase/second-brain.sql en el SQL Editor de Supabase (una sola vez). Después ejecuta el análisis en tu equipo con «node tools/second-brain/analyze.mjs --publish».' }),
          demoLink(),
        ]));
      } else if (kind === 'empty') {
        emptyState(err);
      } else {
        ctx.view.appendChild(h('div', { class: 'ap-empty sb-msg', role: 'alert' }, [
          h('p', { class: 'ap-empty-title', text: 'No se ha podido cargar Second Brain' }),
          h('p', { text: (err && err.message) || 'Error desconocido.' }),
          h('p', null, [h('button', { type: 'button', class: 'ap-tool', text: 'Reintentar', onclick: () => window.dispatchEvent(new HashChangeEvent('hashchange')) }), ' ', demoLink()]),
        ]));
      }
    };
  }
  function demoLink() {
    return h('a', { class: 'ap-tool', href: '#/second-brain/demo', text: 'Ver con datos de demostración (ficticios)' });
  }
  function emptyState(run) {
    ctx.view.appendChild(h('div', { class: 'ap-empty sb-msg' }, [
      h('p', { class: 'ap-empty-title', text: 'Todavía no hay ningún análisis' }),
      h('p', { text: 'Second Brain muestra el resultado de un análisis de tus fuentes. Aún no se ha publicado ninguno.' }),
      run && run.status === 'error' ? h('p', { class: 'sb-warn', text: 'El último intento falló: ' + (run.message || 'sin detalle') }) : null,
      h('ol', { class: 'sb-steps' }, [
        h('li', { text: 'Copia tools/second-brain/config.example.json a .second-brain/config.json y declara tus carpetas.' }),
        h('li', { text: 'Ejecuta supabase/second-brain.sql en Supabase (si no lo has hecho).' }),
        h('li', { text: 'Ejecuta «node tools/second-brain/analyze.mjs --publish» (con SB_PASSWORD en el entorno).' }),
      ]),
      demoLink(),
    ]));
  }

  /* ═══════════ PINTADO PRINCIPAL ═══════════ */
  function paint(engine, data) {
    if (!data.snapshot) return paintMessage('empty', data.run)();
    ctx.view.textContent = '';
    const g = data.snapshot;
    const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
    const adj = new Map(g.nodes.map((n) => [n.id, []]));
    g.edges.forEach((e) => { adj.get(e.source).push({ e, other: e.target, out: true }); adj.get(e.target).push({ e, other: e.source, out: false }); });
    const recByNode = new Map();
    g.recommendations.forEach((r) => { recByNode.set(r.id, r); });
    const bucketOf = new Map();
    g.recommendations.forEach((r) => { bucketOf.set(r.nodeId, r.priority.bucket); bucketOf.set(r.targetId, r.priority.bucket); });
    const compOf = new Map(g.competencies.map((k) => [k.nodeId, k]));

    S = {
      g, nodeById, adj, recByNode, bucketOf, compOf, demo: data.demo, selected: null, panel: 'detalle',
      f: { states: new Set(Object.keys(STATE)), types: new Set(Object.keys(TYPE)), regions: new Set(g.regions.map((r) => r.id)), priority: '', edges: new Set(Object.keys(EDGE).filter((k) => EDGE_DEFAULT_OFF.indexOf(k) < 0)), showRegions: true },
      els: {},
    };
    watchLeave();
    // el desplegable de filtros se cierra al pulsar fuera o con Esc (devuelve el foco a su botón)
    const closeFilters = (ev) => {
      const d = S && S.els.main && S.els.main.querySelector('.sb-filters');
      if (!d || !d.open) return;
      if (ev.type === 'keydown') { if (ev.key === 'Escape') { d.open = false; d.querySelector('summary').focus(); } }
      else if (!d.contains(ev.target)) d.open = false;
    };
    document.addEventListener('pointerdown', closeFilters, true);
    document.addEventListener('keydown', closeFilters);
    cleanups.push(() => { document.removeEventListener('pointerdown', closeFilters, true); document.removeEventListener('keydown', closeFilters); });

    const root = h('section', { class: 'sb', 'aria-label': 'Second Brain' });
    root.appendChild(headerEl(data));
    const main = h('div', { class: 'sb-main' });
    S.els.main = main;
    main.appendChild(stageEl());
    main.appendChild(sideEl());
    root.appendChild(main);
    ctx.view.appendChild(root);

    // el visor necesita que el contenedor ya esté en el documento para medirse
    try {
      viewer = engine.viewer.createViewer(S.els.stage, engine.THREE, {
        onSelect: (id) => selectNode(id, true),
        onHover: () => {},
        onDetached: () => dispose(),
        onContextLost: () => { stageMessage('El navegador ha perdido el contexto gráfico. Recarga la sección para recuperar el grafo 3D.'); },
      });
      viewer.setData(g);
      S.els.stage.__sbViewer = viewer;
      cleanups.push(() => { delete S.els.stage.__sbViewer; });
    } catch (err) {
      viewer = null;
      stageMessage('Tu navegador no puede mostrar el grafo 3D (WebGL no está disponible). Puedes explorar todo desde la pestaña «Lista» y «Recomendaciones».');
      setPanel('lista');
    }
    applyFilters(true);
    renderDetail();
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
    const head = h('header', { class: 'sb-head' });
    const line = h('div', { class: 'sb-status' }, [
      data.demo ? h('span', { class: 'ape-badge is-warn', text: 'DATOS FICTICIOS · DEMO' }) : h('span', { class: 'ape-badge is-ok', text: 'Análisis real' }),
      h('span', { class: 'sb-date' }, [h('span', { class: 'sb-muted', text: 'Último análisis: ' }), h('time', { datetime: g.generatedAt, text: fmtDate.format(gen) })]),
      data.demo ? null : h('span', { class: 'ape-badge ' + (stale ? 'is-warn' : 'is-ok'), text: stale ? 'Desactualizado · hace ' + plural(days, 'día', 'días') : (days <= 0 ? 'Actualizado hoy' : 'Actualizado · hace ' + plural(days, 'día', 'días')) }),
      h('span', { class: 'sb-muted', text: 'Objetivo: ' + g.meta.targetLabel }),
    ]);
    head.appendChild(line);
    line.appendChild(h('ul', { class: 'sb-kpis', 'aria-label': 'Resumen del análisis' }, [
      kpi(st.concepts, 'conceptos'), kpi(st.edges, 'relaciones'), kpi(st.projects, 'proyectos'),
      kpi(g.regions.filter((r) => r.count > 0).length, 'áreas'), kpi(st.priorities, 'recomendaciones prioritarias'),
    ]));
    if (data.demo) head.appendChild(h('p', { class: 'sb-banner is-demo', role: 'note' }, [h('strong', { text: 'Estos datos son inventados. ' }), 'Sirven para probar la interfaz y no describen tu conocimiento real. ', h('a', { href: '#/second-brain', text: 'Volver al análisis real' })]));
    if (data.fallback) head.appendChild(h('p', { class: 'sb-banner is-warn', role: 'status', text: 'El análisis más reciente no cumple el contrato de datos (' + (data.invalidFirst || 'error') + '). Se muestra el último análisis válido.' }));
    if (failedRun) head.appendChild(h('p', { class: 'sb-banner is-warn', role: 'status', text: 'El último intento de actualización (' + fmtDate.format(new Date(data.run.started_at)) + ') falló: ' + (data.run.message || 'sin detalle') + '. Se muestra el último análisis válido.' }));
    const cov = g.coverage;
    const parts = cov.sources.map((s) => s.label + ' (' + plural(s.supported, 'archivo leído', 'archivos leídos') + ')');
    head.appendChild(h('details', { class: 'sb-cov' }, [
      h('summary', { text: 'Qué se ha analizado y qué límites tiene' }),
      h('p', null, ['Fuentes: ' + parts.join(' · ') + '.']),
      h('ul', null, g.meta.limitations.map((l) => h('li', { text: l }))),
      h('p', { text: g.meta.basis }),
    ]));
    return head;
  }
  function kpi(n, label) { return h('li', null, [h('strong', { text: String(n) }), ' ' + label]); }

  /* ── Escenario: barra, lienzo, leyenda y mandos ── */
  function stageEl() {
    const e = S.els;
    const wrap = h('div', { class: 'sb-stage-wrap' });
    wrap.appendChild(toolbarEl());
    e.stage = h('div', {
      class: 'sb-stage', tabindex: '0', role: 'group', id: 'sb-stage',
      'aria-label': 'Grafo 3D del conocimiento. Alternativa accesible: pestaña Lista.', 'aria-describedby': 'sb-keys',
    });
    e.stageMsg = h('p', { class: 'sb-stage-msg', role: 'status', hidden: true });
    e.empty = h('div', { class: 'sb-stage-empty', hidden: true }, [
      h('p', { text: 'Ningún elemento cumple los filtros actuales.' }),
      h('button', { type: 'button', class: 'ap-tool', text: 'Restablecer filtros', onclick: resetAll }),
    ]);
    const stageBox = h('div', { class: 'sb-stage-box' }, [e.stage, e.stageMsg, e.empty, legendEl(), navEl()]);
    wrap.appendChild(stageBox);
    wrap.appendChild(h('p', { class: 'sb-keys', id: 'sb-keys', text: 'Teclado (con el grafo enfocado): flechas = girar · Mayús + flechas = desplazar · + / − = zoom · 0 = vista general · Esc = quitar selección.' }));
    return wrap;
  }

  function legendEl() {
    const small = window.matchMedia && matchMedia('(max-width: 900px)').matches;
    return h('details', { class: 'sb-legend', open: small ? null : true }, [
      h('summary', { text: 'Leyenda' }),
      h('ul', null, [
        h('li', null, [h('span', { class: 'sb-dot is-blue', 'aria-hidden': 'true' }), ' Azul: respaldado por evidencias']),
        h('li', null, [h('span', { class: 'sb-dot is-gray', 'aria-hidden': 'true' }), ' Gris: pendiente de validar o mencionado']),
        h('li', null, [h('span', { class: 'sb-dot is-amber', 'aria-hidden': 'true' }), ' Ámbar: recomendación u oportunidad']),
        h('li', null, [h('span', { class: 'sb-ring', 'aria-hidden': 'true' }), ' Anillo: brecha (gris) o prioridad ahora (ámbar)']),
      ]),
      h('p', { class: 'sb-shapes-h', text: 'Formas' }),
      h('ul', { class: 'sb-shapes' }, Object.keys(TYPE).map((k) => h('li', null, [h('span', { 'aria-hidden': 'true', text: TYPE[k][1] + ' ' }), TYPE[k][0]]))),
    ]);
  }

  function navEl() {
    const b = (label, txt, fn) => h('button', { type: 'button', class: 'sb-nav-btn', 'aria-label': label, title: label, text: txt, onclick: fn });
    return h('div', { class: 'sb-nav', role: 'group', 'aria-label': 'Controles de vista' }, [
      b('Girar a la izquierda', '←', () => viewer && viewer.rotate(-0.25, 0)), b('Girar a la derecha', '→', () => viewer && viewer.rotate(0.25, 0)),
      b('Girar hacia arriba', '↑', () => viewer && viewer.rotate(0, -0.2)), b('Girar hacia abajo', '↓', () => viewer && viewer.rotate(0, 0.2)),
      b('Acercar', '+', () => viewer && viewer.zoom(0.75)), b('Alejar', '−', () => viewer && viewer.zoom(1.33)),
      b('Centrar en la selección', '◎', () => { if (viewer && S.selected) viewer.focus(S.selected); }),
      b('Volver a la vista general', '⌂', () => viewer && viewer.reset()),
    ]);
  }

  /* ── Barra superior: búsqueda y filtros ── */
  function toolbarEl() {
    const e = S.els;
    const bar = h('div', { class: 'sb-bar' });
    e.search = h('input', { type: 'search', id: 'sb-search', placeholder: 'Buscar un concepto', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'sb-results', 'aria-autocomplete': 'list', oninput: onSearch, onkeydown: onSearchKey });
    e.results = h('ul', { class: 'sb-results', id: 'sb-results', role: 'listbox', 'aria-label': 'Resultados', hidden: true });
    bar.appendChild(h('div', { class: 'sb-search' }, [h('label', { class: 'sr-only', for: 'sb-search', text: 'Buscar un concepto en el grafo' }), e.search, e.results]));
    e.count = h('p', { class: 'sb-count', role: 'status', 'aria-live': 'polite' });
    bar.appendChild(e.count);
    bar.appendChild(h('button', { type: 'button', class: 'ap-tool sb-panel-toggle', 'aria-expanded': 'false', 'aria-controls': 'sb-side', text: 'Panel', onclick: (ev) => togglePanel(ev.currentTarget) }));
    bar.appendChild(h('button', { type: 'button', class: 'ap-tool', text: 'Restablecer', title: 'Quita los filtros y vuelve a la vista general', onclick: resetAll }));
    const det = h('details', { class: 'sb-filters' }, [h('summary', { class: 'ap-tool', text: 'Filtros' }), filtersEl()]);
    bar.appendChild(det);
    return bar;
  }

  function checkGroup(title, items, set, onChange, name) {
    return h('fieldset', { class: 'sb-fs' }, [
      h('legend', { text: title }),
      items.map((it) => {
        const id = 'sb-f-' + name + '-' + it.key;
        return h('label', { class: 'sb-check', for: id }, [
          h('input', { type: 'checkbox', id, checked: set.has(it.key), onchange: (ev) => { ev.currentTarget.checked ? set.add(it.key) : set.delete(it.key); onChange(); } }),
          ' ' + it.label,
        ]);
      }),
    ]);
  }
  function filtersEl() {
    const f = S.f;
    const box = h('div', { class: 'sb-filter-grid' });
    box.appendChild(checkGroup('Estado de evidencia', Object.keys(STATE).map((k) => ({ key: k, label: STATE[k].short })), f.states, applyFilters, 'state'));
    box.appendChild(checkGroup('Tipo', Object.keys(TYPE).map((k) => ({ key: k, label: TYPE[k][1] + ' ' + TYPE[k][0] })), f.types, applyFilters, 'type'));
    const regs = S.g.regions.filter((r) => r.count > 0);
    const regionFs = checkGroup('Regiones', regs.map((r) => ({ key: r.id, label: r.label })), f.regions, applyFilters, 'region');
    regionFs.appendChild(h('label', { class: 'sb-check', for: 'sb-f-showreg' }, [h('input', { type: 'checkbox', id: 'sb-f-showreg', checked: true, onchange: (ev) => { f.showRegions = ev.currentTarget.checked; applyFilters(); } }), ' Mostrar nombres de región']));
    regionFs.appendChild(h('label', { class: 'sb-select-label', for: 'sb-goto' }, ['Centrar la cámara en: ', h('select', { id: 'sb-goto', onchange: (ev) => { if (viewer && ev.currentTarget.value) viewer.focusRegion(ev.currentTarget.value); ev.currentTarget.value = ''; } }, [h('option', { value: '', text: 'Elegir región…' }), regs.map((r) => h('option', { value: r.id, text: r.label }))])]));
    box.appendChild(regionFs);
    box.appendChild(h('fieldset', { class: 'sb-fs' }, [
      h('legend', { text: 'Prioridad' }),
      h('label', { class: 'sb-select-label', for: 'sb-prio' }, [h('span', { class: 'sr-only', text: 'Prioridad' }), h('select', { id: 'sb-prio', onchange: (ev) => { f.priority = ev.currentTarget.value; applyFilters(); } }, [
        h('option', { value: '', text: 'Todos' }), h('option', { value: 'ahora', text: 'Solo lo prioritario ahora' }), h('option', { value: 'conRec', text: 'Solo con recomendación (ahora o después)' }),
      ])]),
    ]));
    box.appendChild(checkGroup('Tipos de relación', Object.keys(EDGE).map((k) => ({ key: k, label: EDGE[k][0] })), f.edges, applyFilters, 'edge'));
    return box;
  }

  function matchesFilters(n) {
    const f = S.f;
    if (!f.states.has(n.state) || !f.types.has(n.type) || !f.regions.has(n.region)) return false;
    if (f.priority) {
      const b = S.bucketOf.get(n.id);
      if (f.priority === 'ahora' && b !== 'ahora') return false;
      if (f.priority === 'conRec' && b !== 'ahora' && b !== 'despues') return false;
    }
    return true;
  }
  function applyFilters(initial) {
    if (!S) return;
    const vis = new Set(S.g.nodes.filter(matchesFilters).map((n) => n.id));
    S.visible = vis;
    const total = S.g.nodes.length;
    S.els.count.textContent = vis.size === total ? plural(total, 'elemento', 'elementos') : vis.size + ' de ' + plural(total, 'elemento', 'elementos');
    S.els.empty.hidden = vis.size > 0;
    if (S.selected && !vis.has(S.selected)) { S.selected = null; renderDetail(); }
    if (viewer) {
      viewer.setFilter({ visible: vis.size === total ? null : vis, edgeTypes: S.f.edges, showRegions: S.f.showRegions });
      if (vis.size > 0) viewer.refit(initial === true);
    }
    renderList();
  }
  function resetAll() {
    if (!S) return;
    const f = S.f;
    f.states = new Set(Object.keys(STATE)); f.types = new Set(Object.keys(TYPE)); f.regions = new Set(S.g.regions.map((r) => r.id));
    f.priority = ''; f.showRegions = true; f.edges = new Set(Object.keys(EDGE).filter((k) => EDGE_DEFAULT_OFF.indexOf(k) < 0));
    S.els.main.querySelectorAll('.sb-filters input[type=checkbox]').forEach((c) => {
      const m = /^sb-f-(\w+)-(.+)$/.exec(c.id);
      if (c.id === 'sb-f-showreg') c.checked = true;
      else if (m) c.checked = m[1] === 'edge' ? f.edges.has(m[2]) : true;
    });
    const prio = S.els.main.querySelector('#sb-prio'); if (prio) prio.value = '';
    S.els.search.value = ''; closeResults();
    selectNode(null, true);
    applyFilters();
    if (viewer) viewer.reset();
  }

  /* ── Búsqueda ── */
  function onSearch() {
    const q = norm(S.els.search.value).trim();
    const list = S.els.results;
    list.textContent = '';
    if (!q) return closeResults();
    const words = q.split(/\s+/);
    const hits = S.g.nodes.filter((n) => { const hay = norm(n.label + ' ' + n.summary); return words.every((w) => hay.indexOf(w) > -1); })
      .sort((a, b) => (norm(a.label).indexOf(q) === 0 ? 0 : 1) - (norm(b.label).indexOf(q) === 0 ? 0 : 1) || b.size - a.size).slice(0, 8);
    if (!hits.length) list.appendChild(h('li', { class: 'sb-noresult', role: 'option', 'aria-disabled': 'true', text: 'Sin resultados' }));
    hits.forEach((n, i) => list.appendChild(h('li', { role: 'option', id: 'sb-r-' + i, 'aria-selected': 'false' }, [
      h('button', { type: 'button', tabindex: '-1', onclick: () => pickResult(n.id) }, [h('span', { 'aria-hidden': 'true', text: TYPE[n.type][1] + ' ' }), n.label, h('span', { class: 'sb-muted', text: ' · ' + TYPE[n.type][0] })]),
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
  function closeResults() { S.els.results.hidden = true; S.els.search.setAttribute('aria-expanded', 'false'); S.els.search.removeAttribute('aria-activedescendant'); S.hits = []; }
  function pickResult(id) {
    closeResults();
    const n = S.nodeById.get(id);
    if (!S.visible.has(id)) { const note = n ? n.label : ''; resetAll(); ctx.setStatus('Se han quitado los filtros para mostrar «' + note + '».'); }
    selectNode(id, false);
  }

  /* ═══════════ SELECCIÓN Y PANEL CONTEXTUAL ═══════════ */
  function selectNode(id, fromViewer) {
    if (!S) return;
    S.selected = id;
    if (!fromViewer && viewer) viewer.select(id, { silent: true });
    if (id) { setPanel('detalle'); openPanelOnSmall(); }
    renderDetail();
  }

  function sideEl() {
    const e = S.els;
    const side = h('aside', { class: 'sb-side', id: 'sb-side', 'aria-label': 'Panel de detalle' });
    const tabs = h('div', { class: 'sb-tabs', role: 'tablist', 'aria-label': 'Paneles' });
    [['detalle', 'Detalle'], ['recomendaciones', 'Recomendaciones'], ['lista', 'Lista']].forEach((t) => {
      tabs.appendChild(h('button', { type: 'button', role: 'tab', id: 'sb-tab-' + t[0], 'aria-controls': 'sb-p-' + t[0], 'aria-selected': t[0] === 'detalle' ? 'true' : 'false', tabindex: t[0] === 'detalle' ? '0' : '-1', text: t[1], onclick: () => setPanel(t[0]), onkeydown: tabKey }));
    });
    side.appendChild(tabs);
    e.pDetalle = h('div', { class: 'sb-panel', id: 'sb-p-detalle', role: 'tabpanel', 'aria-labelledby': 'sb-tab-detalle', tabindex: '0' });
    e.pRec = h('div', { class: 'sb-panel', id: 'sb-p-recomendaciones', role: 'tabpanel', 'aria-labelledby': 'sb-tab-recomendaciones', tabindex: '0', hidden: true });
    e.pLista = h('div', { class: 'sb-panel', id: 'sb-p-lista', role: 'tabpanel', 'aria-labelledby': 'sb-tab-lista', tabindex: '0', hidden: true });
    side.append(e.pDetalle, e.pRec, e.pLista);
    renderRecs();
    return side;
  }
  function tabKey(ev) {
    const order = ['detalle', 'recomendaciones', 'lista'];
    const i = order.indexOf(S.panel);
    let n = -1;
    if (ev.key === 'ArrowRight') n = (i + 1) % 3; else if (ev.key === 'ArrowLeft') n = (i + 2) % 3; else if (ev.key === 'Home') n = 0; else if (ev.key === 'End') n = 2;
    if (n < 0) return;
    ev.preventDefault(); setPanel(order[n]); document.getElementById('sb-tab-' + order[n]).focus();
  }
  function setPanel(name) {
    S.panel = name;
    [['detalle', S.els.pDetalle], ['recomendaciones', S.els.pRec], ['lista', S.els.pLista]].forEach((p) => {
      p[1].hidden = p[0] !== name;
      const t = document.getElementById('sb-tab-' + p[0]);
      t.setAttribute('aria-selected', p[0] === name ? 'true' : 'false'); t.tabIndex = p[0] === name ? 0 : -1;
    });
  }
  function togglePanel(btn) {
    const open = S.els.main.getAttribute('data-panel') !== 'open';
    S.els.main.setAttribute('data-panel', open ? 'open' : 'closed');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function openPanelOnSmall() {
    S.els.main.setAttribute('data-panel', 'open');
    const t = S.els.main.querySelector('.sb-panel-toggle'); if (t) t.setAttribute('aria-expanded', 'true');
  }

  function stateBadge(state) {
    const m = STATE[state] || STATE.neutral;
    return h('span', { class: 'sb-badge ' + m.cls, title: m.hint }, [h('span', { class: 'sb-dot', 'aria-hidden': 'true' }), m.label]);
  }

  function renderDetail() {
    const box = S.els.pDetalle;
    box.textContent = '';
    const n = S.selected && S.nodeById.get(S.selected);
    if (!n) {
      box.appendChild(h('div', { class: 'sb-intro' }, [
        h('h2', { class: 'sb-h', text: 'Selecciona un elemento' }),
        h('p', { text: 'Haz clic en un nodo del grafo, búscalo arriba o elígelo en la pestaña «Lista». Aquí verás qué significa, qué evidencia lo respalda y qué incertidumbres tiene.' }),
        h('p', { class: 'sb-muted', text: 'Este panel explica el significado del nodo; no abre ni muestra tus documentos de origen.' }),
        S.g.meta.deferred && S.g.meta.deferred.length ? h('details', null, [h('summary', { text: 'Qué no merece atención todavía (' + S.g.meta.deferred.length + ')' }), h('ul', null, S.g.meta.deferred.map((d) => h('li', null, [h('strong', { text: d.label + ': ' }), d.reason])))]) : null,
      ]));
      return;
    }
    const comp = S.compOf.get(n.id);
    box.appendChild(h('div', { class: 'sb-detail-head' }, [
      h('div', null, [
        h('p', { class: 'sb-kicker' }, [h('span', { 'aria-hidden': 'true', text: TYPE[n.type][1] + ' ' }), TYPE[n.type][0] + ' · ' + regionLabel(n.region)]),
        h('h2', { class: 'sb-h', id: 'sb-detail-title', text: n.label }),
      ]),
      h('button', { type: 'button', class: 'ap-link-btn', text: 'Quitar selección', onclick: () => selectNode(null, false) }),
    ]));
    box.appendChild(h('p', null, [stateBadge(n.state)]));
    box.appendChild(h('p', { class: 'sb-summary', text: n.summary }));

    if (['tecnologia', 'concepto', 'tecnica', 'competencia', 'proyecto'].indexOf(n.type) > -1 && n.type !== 'competencia') {
      const ev = n.evidence;
      box.appendChild(h('section', { 'aria-labelledby': 'sb-ev-h' }, [
        h('h3', { class: 'sb-h3', id: 'sb-ev-h', text: 'Evidencia' }),
        h('dl', { class: 'sb-dl' }, [
          dt('Práctica (código y artefactos)', plural(ev.practica, 'archivo', 'archivos')),
          dt('Documentación propia', plural(ev.explicativa, 'archivo', 'archivos')),
          n.type === 'proyecto' ? null : dt('Declarada (CV, listas)', plural(ev.declarativa, 'fuente', 'fuentes')),
          n.type === 'proyecto' ? null : dt('Amplitud', ev.projects ? plural(ev.projects, 'proyecto', 'proyectos') + ' (' + ev.breadth + ')' : 'ninguna'),
        ]),
      ]));
    }
    if (comp) box.appendChild(competencyBlock(n, comp));
    if (n.uncertainty.length) {
      box.appendChild(h('section', { 'aria-labelledby': 'sb-unc-h' }, [h('h3', { class: 'sb-h3', id: 'sb-unc-h', text: 'Incertidumbres' }), h('ul', { class: 'sb-list' }, n.uncertainty.map((u) => h('li', { text: u })))]));
    }
    if (n.assessment) {
      box.appendChild(h('p', { class: 'sb-banner is-warn' }, [h('strong', { text: 'Evaluación registrada: ' }), n.assessment.reason + ' (' + n.assessment.source + ')']));
    }
    box.appendChild(importanceBlock(n));
    box.appendChild(relationsBlock(n));
    const rec = n.recommendationId && S.recByNode.get(n.recommendationId);
    if (rec) {
      box.appendChild(h('section', { 'aria-labelledby': 'sb-rec-h' }, [
        h('h3', { class: 'sb-h3', id: 'sb-rec-h', text: 'Recomendación asociada' }),
        recCard(rec, true),
      ]));
    }
  }
  function dt(k, v) { return [h('dt', { text: k }), h('dd', { text: v })]; }
  function regionLabel(id) { const r = S.g.regions.find((x) => x.id === id); return r ? r.label : id; }

  function competencyBlock(n, comp) {
    const meta = S.g.meta;
    return h('section', { 'aria-labelledby': 'sb-comp-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-comp-h', text: 'Frente a los niveles de referencia' }),
      h('table', { class: 'sb-table' }, [
        h('caption', { class: 'sr-only', text: 'Relevancia de la competencia por nivel' }),
        h('thead', null, [h('tr', null, [h('th', { scope: 'col', text: 'Nivel' }), h('th', { scope: 'col', text: 'Relevancia' })])]),
        h('tbody', null, meta.levels.map((l) => h('tr', null, [h('th', { scope: 'row', text: LEVELS[l.id] || l.label + (l.id === meta.targetLevel ? ' (objetivo)' : '') }), h('td', { text: comp.levels[l.id] + ' / 3' + (l.id === meta.targetLevel ? ' · objetivo' : '') })]))),
      ]),
      h('dl', { class: 'sb-dl' }, [
        dt('Prioridad', comp.priority.score + ' (relevancia × distancia)'),
        dt('Confianza', comp.confidence),
        dt('Esfuerzo orientativo', comp.effort + ' · estimación genérica'),
      ]),
      comp.unverified.length ? h('details', { open: true }, [h('summary', { text: 'Sin comprobar (' + comp.unverified.length + ')' }), h('ul', { class: 'sb-list' }, comp.unverified.map((u) => h('li', { text: u })))]) : null,
    ]);
  }

  function importanceBlock(n) {
    const items = [];
    if (['tecnologia', 'concepto', 'tecnica'].indexOf(n.type) > -1) {
      S.adj.get(n.id).filter((a) => a.e.type === 'agrupa').forEach((a) => {
        const comp = S.compOf.get(a.other);
        if (comp) items.push(`${S.nodeById.get(a.other).label}: relevancia ${comp.levels[S.g.meta.targetLevel]}/3 para «${S.g.meta.targetLabel}»`);
      });
    }
    if (!items.length) return null;
    return h('section', { 'aria-labelledby': 'sb-imp-h' }, [h('h3', { class: 'sb-h3', id: 'sb-imp-h', text: 'Importancia para tus objetivos' }), h('ul', { class: 'sb-list' }, items.map((t) => h('li', { text: t })))]);
  }

  function relationsBlock(n) {
    const order = ['demuestra', 'requiere', 'usa', 'parte-de', 'habilita', 'mejora', 'recomienda', 'agrupa', 'necesita'];
    const list = S.adj.get(n.id).slice().sort((a, b) => order.indexOf(a.e.type) - order.indexOf(b.e.type) || S.nodeById.get(a.other).label.localeCompare(S.nodeById.get(b.other).label, 'es'));
    if (!list.length) return null;
    const shown = list.slice(0, 10);
    const ul = h('ul', { class: 'sb-rels' }, shown.map((a) => {
      const o = S.nodeById.get(a.other);
      const phrase = a.out ? `${EDGE[a.e.type][1]} → ` : `← ${EDGE[a.e.type][1]}: `;
      return h('li', null, [
        h('button', { type: 'button', class: 'sb-rel', onclick: () => selectNode(o.id, false) }, [h('span', { class: 'sb-muted', text: phrase }), h('span', { text: o.label })]),
        h('span', { class: 'sb-why', text: a.e.rationale + ' (confianza ' + a.e.confidence + ')' }),
      ]);
    }));
    return h('section', { 'aria-labelledby': 'sb-rel-h' }, [
      h('h3', { class: 'sb-h3', id: 'sb-rel-h', text: 'Relaciones principales (' + list.length + ')' }), ul,
      list.length > shown.length ? h('p', { class: 'sb-muted', text: 'Se muestran ' + shown.length + ' de ' + list.length + '.' }) : null,
    ]);
  }

  /* ═══════════ RECOMENDACIONES ═══════════ */
  function recCard(r, open) {
    const body = h('dl', { class: 'sb-dl sb-rec-dl' }, [
      dt('Por qué', r.why), dt('Evidencia o requisito', r.evidence), dt('Resultado que se busca', r.result), dt('Acción concreta', r.action),
      dt('Objetivo', r.objective), dt('Esfuerzo', r.effort), dt('Confianza', r.confidence),
    ]);
    return h('details', { class: 'sb-rec', open: open ? true : null }, [
      h('summary', null, [h('span', { class: 'sb-rec-t', text: r.what }), h('span', { class: 'sb-prio sb-prio--' + r.priority.bucket, text: BUCKET[r.priority.bucket] + ' · ' + r.priority.score })]),
      body,
      h('p', null, [h('button', { type: 'button', class: 'ap-link-btn', text: 'Ver en el grafo', onclick: () => selectNode(r.targetId, false) })]),
    ]);
  }
  function renderRecs() {
    const box = S.els.pRec;
    box.textContent = '';
    const g = S.g;
    box.appendChild(h('h2', { class: 'sb-h', text: 'Qué hacer, en orden' }));
    box.appendChild(h('p', { class: 'sb-muted', text: 'Prioridad = relevancia para «' + g.meta.targetLabel + '» × distancia al objetivo, ponderada por la confianza. Es una guía para decidir, no una evaluación.' }));
    ['ahora', 'despues'].forEach((b) => {
      const recs = g.recommendations.filter((r) => r.priority.bucket === b).sort((x, y) => y.priority.score - x.priority.score);
      box.appendChild(h('h3', { class: 'sb-h3', text: BUCKET[b] + ' (' + recs.length + ')' }));
      if (!recs.length) box.appendChild(h('p', { class: 'sb-muted', text: b === 'ahora' ? 'Nada urgente con la información disponible.' : 'Sin recomendaciones.' }));
      recs.forEach((r) => box.appendChild(recCard(r, b === 'ahora')));
    });
    const later = (g.meta.deferred || []);
    box.appendChild(h('h3', { class: 'sb-h3', text: 'Todavía no (' + later.length + ')' }));
    box.appendChild(later.length ? h('ul', { class: 'sb-list' }, later.map((d) => h('li', null, [h('strong', { text: d.label + ': ' }), d.reason]))) : h('p', { class: 'sb-muted', text: 'Nada aplazado.' }));
    box.appendChild(h('details', { class: 'sb-method' }, [
      h('summary', { text: 'Cómo se calcula la prioridad' }),
      h('p', { text: g.meta.scoring.formula }),
      h('p', { text: 'Distancia según estado: ' + Object.keys(g.meta.scoring.distance).map((k) => k + ' ' + g.meta.scoring.distance[k]).join(' · ') + '.' }),
      h('p', { text: g.meta.scoring.buckets }),
      h('p', { text: g.meta.basis }),
    ]));
  }

  /* ═══════════ LISTA ACCESIBLE ═══════════ */
  function renderList() {
    if (!S) return;
    const box = S.els.pLista;
    box.textContent = '';
    box.appendChild(h('h2', { class: 'sb-h', text: 'Todos los elementos' }));
    box.appendChild(h('p', { class: 'sb-muted', text: 'Alternativa al grafo: la misma información, ordenada por región. Respeta los filtros.' }));
    S.g.regions.forEach((r) => {
      const ns = S.g.nodes.filter((n) => n.region === r.id && S.visible.has(n.id)).sort((a, b) => a.label.localeCompare(b.label, 'es'));
      if (!ns.length) return;
      box.appendChild(h('details', { open: ns.length < 9 ? true : null }, [
        h('summary', { text: r.label + ' (' + ns.length + ')' }),
        h('ul', { class: 'sb-nodelist' }, ns.map((n) => h('li', null, [
          h('button', { type: 'button', class: 'sb-node' + (S.selected === n.id ? ' is-on' : ''), 'aria-current': S.selected === n.id ? 'true' : null, onclick: () => selectNode(n.id, false) }, [
            h('span', { class: 'sb-dot ' + (STATE[n.state] || STATE.neutral).cls, 'aria-hidden': 'true' }),
            h('span', { class: 'sb-node-t', text: n.label }),
            h('span', { class: 'sb-muted', text: ' · ' + TYPE[n.type][0] + ' · ' + (STATE[n.state] || STATE.neutral).short }),
          ]),
        ]))),
      ]));
    });
  }

  return { render: render };
})();
