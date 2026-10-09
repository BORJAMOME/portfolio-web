/* ═══════════════════════════════════════════════
   dashboard/casa-origen/loader.js — idioma y carga ordenada
   ?lang=en abre la versión inglesa; sin parámetro, la española.
   Carga datos → motor → contenido → cálculos → página, en ese orden.
   Las versiones (?v=) las genera el script que construye esta carpeta.
   ═══════════════════════════════════════════════ */
(() => {
  const V = {"es/data.js": "5a3fbd7711", "es/markup.js": "6c9a5029fb", "es/calcs.js": "c6613ffa8c", "es/app.js": "506e1a0787", "en/data.js": "c7dd95e0d6", "en/markup.js": "a51850d729", "en/calcs.js": "70d4d145fd", "en/app.js": "37486713a3", "dash.js": "eb5ffc5aef"};
  const lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'es';
  const T = {
    es: { title: 'Casa Origen · Dashboard interactivo | Borja Mora', back: 'Casa Origen', backHref: '../../casa-origen.html', group: 'Idioma · Language' },
    en: { title: 'Casa Origen · Interactive dashboard | Borja Mora', back: 'Casa Origen', backHref: '../../en/casa-origen.html', group: 'Language · Idioma' },
  }[lang];
  document.documentElement.lang = lang;
  document.title = T.title;
  window.CO_PARAMS = lang === 'en' ? { local: 'Both', franja: null } : { local: 'Ambos', franja: null };

  const back = document.getElementById('cx-back');
  if (back) { back.href = T.backHref; back.querySelector('span').textContent = T.back; }
  const sw = document.getElementById('cx-lang');
  if (sw) {
    sw.setAttribute('aria-label', T.group);
    sw.querySelectorAll('[data-lang]').forEach((a) => {
      const on = a.dataset.lang === lang;
      a.setAttribute('aria-current', String(on));
      a.href = (a.dataset.lang === 'en' ? '?lang=en' : '?lang=es') + location.hash;
    });
  }

  const load = (f) => new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = f + (V[f] ? '?v=' + V[f] : '');
    s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + f));
    document.body.append(s);
  });
  [lang + '/data.js', 'dash.js', lang + '/markup.js', lang + '/calcs.js', lang + '/app.js']
    .reduce((p, f) => p.then(() => load(f)), Promise.resolve())
    .catch((e) => {
      console.error(e);
      const root = document.getElementById('dash-root');
      if (root) root.textContent = lang === 'en' ? 'The dashboard could not be loaded. Please reload the page.' : 'No se pudo cargar el dashboard. Recarga la página.';
    });
})();
