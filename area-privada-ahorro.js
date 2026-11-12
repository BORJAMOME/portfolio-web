window.APAhorro = (function () {
  'use strict';

  var endpoint = '/rest/v1/ahorro_preferences';
  var keys = ['ahorro-perspectiva-v2', 'ahorro-presupuesto-v1', 'ahorro-laboratorio-v1'];

  async function render(ctx) {
    var members = await ctx.api('/rest/v1/members?select=user_id&limit=1');
    if (!members.length) {
      return function () { ctx.view.textContent = 'Tu cuenta no tiene acceso a Ahorro con perspectiva.'; };
    }
    var user = members[0].user_id;
    var rows;
    try {
      rows = await ctx.api(endpoint + '?select=key,value&user_id=eq.' + encodeURIComponent(user));
    } catch (error) {
      if (error.auth || error.status === 401) throw error;
      return function () {
        ctx.view.textContent = 'No se pudo cargar el presupuesto. Comprueba que el almacenamiento de Ahorro esté habilitado y vuelve a abrir la app.';
      };
    }

    return function () {
      var frame = ctx.h('iframe', {
        class: 'ap-ahorro-frame',
        title: 'Ahorro con perspectiva',
        src: './apps/ahorro-con-perspectiva/index.html'
      });
      frame.ahorro = {
        values: Object.fromEntries(rows.map(function (row) { return [row.key, row.value]; })),
        activity: function () {
          if (ctx.isCurrent()) document.dispatchEvent(new Event('pointerdown'));
        },
        write: function (key, value) {
          if (!frame.isConnected || !ctx.isCurrent() || !keys.includes(key)) return Promise.reject(new Error('Sesión cerrada'));
          return ctx.api(endpoint + '?on_conflict=user_id,key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ user_id: user, key: key, value: value })
          });
        }
      };
      ctx.view.replaceChildren(frame);
    };
  }

  return { render: render };
})();
