/* Usa el acceso existente del portfolio; Google solo autoriza el archivo cifrado. */
(async function () {
  'use strict';
  const config = window.BovedaConfig, status = document.getElementById('accessStatus');
  const SESSION = 'bm_ap_session'; let lastActivity = Date.now();
  const fail = () => { window.dispatchEvent(new Event('boveda-signout')); document.getElementById('app').hidden = true; document.getElementById('accessGate').hidden = false; status.textContent = 'Entra en el área privada del portfolio para abrir Bóveda.'; };
  async function access() {
    let session; try { session = JSON.parse(sessionStorage.getItem(SESSION)); } catch {}
    if (!session?.access_token || !session.refresh_token) throw Error('LOGIN');
    if (!session.expires_at || session.expires_at * 1000 < Date.now() + 60000) {
      const r = await fetch(config.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }), cache: 'no-store' });
      if (!r.ok) throw Error('LOGIN'); const data = await r.json();
      session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at || Math.floor(Date.now()/1000) + data.expires_in, email: data.user?.email };
      sessionStorage.setItem(SESSION, JSON.stringify(session));
    }
    const headers = { apikey: config.supabaseKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
    const r = await fetch(config.supabaseUrl + '/rest/v1/rpc/is_member', { method: 'POST', headers, body: '{}', cache: 'no-store' });
    if (!r.ok || await r.json() !== true) throw Error('MEMBER');
    const u = await fetch(config.supabaseUrl + '/auth/v1/user', { headers, cache: 'no-store' });
    if (!u.ok) throw Error('LOGIN'); const user = await u.json();
    if (!/^[a-f0-9-]{36}$/i.test(user.id)) throw Error('LOGIN');
    if (window.BovedaUser && window.BovedaUser.id !== user.id) throw Error('LOGIN');
    window.BovedaUser = { id: user.id };
  }
  try {
    await access();
    const script = document.createElement('script'); script.src = document.querySelector('[data-boveda-app]').href;
    script.onerror = () => { status.textContent = 'No se pudo cargar Bóveda. Recarga la página.'; document.getElementById('accessGate').hidden = false; };
    script.onload = () => { document.getElementById('accessGate').hidden = true; document.getElementById('app').hidden = false; };
    document.head.append(script);
    for (const type of ['pointerdown','keydown']) document.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true });
    setInterval(async () => { try { if (Date.now() - lastActivity > 30*60000) { sessionStorage.removeItem(SESSION); throw Error('IDLE'); } await access(); } catch { fail(); } }, 60000);
  } catch { fail(); }
})();
