/* ═══════════════════════════════════════════════
   area-privada-apps.js: catálogo de apps (#/apps)
   ─────────────────────────────────────────────────
   Lanzador de las herramientas personales. Solo pinta: nombre, icono, ruta y descripción salen
   del registro APPS de area-privada.js (ctx.apps), así que una app nueva no toca este archivo.
   Cada entrada es un único enlace (toda la ficha es pulsable); las apps con módulo se abren en
   modo app dentro del área privada y las demás son páginas propias (p. ej. roma-aeterna/).
   ═══════════════════════════════════════════════ */
window.APApps = (function () {
  'use strict';

  function render(ctx) {
    var h = ctx.h;
    return Promise.resolve(function paint() {
      ctx.view.textContent = '';
      ctx.view.appendChild(h('section', { class: 'apl', 'aria-labelledby': 'ap-app-title' }, [
        h('p', { class: 'apl-intro', text: 'Herramientas propias. Cada una se abre con su propia interfaz.' }),
        h('ul', { class: 'apl-grid' }, ctx.apps.map(function (a) {
          return h('li', null, [
            h('a', { class: 'apl-app', href: a.href, 'data-app': a.id }, [
              h('img', { class: 'apl-icon', src: a.icon, alt: '', width: '64', height: '64', decoding: 'async' }),
              h('span', { class: 'apl-name', text: a.name }),
              h('span', { class: 'apl-desc', text: a.desc })
            ])
          ]);
        }))
      ]));
    });
  }

  return { render: render };
})();
