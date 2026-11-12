(async function () {
  'use strict';

  const bridge = window.frameElement?.ahorro;
  if (!bridge) return;

  const values = new Map(Object.entries(bridge.values));
  const pending = new Map();
  const status = document.getElementById('ahorroSync');
  const access = document.getElementById('ahorroAccess');
  let saving = false;

  async function save() {
    if (saving) return;
    saving = true;
    status.hidden = false;
    status.textContent = 'Guardando en tu cuenta…';
    try {
      for (const [key, value] of pending) {
        await bridge.write(key, value);
        if (pending.get(key) === value) pending.delete(key);
        else {
          const latest = pending.get(key);
          pending.delete(key);
          pending.set(key, latest);
        }
      }
      status.textContent = 'Cambios guardados en tu cuenta.';
    } catch {
      status.replaceChildren('Hay cambios pendientes de guardar. ');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Reintentar';
      retry.addEventListener('click', save);
      status.append(retry);
    } finally {
      saving = false;
    }
  }

  function update(key, value) {
    if ((values.get(key) ?? null) === value && !pending.has(key)) return;
    values.set(key, value);
    pending.set(key, value);
    void save();
  }

  window.AhorroStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => update(key, String(value)),
    removeItem: key => update(key, null)
  };

  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    document.addEventListener(type, bridge.activity, { passive: true });
  }

  try {
    for (const file of ['planner-model', 'premium-model', 'engine', 'app', 'story', 'planner', 'premium']) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = file + '.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
    }
    access.hidden = true;
    document.body.classList.remove('ahorro-locked');
  } catch {
    access.prepend('No se pudo cargar la aplicación. ');
  }
})();
