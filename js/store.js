/* MSC app — client-side data & account layer.
   This is the "backend" for the static build: auth, roles, settings,
   forecast overrides and field observations, persisted on-device in
   localStorage behind a small adapter (Store) so a real API backend can
   replace it without touching the views. Demo credentials are intentionally
   public — this is a personal/demo build, not real access control. */

'use strict';

const Store = (() => {
  const K = {
    session: 'msc.session',
    theme: 'msc.theme',
    custom: 'msc.custom',
    override: 'msc.override.', // + regionId
    obs: 'msc.fieldObs'
  };

  // seeded demo accounts (documented on the Account screen).
  // PINs stored as SHA-256("msc:<user>:<pin>") — no plaintext credentials
  // in the bundle. A real backend replaces this with server-side auth.
  const USERS = [
    { user: 'forecaster', hash: '68160fb7dedc9d89408ddf5862993f43f0be6c25095359f83d265c26b15ee020', name: 'Duty Forecaster', role: 'forecaster' },
    { user: 'observer',   hash: 'cfc27a835d6eb9ce1e7c90313ef203ae70aae9a2d918a3c3f6d81d98ce9b4d8c', name: 'Field Observer',  role: 'observer' },
    { user: 'member',     hash: 'c1f645a0d3b2ee94eb90635434a419d0b9eced09dcb348ed2d90972f771d55a4', name: 'MSC Member',      role: 'member' }
  ];

  // access tiers: base (no login) < member < observer < forecaster
  const ROLE_RANK = { guest: 0, member: 1, observer: 2, forecaster: 3 };

  const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 h

  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const read = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
    catch { return fallback; }
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  return {
    // ---- auth ----
    async login(user, pin) {
      const uname = String(user).trim().toLowerCase().slice(0, 40);
      const hash = await sha256Hex(`msc:${uname}:${String(pin).trim()}`);
      const u = USERS.find((x) => x.user === uname && x.hash === hash);
      if (!u) return null;
      const session = { user: u.user, name: u.name, role: u.role, since: Date.now() };
      write(K.session, session);
      return session;
    },
    logout() { localStorage.removeItem(K.session); },
    session() {
      const s = read(K.session, null);
      if (s && Date.now() - (s.since || 0) > SESSION_TTL) { this.logout(); return null; }
      return s;
    },
    role() { return this.session()?.role ?? 'guest'; },
    hasRole(min) { return (ROLE_RANK[this.role()] ?? 0) >= (ROLE_RANK[min] ?? 99); },

    // ---- theme ----
    theme() { return localStorage.getItem(K.theme) || 'light'; },
    setTheme(t) { localStorage.setItem(K.theme, t); },

    // ---- app customisation (forecaster/admin) ----
    custom() {
      return read(K.custom, { modules: { charts: true, rose: true, banner: true }, accent: 'red' });
    },
    setCustom(c) { write(K.custom, c); },

    // ---- forecast overrides (forecaster) ----
    override(regionId) { return read(K.override + regionId, null); },
    setOverride(regionId, data) { write(K.override + regionId, data); },
    clearOverride(regionId) { localStorage.removeItem(K.override + regionId); },

    // ---- field observations (observer) ----
    observations() { return read(K.obs, []); },
    saveObservation(o) {
      const all = this.observations();
      o.id = 'obs-' + Date.now();
      all.unshift(o);
      write(K.obs, all);
      return o.id;
    },
    deleteObservation(id) {
      write(K.obs, this.observations().filter((o) => o.id !== id));
    }
  };
})();
