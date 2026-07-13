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

  // seeded demo accounts (documented on the Account screen)
  const USERS = [
    { user: 'forecaster', pin: '2626', name: 'Duty Forecaster', role: 'forecaster' },
    { user: 'observer',   pin: '1850', name: 'Field Observer',  role: 'observer' }
  ];

  const read = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
    catch { return fallback; }
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  return {
    // ---- auth ----
    login(user, pin) {
      const u = USERS.find((x) => x.user === user.trim().toLowerCase() && x.pin === pin.trim());
      if (!u) return null;
      const session = { user: u.user, name: u.name, role: u.role, since: Date.now() };
      write(K.session, session);
      return session;
    },
    logout() { localStorage.removeItem(K.session); },
    session() { return read(K.session, null); },
    role() { return this.session()?.role ?? 'guest'; },

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
