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
    obs: 'msc.fieldObs',
    users: 'msc.users', // admin-created accounts (hashed, never plaintext)
    videos: 'msc.videos', // admin-added YouTube videos
    favs: 'msc.favProfiles' // usernames favourited in the tours feed
  };

  // ---- IndexedDB: GPS tracks and photos are too big for localStorage ----
  const DB_NAME = 'msc-db';
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('trips', { keyPath: 'id' });
          req.result.createObjectStore('media', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function idb(storeName, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, mode);
      const res = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(res.result !== undefined ? res.result : res);
      tx.onerror = () => reject(tx.error);
    });
  }

  // Accepts a raw 11-char YouTube ID or any common URL form
  // (watch?v=, youtu.be/, /shorts/, /embed/, /live/). Returns the ID or null.
  function parseYouTubeId(input) {
    const s = String(input).trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|embed|live)\/)([A-Za-z0-9_-]{11})(?:[?&#]|$)/);
    return m ? m[1] : null;
  }

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
    // ---- users (seeded demo + admin-created) ----
    customUsers() { return read(K.users, []); },
    allUsers() { return [...USERS.map((u) => ({ ...u, seeded: true })), ...this.customUsers()]; },
    async addUser({ name, user, pin, role }) {
      const uname = String(user).trim().toLowerCase().slice(0, 40);
      if (!uname || !/^[a-z0-9_.-]+$/.test(uname)) return { error: 'Username: letters, numbers, dot, dash only.' };
      if (this.allUsers().some((x) => x.user === uname)) return { error: 'That username already exists.' };
      if (!/^\d{4,8}$/.test(String(pin).trim())) return { error: 'PIN must be 4–8 digits.' };
      if (!['member', 'observer', 'forecaster'].includes(role)) return { error: 'Invalid role.' };
      const hash = await sha256Hex(`msc:${uname}:${String(pin).trim()}`);
      const list = this.customUsers();
      list.push({ user: uname, name: String(name).trim().slice(0, 60) || uname, role, hash, created: Date.now() });
      write(K.users, list);
      return { ok: true };
    },
    removeUser(uname) {
      write(K.users, this.customUsers().filter((u) => u.user !== uname));
      const s = this.session();
      if (s && s.user === uname) this.logout();
    },

    // ---- video library (seeded MSC channel + admin-added) ----
    customVideos() { return read(K.videos, []); },
    allVideos() { return [...SEED_VIDEOS.map((v) => ({ ...v, seeded: true })), ...this.customVideos()]; },
    addVideo({ url, title, note }) {
      const id = parseYouTubeId(url);
      if (!id) return { error: 'Paste a YouTube link or 11-character video ID.' };
      if (this.allVideos().some((v) => v.id === id)) return { error: 'That video is already in the library.' };
      const t = String(title || '').trim().slice(0, 90);
      if (!t) return { error: 'Give the video a title.' };
      const list = this.customVideos();
      list.push({ id, title: t, note: String(note || '').trim().slice(0, 140), added: Date.now() });
      write(K.videos, list);
      return { ok: true };
    },
    removeVideo(id) { write(K.videos, this.customVideos().filter((v) => v.id !== id)); },

    // ---- tours: GPS tracks, trip posts, on-device forum ----
    // A trip: { id, owner, ownerName, title, desc, started, ended,
    //   points: [[tOffsetSec, lat, lng, altM]...], stats: {dist, gain, loss,
    //   maxAlt, durSec}, photos: [mediaId...], videoLinks: [{id?, url, label}],
    //   obs: [inline observation notes], shared, likes: [user...],
    //   comments: [{id, user, name, text, at}] }
    async saveTrip(trip) { await idb('trips', 'readwrite', (s) => s.put(trip)); return trip.id; },
    async getTrip(id) { return idb('trips', 'readonly', (s) => s.get(id)); },
    async allTrips() {
      const trips = await idb('trips', 'readonly', (s) => s.getAll());
      return (trips || []).sort((a, b) => b.started - a.started);
    },
    async deleteTrip(id) {
      const t = await this.getTrip(id);
      for (const m of t?.photos || []) await idb('media', 'readwrite', (s) => s.delete(m));
      await idb('trips', 'readwrite', (s) => s.delete(id));
    },
    async savePhoto(id, blob) { await idb('media', 'readwrite', (s) => s.put({ id, blob })); },
    async getPhoto(id) { return (await idb('media', 'readonly', (s) => s.get(id)))?.blob || null; },

    // forum interactions (per signed-in local account)
    async toggleLike(tripId) {
      const t = await this.getTrip(tripId);
      const u = this.session()?.user;
      if (!t || !u) return null;
      t.likes = t.likes || [];
      t.likes = t.likes.includes(u) ? t.likes.filter((x) => x !== u) : [...t.likes, u];
      await this.saveTrip(t);
      return t.likes.length;
    },
    async addComment(tripId, text) {
      const t = await this.getTrip(tripId);
      const s = this.session();
      const body = String(text || '').trim().slice(0, 500);
      if (!t || !s || !body) return null;
      t.comments = t.comments || [];
      t.comments.push({ id: 'c-' + Date.now(), user: s.user, name: s.name, text: body, at: Date.now() });
      await this.saveTrip(t);
      return t.comments;
    },
    favProfiles() { return read(K.favs, []); },
    toggleFav(user) {
      const f = this.favProfiles();
      write(K.favs, f.includes(user) ? f.filter((x) => x !== user) : [...f, user]);
      return this.favProfiles();
    },

    // ---- migration (to a future hosted backend) ----
    // Exports salted SHA-256 credential records — never plaintext (plaintext
    // is never stored, so "transferring passwords" means transferring hashes;
    // the new system verifies with the same scheme on first login, then
    // re-hashes to its own. Standard staged auth migration.)
    async exportBundle() {
      const trips = (await this.allTrips()).map((t) => ({ ...t, photos: [] })); // media blobs stay on-device
      return {
        format: 'msc-app-migration',
        version: 1,
        exported: new Date().toISOString(),
        hashScheme: 'sha256(msc:<user>:<pin>)',
        users: this.customUsers(),
        videos: this.customVideos(),
        trips,
        favProfiles: this.favProfiles(),
        observations: this.observations(),
        overrides: Object.fromEntries(
          ['main-range', 'dividing-range'].map((r) => [r, this.override(r)]).filter(([, v]) => v)
        ),
        settings: this.custom()
      };
    },
    async importBundle(bundle) {
      if (bundle?.format !== 'msc-app-migration' || bundle.version !== 1) {
        return { error: 'Not a valid migration bundle.' };
      }
      for (const t of Array.isArray(bundle.trips) ? bundle.trips : []) {
        if (typeof t?.id === 'string' && /^trip-\d+$/.test(t.id) && Array.isArray(t.points)) {
          await this.saveTrip({ ...t, photos: [] });
        }
      }
      if (Array.isArray(bundle.favProfiles)) write(K.favs, bundle.favProfiles.filter((f) => typeof f === 'string').slice(0, 100));
      const clean = (Array.isArray(bundle.users) ? bundle.users : []).filter((u) =>
        typeof u?.user === 'string' && /^[a-z0-9_.-]{1,40}$/.test(u.user) &&
        typeof u?.hash === 'string' && /^[0-9a-f]{64}$/.test(u.hash) &&
        ['member', 'observer', 'forecaster'].includes(u.role)
      ).map((u) => ({ user: u.user, name: String(u.name || u.user).slice(0, 60), role: u.role, hash: u.hash, created: u.created || Date.now() }));
      write(K.users, clean);
      const cleanVids = (Array.isArray(bundle.videos) ? bundle.videos : []).filter((v) =>
        typeof v?.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.id) && typeof v?.title === 'string'
      ).map((v) => ({ id: v.id, title: String(v.title).slice(0, 90), note: String(v.note || '').slice(0, 140), added: v.added || Date.now() }));
      if (cleanVids.length) write(K.videos, cleanVids);
      if (Array.isArray(bundle.observations)) write(K.obs, bundle.observations.slice(0, 200));
      return { ok: true, users: clean.length };
    },

    // ---- auth ----
    async login(user, pin) {
      const uname = String(user).trim().toLowerCase().slice(0, 40);
      const hash = await sha256Hex(`msc:${uname}:${String(pin).trim()}`);
      const u = this.allUsers().find((x) => x.user === uname && x.hash === hash);
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
