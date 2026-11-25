/* Versiones KDBX inmutables en appDataFolder. Sin tokens persistidos ni texto descifrado. */
(function (root) {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const MARK = 'boveda-kdbx-v1';
  const error = (code) => Object.assign(new Error(code), { code });
  function parents(file) {
    const p = file.appProperties || {};
    return Object.keys(p).filter(k => k === 'previous' || /^merge\d+$/.test(k)).map(k => p[k]).filter(id => id !== 'root');
  }
  function heads(files) {
    const ids = new Set(files.map(f => f.id)), used = new Set();
    for (const f of files) for (const id of parents(f)) {
      if (!ids.has(id)) throw error('HISTORY_INCOMPLETE');
      used.add(id);
    }
    const result = files.filter(f => !used.has(f.id));
    if (files.length && !result.length) throw error('HISTORY_INCOMPLETE');
    return result;
  }
  function validate(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 100 || bytes.length > 5 * 1024 * 1024 ||
      ![3,217,162,154,103,251,75,181].every((v,i) => bytes[i] === v) || bytes[10] !== 4 || bytes[11] !== 0) throw error('INVALID_KDBX');
  }
  class Drive {
    constructor({ fetch: transport = root.fetch.bind(root), now = Date.now } = {}) {
      this.transport = transport; this.now = now; this.token = null; this.expires = 0; this.generation = 0;
    }
    authorize(token, seconds) { this.generation++; this.token = token; this.expires = this.now() + Number(seconds) * 1000 - 30000; }
    disconnect() { this.generation++; this.token = null; this.expires = 0; }
    async request(url, options = {}) {
      if (!this.token || this.now() >= this.expires) throw error('GOOGLE_SIGNIN');
      const generation = this.generation;
      const response = await this.transport(url, { ...options, cache: 'no-store', credentials: 'omit', redirect: 'error', headers: { ...options.headers, Authorization: 'Bearer ' + this.token } });
      if (generation !== this.generation) throw error('GOOGLE_SIGNIN');
      if (response.status === 401) { this.disconnect(); throw error('GOOGLE_SIGNIN'); }
      if (!response.ok) throw error(response.status === 403 ? 'GOOGLE_PERMISSION' : 'DRIVE_FAILED');
      return response;
    }
    async versions() {
      const all = []; let page = '';
      do {
        const query = new URLSearchParams({ spaces: 'appDataFolder', q: "trashed = false and appProperties has { key='boveda' and value='" + MARK + "' }", pageSize: '1000', fields: 'nextPageToken,incompleteSearch,files(id,createdTime,appProperties,size)', ...(page ? { pageToken: page } : {}) });
        const data = await (await this.request(API + '?' + query)).json();
        if (data.incompleteSearch || !Array.isArray(data.files)) throw error('HISTORY_INCOMPLETE');
        all.push(...data.files); page = data.nextPageToken || '';
        if (all.length > 10000) throw error('HISTORY_LIMIT');
      } while (page);
      if (new Set(all.map(f => f.id)).size !== all.length) throw error('HISTORY_INCOMPLETE');
      return all;
    }
    async current() {
      const latest = heads(await this.versions());
      if (latest.length > 1) throw Object.assign(error('CONFLICT'), { heads: latest });
      return latest[0] || null;
    }
    async download(file) {
      if (Number(file.size) > 5 * 1024 * 1024) throw error('INVALID_KDBX');
      const response = await this.request(API + '/' + encodeURIComponent(file.id) + '?alt=media');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 5 * 1024 * 1024) { await reader.cancel(); throw error('INVALID_KDBX'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      validate(bytes); return bytes;
    }
    async read() { const file = await this.current(); return file ? { bytes: await this.download(file), revision: file.id } : null; }
    async append(bytes, expected, merge = []) {
      validate(bytes);
      const generation = this.generation;
      const currentHeads = heads(await this.versions());
      const wanted = merge.length ? [...merge].sort() : expected ? [expected] : [];
      if (JSON.stringify(currentHeads.map(f => f.id).sort()) !== JSON.stringify(wanted)) throw error('CONFLICT');
      if (merge.length > 20) throw error('TOO_MANY_CONFLICTS');
      const appProperties = { boveda: MARK, previous: expected || 'root' };
      merge.filter(id => id !== expected).forEach((id, i) => { appProperties['merge' + i] = id; });
      const boundary = 'boveda_' + root.crypto.randomUUID();
      const metadata = { name: 'Boveda-' + new Date(this.now()).toISOString().replace(/[:.]/g, '-') + '.kdbx', parents: ['appDataFolder'], mimeType: 'application/octet-stream', appProperties };
      const body = new Blob(['--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n', JSON.stringify(metadata), '\r\n--' + boundary + '\r\nContent-Type: application/octet-stream\r\n\r\n', bytes, '\r\n--' + boundary + '--\r\n'], { type: 'multipart/related; boundary=' + boundary });
      // Every save creates a file. Never PATCH or DELETE an earlier version.
      const saved = await (await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': body.type }, body })).json();
      if (!saved.id || generation !== this.generation) throw error('GOOGLE_SIGNIN');
      const latest = heads(await this.versions());
      if (latest.length !== 1 || latest[0].id !== saved.id) throw error('CONFLICT');
      return saved.id;
    }
  }
  root.BovedaDrive = { Drive, heads, validate, SCOPE };
  if (typeof module === 'object' && module.exports) module.exports = root.BovedaDrive;
})(typeof window === 'object' ? window : globalThis);
