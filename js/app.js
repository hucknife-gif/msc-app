/* MSC app — hash router + renderers.
   External/live data is always treated as data: every dynamic string goes
   through esc() before hitting the DOM. */

'use strict';

// ---------- utilities ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  mountain: '<path d="M3 20 9 8l3.5 6L15 10l6 10Z"/>',
  report:   '<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 16h6"/>',
  eye:      '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
  wind:     '<path d="M3 8h9a3 3 0 1 0-3-3"/><path d="M3 12h13a3 3 0 1 1-3 3"/><path d="M3 16h6"/>',
  layers:   '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  triangle: '<path d="M12 4 22 20H2Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  binoculars:'<circle cx="6.5" cy="16.5" r="3.5"/><circle cx="17.5" cy="16.5" r="3.5"/><path d="M10 16V6a2 2 0 0 1 4 0v10"/><path d="M10 9h4"/>',
  book:     '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19a2 2 0 0 0 2 2h13"/>',
  cross:    '<path d="M10 3h4v6h6v4h-6v8h-4v-8H4V9h6Z"/>',
  phone:    '<path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  chevR:    '<path d="m9 5 7 7-7 7"/>',
  chevL:    '<path d="m15 5-7 7 7 7"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
  send:     '<path d="m21 3-8 18-3-8-8-3Z"/><path d="M21 3 10 13"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'
};
const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// ---------- state ----------
const store = {
  get region() { return localStorage.getItem('msc.region') || 'main-range'; },
  set region(v) { localStorage.setItem('msc.region', v); },
  get reportTab() { return sessionStorage.getItem('msc.reportTab') || 'danger'; },
  set reportTab(v) { sessionStorage.setItem('msc.reportTab', v); }
};

// ---------------------------------------------------------------
// Live data adapter — MSC public report API (CORS-open, no auth).
// All fetched values are treated as untrusted text: rendered only
// through esc(), types coerced, numbers clamped. Falls back to the
// bundled sample when offline or unpublished.
// ---------------------------------------------------------------
const live = { reports: null, tried: false };

const sydneyDate = (back = 0) => {
  const d = new Date(Date.now() - back * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }); // YYYY-MM-DD
};

// severity heuristic for live rating strings (colour only; text is theirs)
function keywordSev(s) {
  const t = String(s).toLowerCase();
  if (/high|severe|warning|whiteout|travel not|extreme|icy/.test(t)) return 3;
  if (/considerable|poor|extra/.test(t)) return 2;
  if (/moderate|notable|firm/.test(t)) return 1;
  if (/low|good|soft|mild|nil|usual|clear/.test(t)) return 0;
  return 1;
}
// MSC's own day-score algorithm (from their report app): sum the band's
// hazard ratings — >=8 Travel Not Recommended, 4–7 Extra Caution, <=3 Usual
// Caution; a non-zero override rating replaces the sum.
const ratingToScore = (n) => n >= 8 ? 'travel-not-recommended' : n >= 4 ? 'extra-caution' : 'usual-caution';

const CATEGORY_MAP = {
  'weather conditions': 'exposure', 'visibility': 'visibility',
  'surface conditions': 'surface', 'avalanche danger': 'avalanche'
};

function mapLiveBand(entries, override) {
  const dangers = {};
  let sum = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    const key = CATEGORY_MAP[String(e?.category || '').trim().toLowerCase()];
    if (!key) continue;
    const name = String(e?.name || '').trim() || '—';
    dangers[key] = name;
    sum += parseInt(e?.rating, 10) || 0;
  }
  const ov = parseInt(override, 10) || 0;
  return { dangers, score: ratingToScore(ov > 0 ? ov : sum) };
}

// split their travel blob into per-band bullet lists on Alpine/Subalpine headings
function splitTravel(blob) {
  const out = { alpine: [], subalpine: [] };
  let bucket = null;
  for (const raw of String(blob || '').split('\n')) {
    const line = raw.replace(/^[-•*\s]+/, '').trim();
    if (!line) continue;
    if (/^alpine\b/i.test(line)) { bucket = 'alpine'; continue; }
    if (/^sub[- ]?alpine\b/i.test(line)) { bucket = 'subalpine'; continue; }
    if (bucket) out[bucket].push(line);
    else { out.alpine.push(line); out.subalpine.push(line); }
  }
  return out;
}

function mapLiveReport(raw) {
  const r = raw?.report || {};
  const alpine = mapLiveBand(raw?.alpine_hazards, r.override_alpine_rating);
  const subalpine = mapLiveBand(raw?.sub_alpine_hazards, r.override_sub_alpine_rating);
  const travel = splitTravel(r.travel_and_terrain_advice);
  const tiers = { primary: 1, secondary: 2, tertiary: 3 };
  const hazards = (Array.isArray(raw?.categorisation) ? raw.categorisation : []).map((c) => {
    const tier = String(c?.type || 'Primary');
    const elev = String(c?.elevation || '').toLowerCase();
    const isAv = !!c?.characteristic; // non-avalanche entries have null characteristic
    const lk = LIKELIHOODS.find((l) => l.toLowerCase() === String(c?.likelihood || '').trim().toLowerCase());
    const sizeId = parseInt(c?.avalanche_sizes_id, 10);
    return {
      n: tiers[tier.toLowerCase()] || 1, tier,
      name: String(c?.characteristic || c?.hazard || 'Hazard').trim(),
      type: isAv ? 'avalanche' : 'other',
      desc: String(c?.summary || '').trim(),
      about: String(c?.characteristic_info || '').trim(),
      bands: [elev.includes('sub') ? 'subalpine' : 'alpine'],
      aspects: [String(c?.aspect || '').trim().toUpperCase()].filter((a) => ASPECT_ORDER.includes(a)),
      size: isAv && sizeId ? Math.min(3, Math.max(1, sizeId)) : null,
      likelihood: isAv ? (lk || null) : null
    };
  }).sort((a, b) => a.n - b.n);

  return {
    live: true, sample: false,
    issued: String(r.date || ''),
    preparedBy: String(r.published_by || r.created_by || 'MSC'),
    confidence: String(r.forecast_confidence || '—'),
    confidenceNote: String(r.forecast_confidence_summary || '').trim(),
    dayScore: alpine.score,
    synopsis: String(r.regional_outlook || '').trim(),
    weatherSummary: String(r.weather_summary || '').trim(),
    details: [String(r.snowpack_summary || '').trim(), String(r.hazard_summary || '').trim()].filter(Boolean).join(' '),
    hazards,
    bands: {
      alpine: { score: alpine.score, dangers: alpine.dangers, travel: travel.alpine },
      subalpine: { score: subalpine.score, dangers: subalpine.dangers, travel: travel.subalpine }
    }
  };
}

function liveRegionId(regionStr) {
  const s = String(regionStr || '').toLowerCase();
  if (s.includes('main')) return 'main-range';
  if (s.includes('divid')) return 'dividing-range';
  return null;
}

async function tryLiveFetch() {
  if (live.tried || localStorage.getItem('msc.disableLive')) return;
  live.tried = true;
  for (const back of [0, 1]) {
    try {
      const res = await fetch('https://api.mountainsafetycollective.org/report/get_view_data_by_date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sydneyDate(back) }),
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.status === 1 && Array.isArray(json.reports) && json.reports.length) {
        const mapped = {};
        for (const rep of json.reports) {
          const id = liveRegionId(rep?.report?.region);
          if (id) mapped[id] = mapLiveReport(rep);
        }
        if (Object.keys(mapped).length) { live.reports = mapped; render(); return; }
      }
    } catch { /* offline — sample data stands in */ }
  }
}

function currentReport() {
  // precedence: forecaster override > live MSC report > bundled sample
  const base = live.reports?.[store.region] || SAMPLE_REPORTS[store.region];
  const ov = Store.override(store.region);
  if (!ov) return base;
  // forecaster override: shallow-merge top level, deep-merge band fields
  const merged = { ...base, ...ov, sample: false, updated: ov.updated, bands: { ...base.bands } };
  for (const b of ['alpine', 'subalpine']) {
    if (ov.bands?.[b]) {
      merged.bands[b] = { ...base.bands[b], ...ov.bands[b],
        dangers: { ...base.bands[b].dangers, ...(ov.bands[b].dangers || {}) } };
    }
  }
  return merged;
}

// ---------- shared renderers ----------
function sevClass(cat, lvl) {
  const v = LEVEL_SEVERITY[cat]?.[lvl];
  return 'sev-' + (v ?? keywordSev(lvl));
}

// bulletin-rule section header: title left, field-note metadata right
function rule(title, meta = '') {
  return `<div class="rule"><h2 class="t">${title}</h2>${meta ? `<span class="m">${meta}</span>` : ''}</div>`;
}

// ---------- charts (inline SVG, instrument-cyan data colour) ----------
const CHART_W = 340, CHART_H = 96;

function scalePts(values, w, h, pad = 10) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) || 1;
  return values.map((v, i) => [
    pad + (i * (w - pad * 2)) / (values.length - 1),
    h - pad - ((v - min) * (h - pad * 2)) / span
  ]);
}

// smooth line + soft area fill, direct min/max labels (no cramped axes)
function lineChart(values, labels, unit, id) {
  const pts = scalePts(values, CHART_W, CHART_H);
  const d = pts.map((p, i) => {
    if (!i) return `M${p[0]},${p[1]}`;
    const [px, py] = pts[i - 1];
    const cx = (px + p[0]) / 2;
    return `C${cx},${py} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }).join(' ');
  const area = `${d} L${pts.at(-1)[0]},${CHART_H - 4} L${pts[0][0]},${CHART_H - 4} Z`;
  const iMax = values.indexOf(Math.max(...values));
  const iMin = values.indexOf(Math.min(...values));
  const lbl = (i, anchor) => `<text x="${pts[i][0]}" y="${pts[i][1] - 7}" text-anchor="${anchor}" class="ch-lbl">${values[i]}${unit}</text>`;
  return `<svg class="chart" viewBox="0 0 ${CHART_W} ${CHART_H + 18}" role="img" aria-label="${labels[0]}–${labels.at(-1)} values ${values.join(', ')}${unit}">
    <defs><linearGradient id="ga-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--data)" stop-opacity="0.28"/>
      <stop offset="1" stop-color="var(--data)" stop-opacity="0"/>
    </linearGradient></defs>
    ${[0.25, 0.5, 0.75].map((f) => `<line x1="10" x2="${CHART_W - 10}" y1="${CHART_H * f}" y2="${CHART_H * f}" class="ch-grid"/>`).join('')}
    <path d="${area}" fill="url(#ga-${id})"/>
    <path d="${d}" class="ch-line"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === iMax || i === iMin ? 3.5 : 2}" class="ch-dot"/>`).join('')}
    ${lbl(iMax, iMax < 2 ? 'start' : iMax > values.length - 3 ? 'end' : 'middle')}
    ${iMin !== iMax ? lbl(iMin, iMin < 2 ? 'start' : iMin > values.length - 3 ? 'end' : 'middle') : ''}
    ${labels.map((t, i) => `<text x="${pts[i][0]}" y="${CHART_H + 13}" text-anchor="middle" class="ch-axis">${t}</text>`).join('')}
  </svg>`;
}

function barChart(values, labels, unit) {
  const max = Math.max(...values, 1);
  const pad = 10, bw = (CHART_W - pad * 2) / values.length;
  return `<svg class="chart" viewBox="0 0 ${CHART_W} ${CHART_H + 18}" role="img" aria-label="values ${values.join(', ')}${unit}">
    ${values.map((v, i) => {
      const h = v === 0 ? 2 : (v / max) * (CHART_H - 26);
      const x = pad + i * bw + bw * 0.2;
      return `<rect x="${x}" y="${CHART_H - 4 - h}" width="${bw * 0.6}" height="${h}" rx="2.5"
        class="${v === 0 ? 'ch-bar-nil' : 'ch-bar'}"/>` +
        (v > 0 ? `<text x="${x + bw * 0.3}" y="${CHART_H - 10 - h}" text-anchor="middle" class="ch-lbl">${v}</text>` : '');
    }).join('')}
    ${labels.map((t, i) => `<text x="${pad + i * bw + bw * 0.5}" y="${CHART_H + 13}" text-anchor="middle" class="ch-axis">${t}</text>`).join('')}
  </svg>`;
}

// 8-sector aspect rose — wind-slab loading per compass aspect
const ASPECT_ORDER = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const ASPECT_NAMES = { N: 'North', NE: 'North-east', E: 'East', SE: 'South-east', S: 'South', SW: 'South-west', W: 'West', NW: 'North-west' };
const LOAD_NAMES = ['Minimal', 'Isolated', 'Building', 'Heavy'];

function aspectRose(aspects, interactive = true) {
  const cx = 80, cy = 80, r0 = 26, r1 = 72;
  const sectors = ASPECT_ORDER.map((a, i) => {
    const a0 = ((i * 45 - 112.5) * Math.PI) / 180;
    const a1 = ((i * 45 - 67.5) * Math.PI) / 180;
    const p = (r, ang) => `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
    const d = `M${p(r0, a0)} A${r0},${r0} 0 0 1 ${p(r0, a1)} L${p(r1, a1)} A${r1},${r1} 0 0 0 ${p(r1, a0)} Z`;
    const sev = aspects[a] ?? 0;
    return `<path d="${d}" class="rose-sec rose-sev-${sev}" ${interactive ? `data-aspect="${a}" role="button" tabindex="0" aria-label="${ASPECT_NAMES[a]}: ${LOAD_NAMES[sev]} wind-slab loading"` : ''}/>`;
  }).join('');
  const labels = ASPECT_ORDER.map((a, i) => {
    const ang = ((i * 45 - 90) * Math.PI) / 180;
    return `<text x="${cx + 85 * Math.cos(ang)}" y="${cy + 85 * Math.sin(ang) + 3.5}" text-anchor="middle" class="rose-lbl">${a}</text>`;
  }).join('');
  return `<svg class="rose" viewBox="-14 -14 188 188">
    <circle cx="${cx}" cy="${cy}" r="${r1}" class="rose-ring"/>
    <circle cx="${cx}" cy="${cy}" r="${r0}" class="rose-ring"/>
    ${sectors}${labels}
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="rose-core">ASPECT</text>
  </svg>`;
}

// ---------- MSC-style report graphics (per the real report presentation) ----------
const HAZ_BLUE = '#29abe2';

// split mountain: alpine triangle over subalpine trapezoid, 1850 m marker.
// fills = {alpine: colour|null, subalpine: colour|null}; null → outline only
function splitTriangle(fills, size = 'lg') {
  const f = (c) => c ? `fill="${c}" stroke="none"` : `fill="none" stroke="currentColor" stroke-width="2" opacity="0.55"`;
  const marker = size === 'lg' ? `
    <g class="split-marker">
      <path d="M196 86 l7 -8 7 8" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="203" y="103" text-anchor="middle" class="split-elev">1850 m</text>
      <path d="M196 112 l7 8 7 -8" fill="none" stroke="currentColor" stroke-width="2"/>
    </g>` : '';
  return `<svg class="split ${size}" viewBox="0 0 240 190" aria-hidden="true">
    <path d="M118 22 L178 92 L64 92 Z" ${f(fills.alpine)} />
    ${marker}
    <path d="M52 106 L186 106 L216 168 L26 168 Z" ${f(fills.subalpine)} />
  </svg>`;
}

// day-score banner chip: warning diamond + label on score colour
function scoreBanner(scoreKey) {
  const ds = DAY_SCORES[scoreKey];
  return `<div class="score-banner" style="background:${ds.color};color:${ds.text}">
    <svg class="sb-diamond" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="2.5" transform="rotate(45 12 12)" fill="#141414"/>
      <path d="M12 7.5v5.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="12" cy="16.2" r="1.3" fill="#fff"/>
    </svg>
    <span>${esc(ds.label)}</span>
  </div>`;
}

// 8-petal aspect flower (MSC hazard style): active petals filled blue
function petalRose(active, id = '') {
  const petal = 'M0,-14 C 12,-38 34,-52 30,-64 C 26,-76 8,-78 0,-70 C -8,-78 -26,-76 -30,-64 C -34,-52 -12,-38 0,-14 Z';
  return `<svg class="petals" viewBox="-100 -100 200 200" aria-hidden="true">
    ${ASPECT_ORDER.map((a, i) => `
      <g transform="rotate(${i * 45})">
        <path d="${petal}" transform="scale(1.05)"
          ${active.includes(a) ? `fill="${HAZ_BLUE}" stroke="none"` : `fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.5"`}/>
      </g>`).join('')}
    ${ASPECT_ORDER.map((a, i) => {
      const ang = ((i * 45 - 90) * Math.PI) / 180;
      return `<text x="${92 * Math.cos(ang)}" y="${92 * Math.sin(ang) + 4}" text-anchor="middle" class="petal-lbl">${a}</text>`;
    }).join('')}
  </svg>`;
}

// semicircular gauge: segments with one (or a range) active
function gauge(segs, activeIdx, caption) {
  const n = segs.length, r0 = 34, r1 = 62, cx = 70, cy = 70;
  const arc = (i, r) => {
    const a0 = Math.PI + (i * Math.PI) / n;
    const a1 = Math.PI + ((i + 1) * Math.PI) / n;
    return { x0: cx + r * Math.cos(a0), y0: cy + r * Math.sin(a0), x1: cx + r * Math.cos(a1), y1: cy + r * Math.sin(a1) };
  };
  return `<svg class="gauge" viewBox="0 0 140 84" aria-hidden="true">
    ${segs.map((s, i) => {
      const o = arc(i, r1), inn = arc(i, r0);
      const d = `M${inn.x0},${inn.y0} L${o.x0},${o.y0} A${r1},${r1} 0 0 1 ${o.x1},${o.y1} L${inn.x1},${inn.y1} A${r0},${r0} 0 0 0 ${inn.x0},${inn.y0} Z`;
      const mid = Math.PI + ((i + 0.5) * Math.PI) / n;
      const lx = cx + 74 * Math.cos(mid), ly = cy + 74 * Math.sin(mid);
      return `<path d="${d}" class="${i === activeIdx ? 'g-on' : 'g-off'}"/>
        <text x="${lx}" y="${ly + 3}" text-anchor="middle" class="g-lbl">${s}</text>`;
    }).join('')}
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" class="g-cap">${caption}</text>
  </svg>`;
}

const LIKELIHOODS = ['Unlikely', 'Possible', 'Likely', 'Very likely', 'Certain'];

function hazardCard(h) {
  const bandsFill = {
    alpine: h.bands.includes('alpine') ? HAZ_BLUE : null,
    subalpine: h.bands.includes('subalpine') ? HAZ_BLUE : null
  };
  return `<div class="haz-card card">
    <div class="haz-head">
      <span class="haz-num">${h.n}</span>
      <div class="grow"><div class="haz-tier">${esc(h.tier)} hazard</div>
      <h3 class="haz-name">${esc(h.name)}</h3></div>
      <button class="haz-about" data-about="${h.n}" aria-expanded="false">About +</button>
    </div>
    <p class="haz-desc">${esc(h.desc)}</p>
    <p class="haz-aboutText" id="about-${h.n}" hidden>${esc(h.about)}</p>
    <div class="haz-graphics">
      <figure><figcaption>Hazard elevation</figcaption>${splitTriangle(bandsFill, 'sm')}
        <div class="split-labels sm"><span>Alpine</span><span>Subalpine</span></div></figure>
      <figure><figcaption>Hazard aspects</figcaption>${petalRose(h.aspects)}</figure>
      ${h.size ? `<figure><figcaption>Avalanche size</figcaption>${gauge(['1', '2', '3'], h.size - 1, 'Small → Very large')}</figure>` : ''}
      ${h.likelihood ? `<figure><figcaption>Likelihood</figcaption>${gauge(['', '', '', '', ''], LIKELIHOODS.indexOf(h.likelihood), esc(h.likelihood))}</figure>` : ''}
    </div>
  </div>`;
}

// ---------- bottom sheet ----------
function openSheet(html) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.id = 'sheet-root';
  wrap.innerHTML = `<div class="sheet-backdrop"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-grab"></div>${html}
      <button class="btn secondary sheet-close">Close</button>
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  wrap.querySelector('.sheet-backdrop').addEventListener('click', closeSheet);
  wrap.querySelector('.sheet-close').addEventListener('click', closeSheet);
}
function closeSheet() {
  const el = document.getElementById('sheet-root');
  if (!el) return;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 220);
}

function hazardSheet(cat, rep) {
  const c = HAZARD_CATEGORIES[cat];
  const alp = rep.bands.alpine.dangers[cat];
  const sub = rep.bands.subalpine.dangers[cat];
  const scale = HAZARD_LEVELS[cat].map((l) =>
    `<div class="scale-row ${l === alp ? 'now' : ''}">
      <span class="scale-dot sev-${LEVEL_SEVERITY[cat][l]}"></span>
      <span class="scale-name">${esc(l)}</span>
      ${l === alp ? '<span class="scale-now">Alpine today</span>' : l === sub ? '<span class="scale-now dim">Subalpine</span>' : ''}
    </div>`).join('');
  return `<h3 class="sheet-title">${esc(c.label)}</h3>
    <p class="sheet-body">${esc(c.desc)}</p>
    <div class="scale">${scale}</div>`;
}

function aspectSheet(aspect, sev) {
  return `<h3 class="sheet-title">${esc(ASPECT_NAMES[aspect])} aspects</h3>
    <p class="sheet-body">Wind-slab loading: <strong>${esc(LOAD_NAMES[sev])}</strong>.
    ${sev >= 2
      ? 'Lee features on this aspect are collecting wind-transported snow — treat convex rolls, gully walls and cornice aprons as suspect, especially just below ridgelines.'
      : sev === 1
        ? 'Isolated pockets only — most terrain on this aspect is behaving, but probe suspicious wind-textured patches near ridgelines.'
        : 'Little recent loading on this aspect. Standard care still applies around cornices and steep convexities.'}</p>`;
}

// signature motif: topographic contours + Main Range ridgeline silhouette
const CONTOUR_SVG = `<svg class="contours" viewBox="0 0 400 180" preserveAspectRatio="none" aria-hidden="true">
  ${[0, 1, 2, 3, 4].map((i) => `<path d="M-10 ${28 + i * 34} C 60 ${8 + i * 34}, 120 ${44 + i * 34}, 200 ${22 + i * 34} S 340 ${40 + i * 34}, 410 ${16 + i * 34}"
    fill="none" stroke="#e9f1f2" stroke-width="1"/>`).join('')}
</svg>`;
const RIDGE_SVG = `<svg class="ridge" viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 64 L0 40 L52 24 L96 38 L142 12 L188 32 L232 18 L278 38 L326 22 L368 40 L400 30 L400 64 Z" fill="var(--ridge-1)"/>
  <path d="M0 64 L0 48 L44 34 L90 46 L138 24 L190 42 L242 28 L294 46 L348 34 L400 44 L400 64 Z" fill="var(--ridge-2)"/>
</svg>`;

function regionToggle() {
  return `<div class="seg" role="group" aria-label="Region">
    ${REGIONS.map((r) => `<button data-region="${r.id}" aria-pressed="${r.id === store.region}">${esc(r.name)}</button>`).join('')}
  </div>`;
}

function statusBadge(rep) {
  if (rep.updated) {
    return `<span class="badge update"><span class="dot"></span>Forecaster update</span>`;
  }
  return rep.sample
    ? `<span class="badge sample"><span class="dot"></span>Sample data</span>`
    : `<span class="badge live"><span class="dot"></span>Live</span>`;
}

function hazardChips(dangers) {
  return `<div class="hazard-grid">` + Object.keys(HAZARD_CATEGORIES).map((cat) => {
    const lvl = dangers[cat];
    return `<button class="hazard-chip" data-hazard="${cat}" aria-label="${esc(HAZARD_CATEGORIES[cat].label)}: ${esc(lvl)} — more detail">
      <div class="lvl-bar ${sevClass(cat, lvl)}"></div>
      <div class="hc-txt"><div class="name">${esc(HAZARD_CATEGORIES[cat].label)}</div>
      <div class="lvl">${esc(lvl)}</div></div>
      <svg class="icon hc-info" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>
    </button>`;
  }).join('') + `</div>`;
}

// ---------- views ----------
function viewToday() {
  const rep = currentReport();
  const ds = DAY_SCORES[rep.dayScore];
  const region = REGIONS.find((r) => r.id === store.region);
  return `
    ${regionToggle()}
    <div class="hero" style="--hero-c:${ds.color}">
      <div class="glow"></div>
      ${CONTOUR_SVG}
      ${RIDGE_SVG}
      <div class="inner" style="color:${ds.text}">
        <div class="score-label">Today’s day score — ${esc(region.name)}</div>
        <div class="score">${esc(ds.label)}</div>
        <div class="blurb">${esc(ds.blurb)}</div>
        <div class="meta" style="color:var(--snow)">
          <span>${icon('clock', 'icon')} Issued ${esc(rep.issued)}</span>
          <span>Confidence: ${esc(rep.confidence)}</span>
        </div>
      </div>
    </div>
    <div class="row" style="justify-content:space-between;margin-bottom:12px">
      ${statusBadge(rep)}
      <span class="note" style="margin:0">Prepared by: ${esc(rep.preparedBy)}</span>
    </div>

    ${rule('Alpine hazards', 'Band · ~1850 m+')}
    ${hazardChips(rep.bands.alpine.dangers)}

    ${rule('Regional outlook', 'Synopsis')}
    <div class="card"><p style="font-size:15px">${esc(rep.synopsis)}</p></div>

    ${rep.updated ? `<div class="card update-note"><p class="sub">Updated by <strong>${esc(rep.updated.by)}</strong> · ${esc(new Date(rep.updated.at).toLocaleString('en-AU', { hour12: false }))}</p></div>` : ''}
    ${rule('Station snapshot', rep.live ? 'MSC weather summary' : 'Forecast 24 h')}
    ${rep.weather ? `
    <div class="kv">
      <div class="cell"><div class="k">Temp (alpine)</div><div class="v">${esc(rep.weather.temp)}</div></div>
      <div class="cell"><div class="k">Wind</div><div class="v">${esc(rep.weather.wind)}</div></div>
      <div class="cell"><div class="k">Freezing level</div><div class="v">${esc(rep.weather.freezing)}</div></div>
      <div class="cell"><div class="k">Snow next 24 h</div><div class="v">${esc(rep.weather.snow24)}</div></div>
    </div>` : `
    <div class="card"><p style="font-size:15px">${esc(rep.weatherSummary || 'No weather summary published.')}</p>
    ${rep.confidenceNote ? `<p class="sub" style="margin-top:8px">Confidence: ${esc(rep.confidenceNote)}</p>` : ''}</div>`}

    ${!rep.live && Store.custom().modules.charts !== false ? `
    <div class="card chart-card">
      <div class="chart-head"><span class="chart-t">Temperature</span><span class="chart-u">°C · alpine</span></div>
      ${lineChart(rep.trend.temp, rep.trend.hours, '°', 'tmp')}
      <div class="chart-head"><span class="chart-t">Wind</span><span class="chart-u">km/h gusting</span></div>
      ${lineChart(rep.trend.wind, rep.trend.hours, '', 'wnd')}
      <div class="chart-head"><span class="chart-t">Snowfall</span><span class="chart-u">cm / 3 h</span></div>
      ${barChart(rep.trend.snow, rep.trend.hours, 'cm')}
    </div>` : ''}

    ${!rep.live && Store.custom().modules.rose !== false ? `
    ${rule('Wind loading', 'Alpine · by aspect')}
    <div class="card rose-card">
      ${aspectRose(rep.aspects.alpine)}
      <div class="rose-side">
        <p class="sub">Where the wind has been parking snow. Tap a sector for what that means on the ground.</p>
        <div class="rose-legend">
          ${LOAD_NAMES.map((n, i) => `<span class="rose-key"><span class="scale-dot sev-${i}"></span>${n}</span>`).join('')}
        </div>
      </div>
    </div>` : ''}

    ${rule('Quick access')}
    <a class="card tappable" href="#/report"><div class="row">${icon('report', 'icon accent')}
      <div class="grow"><h3>Full conditions report</h3><div class="sub">Danger by elevation band, hazards, travel advice</div></div>
      ${icon('chevR', 'icon chev')}</div></a>
    <a class="card tappable" href="#/observe"><div class="row">${icon('binoculars', 'icon accent')}
      <div class="grow"><h3>Report an observation</h3><div class="sub">What did you see out there today?</div></div>
      ${icon('chevR', 'icon chev')}</div></a>
    <a class="card tappable" href="#/safety"><div class="row">${icon('cross', 'icon accent')}
      <div class="grow"><h3>Emergency &amp; trip safety</h3><div class="sub">000 · companion rescue · trip intentions</div></div>
      ${icon('chevR', 'icon chev')}</div></a>`;
}

function bandSection(name, elev, band) {
  return `
    <div class="band">
      <div class="band-name">${esc(name)}</div>
      <div class="band-elev">${esc(elev)}</div>
      ${hazardChips(band.dangers)}
      <div class="card"><ul class="advice">
        ${band.travel.map((t) => `<li>${esc(t)}</li>`).join('')}
      </ul></div>
    </div>`;
}

function viewReport() {
  const rep = currentReport();
  const tab = store.reportTab;
  const region = REGIONS.find((r) => r.id === store.region);
  let body = '';
  if (tab === 'danger') {
    body = `
      <div class="card rating-card">
        ${splitTriangle({ alpine: DAY_SCORES[rep.bands.alpine.score].color, subalpine: DAY_SCORES[rep.bands.subalpine.score].color }, 'lg')}
        <div class="rating-bands">
          <div class="rating-band"><span class="rb-label">Alpine</span>${scoreBanner(rep.bands.alpine.score)}</div>
          <div class="rating-band"><span class="rb-label">Subalpine</span>${scoreBanner(rep.bands.subalpine.score)}</div>
        </div>
        <p class="rating-note">MSC rates a broad picture of mountain hazards — exposure, visibility, surface and avalanche. The day score is an aggregate, not solely avalanche danger.</p>
      </div>`
      + bandSection('Alpine', 'Above treeline · ~1850 m+', rep.bands.alpine)
      + bandSection('Subalpine', 'Below treeline', rep.bands.subalpine);
  } else if (tab === 'hazards') {
    body = (rep.hazards || []).map(hazardCard).join('')
      + rule('Hazard categories', 'Alpine band')
      + hazardChips(rep.bands.alpine.dangers);
  } else {
    body = `<div class="card article"><p>${esc(rep.details)}</p></div>
      ${rule('Regional outlook', 'Synopsis')}
      <div class="card article"><p>${esc(rep.synopsis)}</p></div>`;
  }
  return `
    ${regionToggle()}
    <h1>Conditions report<span class="h1-sub">${esc(region.name)} · ${esc(region.area)}</span></h1>
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      ${statusBadge(rep)}
      <span class="note" style="margin:0">Issued ${esc(rep.issued)} · Confidence ${esc(rep.confidence)}</span>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" data-rtab="danger" aria-selected="${tab === 'danger'}">Danger rating</button>
      <button role="tab" data-rtab="hazards" aria-selected="${tab === 'hazards'}">Hazards</button>
      <button role="tab" data-rtab="details" aria-selected="${tab === 'details'}">Details</button>
    </div>
    ${body}
    ${Store.role() === 'forecaster' ? `<a class="btn secondary" href="#/edit">Edit this forecast</a>` : ''}
    <a class="card tappable" href="#/archive" style="margin-top:12px"><div class="row">${icon('clock', 'icon accent')}
      <div class="grow"><h3>Recent forecasts</h3><div class="sub">${Store.hasRole('member') ? 'Browse past reports from the MSC archive' : 'Member feature — sign in to browse the archive'}</div></div>
      ${icon('chevR', 'icon chev')}</div></a>
    <p class="note">Modelled on the MSC report format. Always read the real report before travelling: reports.mountainsafetycollective.org</p>`;
}

// ---------- archive: recent forecasts (member tier and above) ----------
const archive = { date: null, data: null, loading: false, error: null };

async function fetchArchive(date) {
  archive.date = date; archive.data = null; archive.error = null; archive.loading = true;
  render();
  try {
    const res = await fetch('https://api.mountainsafetycollective.org/report/get_view_data_by_date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
      signal: AbortSignal.timeout(8000)
    });
    const json = res.ok ? await res.json() : null;
    if (json?.status === 1 && Array.isArray(json.reports) && json.reports.length) {
      const mapped = {};
      for (const rep of json.reports) {
        const id = liveRegionId(rep?.report?.region);
        if (id) mapped[id] = mapLiveReport(rep);
      }
      archive.data = mapped;
    } else {
      archive.error = 'No report was published for that date.';
    }
  } catch {
    archive.error = 'Could not reach the MSC report service — check your connection.';
  }
  archive.loading = false;
  render();
}

function viewArchive() {
  if (!Store.hasRole('member')) {
    return `<h1>Recent forecasts<span class="h1-sub">A member feature</span></h1>
      <div class="card"><h3>Learn from the pattern, not just the day</h3>
      <p class="sub" style="margin-top:6px">Members can browse past daily reports to see how the season's snowpack story developed. Sign in with a member, observer or forecaster account.</p></div>
      <a class="btn" href="#/account">Sign in</a>`;
  }
  const rep = archive.data?.[store.region];
  return `
    ${regionToggle()}
    <h1>Recent forecasts<span class="h1-sub">Browse the archive — reports load live from MSC</span></h1>
    <div class="card">
      <label for="arch-date">Report date</label>
      <input id="arch-date" type="date" value="${esc(archive.date || sydneyDate(1))}" max="${esc(sydneyDate(0))}">
      <button class="btn" id="arch-load">Load report</button>
    </div>
    ${archive.loading ? `<div class="card"><p class="sub">Loading report…</p></div>` : ''}
    ${archive.error ? `<div class="card"><p class="sub" role="alert">${esc(archive.error)}</p></div>` : ''}
    ${rep ? `
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <span class="badge live"><span class="dot"></span>MSC archive</span>
        <span class="note" style="margin:0">Issued ${esc(rep.issued)} · ${esc(rep.preparedBy)} · Confidence ${esc(rep.confidence)}</span>
      </div>
      <div class="card rating-card">
        ${splitTriangle({ alpine: DAY_SCORES[rep.bands.alpine.score].color, subalpine: DAY_SCORES[rep.bands.subalpine.score].color }, 'lg')}
        <div class="rating-bands">
          <div class="rating-band"><span class="rb-label">Alpine</span>${scoreBanner(rep.bands.alpine.score)}</div>
          <div class="rating-band"><span class="rb-label">Subalpine</span>${scoreBanner(rep.bands.subalpine.score)}</div>
        </div>
      </div>
      ${rule('Regional outlook', esc(archive.date || ''))}
      <div class="card article"><p>${esc(rep.synopsis)}</p></div>
      ${(rep.hazards || []).map(hazardCard).join('')}
    ` : (!archive.loading && !archive.error ? `<p class="lede">Pick a date to load that day's report.</p>` : '')}`;
}

// ---------- account, forecast editor ----------
function viewAccount() {
  const s = Store.session();
  if (!s) {
    return `
      <h1>Account<span class="h1-sub">Forecasters and observers sign in here</span></h1>
      <form id="login-form" class="card">
        <label for="lg-user">Username</label>
        <input id="lg-user" name="user" autocomplete="username" autocapitalize="none" placeholder="forecaster or observer">
        <label for="lg-pin">PIN</label>
        <input id="lg-pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="4 digits">
        <p class="note" id="login-err" role="alert" hidden>That username and PIN don’t match. Demo logins are listed below.</p>
        <button class="btn" type="submit">Sign in</button>
      </form>
      <div class="card">
        <h3>Demo accounts</h3>
        <div class="sub" style="margin-top:6px">
          <strong>forecaster</strong> / PIN 2626 — build and publish forecasts, customise the app<br>
          <strong>observer</strong> / PIN 1850 — field observations, snow profiles, archive access<br>
          <strong>member</strong> / PIN 0000 — recent-forecast archive and member content<br>
          No login (base tier) — today's report, learning content and safety tools
        </div>
      </div>
      <p class="note">This build stores accounts and data on this device only. Multi-user sync needs the hosted backend (next step on the roadmap).</p>`;
  }

  const c = Store.custom();
  const forecaster = s.role === 'forecaster';
  return `
    <h1>${esc(s.name)}<span class="h1-sub">Signed in as ${esc(s.user)} · role: ${esc(s.role)}</span></h1>
    ${forecaster ? `
    <a class="card tappable" href="#/edit"><div class="row">${icon('report', 'icon accent')}
      <div class="grow"><h3>Edit forecast</h3><div class="sub">Update day scores, hazards text and travel advice — publishes with a forecaster badge</div></div>
      ${icon('chevR', 'icon chev')}</div></a>
    ${rule('App customisation', 'Forecaster admin')}
    <form id="custom-form" class="card">
      <label>Today-screen modules</label>
      <div class="check-row"><input type="checkbox" id="cm-charts" ${c.modules.charts ? 'checked' : ''}><label for="cm-charts" class="inline">Weather trend charts</label></div>
      <div class="check-row"><input type="checkbox" id="cm-rose" ${c.modules.rose ? 'checked' : ''}><label for="cm-rose" class="inline">Wind-loading rose</label></div>
      <label for="cm-accent" style="margin-top:14px">Highlight colour</label>
      <select id="cm-accent">
        <option value="red" ${c.accent === 'red' ? 'selected' : ''}>MSC red</option>
        <option value="orange" ${c.accent === 'orange' ? 'selected' : ''}>MSC orange</option>
      </select>
      <button class="btn" type="submit">Save customisation</button>
    </form>
    <button class="btn secondary" id="clear-override">Revert forecast to baseline</button>
    ${rule('User management', `${Store.allUsers().length} accounts`)}
    <div class="card">
      ${Store.allUsers().map((u) => `
        <div class="row user-row">
          <div class="grow"><strong>${esc(u.name)}</strong>
            <div class="sub">${esc(u.user)} · ${esc(u.role)}${u.seeded ? ' · built-in demo' : ''}</div></div>
          ${u.seeded ? '' : `<button class="mini-btn danger" data-del-user="${esc(u.user)}">Remove</button>`}
        </div>`).join('')}
    </div>
    <form id="adduser-form" class="card">
      <h3>Add account</h3>
      <div class="ed-grid">
        <div><label for="au-name">Full name</label><input id="au-name" name="name" maxlength="60" required></div>
        <div><label for="au-user">Username</label><input id="au-user" name="user" maxlength="40" autocapitalize="none" required></div>
        <div><label for="au-pin">PIN (4–8 digits)</label><input id="au-pin" name="pin" inputmode="numeric" maxlength="8" required></div>
        <div><label for="au-role">Access tier</label>
          <select id="au-role" name="role">
            <option value="member">Member</option>
            <option value="observer">Observer</option>
            <option value="forecaster">Forecaster</option>
          </select></div>
      </div>
      <p class="note" id="au-err" role="alert" hidden></p>
      <button class="btn" type="submit">Create account</button>
    </form>
    ${rule('Migration', 'To a hosted backend')}
    <div class="card">
      <p class="sub">Credentials are stored as salted SHA-256 hashes — never plaintext. The export bundle carries those hash records plus observations, forecast updates and settings; a hosted backend imports it and verifies users with the same scheme on first login, then re-hashes to its own. That's the standard staged auth migration, ready to run when the backend lands.</p>
      <button class="btn secondary" id="export-btn">Export migration bundle (JSON)</button>
      <label for="import-file" style="margin-top:14px">Import bundle</label>
      <input id="import-file" type="file" accept="application/json">
      <p class="note" id="import-msg" hidden></p>
    </div>` : ''}
    ${s.role === 'observer' ? `
    <a class="card tappable" href="#/observe"><div class="row">${icon('binoculars', 'icon accent')}
      <div class="grow"><h3>Record field data</h3><div class="sub">Snow profiles, stability tests and observations — CAA-style conventions</div></div>
      ${icon('chevR', 'icon chev')}</div></a>` : ''}
    <button class="btn secondary" id="logout-btn">Sign out</button>
    ${rule('Your data', 'This device')}
    <div class="card">
      <p class="sub">Everything this app stores — session, saved snow profiles, forecast updates and settings — lives on this device only. You can erase all of it in one tap.</p>
      <button class="btn secondary danger-btn" id="wipe-btn">Delete all my data</button>
    </div>`;
}

const SCORE_OPTS = Object.keys(DAY_SCORES);
function levelSelect(id, cat, current) {
  return `<select id="${id}" data-cat="${cat}">
    ${HAZARD_LEVELS[cat].map((l) => `<option ${l === current ? 'selected' : ''}>${l}</option>`).join('')}
  </select>`;
}

function viewEdit() {
  if (Store.role() !== 'forecaster') {
    return `<h1>Forecast editor</h1><div class="card"><p>Sign in with a forecaster account to edit the forecast.</p></div>
      <a class="btn" href="#/account">Go to sign in</a>`;
  }
  const rep = currentReport();
  const region = REGIONS.find((r) => r.id === store.region);
  const bandEditor = (b) => `
    ${rule(b === 'alpine' ? 'Alpine band' : 'Subalpine band', 'Score + categories')}
    <div class="card">
      <label for="ed-${b}-score">Band day score</label>
      <select id="ed-${b}-score">
        ${SCORE_OPTS.map((k) => `<option value="${k}" ${rep.bands[b].score === k ? 'selected' : ''}>${DAY_SCORES[k].label}</option>`).join('')}
      </select>
      <div class="ed-grid">
        ${Object.keys(HAZARD_CATEGORIES).map((cat) => `
          <div><label for="ed-${b}-${cat}">${HAZARD_CATEGORIES[cat].label}</label>
          ${levelSelect(`ed-${b}-${cat}`, cat, rep.bands[b].dangers[cat])}</div>`).join('')}
      </div>
      <label for="ed-${b}-travel">Travel &amp; terrain advice (one point per line)</label>
      <textarea id="ed-${b}-travel">${esc(rep.bands[b].travel.join('\n'))}</textarea>
    </div>`;
  return `
    ${regionToggle()}
    <h1>Forecast editor<span class="h1-sub">${esc(region.name)} — publishes on this device with a forecaster badge</span></h1>
    <form id="edit-form">
      <div class="card">
        <label for="ed-score">Overall day score</label>
        <select id="ed-score">${SCORE_OPTS.map((k) => `<option value="${k}" ${rep.dayScore === k ? 'selected' : ''}>${DAY_SCORES[k].label}</option>`).join('')}</select>
        <label for="ed-conf">Confidence</label>
        <select id="ed-conf">${['Strong', 'Moderate', 'Low'].map((x) => `<option ${rep.confidence === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <label for="ed-syn">Regional outlook synopsis</label>
        <textarea id="ed-syn">${esc(rep.synopsis)}</textarea>
      </div>
      ${bandEditor('alpine')}
      ${bandEditor('subalpine')}
      <button class="btn" type="submit">Publish update</button>
      <p class="note">Publishing stores the update on this device and flags every report view with a “Forecaster update” badge and your name. Hosted multi-user publishing is the backend roadmap step.</p>
    </form>`;
}

// ---------- observer field data (CAA-style conventions) ----------
const HAND_HARDNESS = ['F', '4F', '1F', 'P', 'K', 'I'];
const GRAIN_FORMS = ['PP new snow', 'DF decomposing', 'RG rounds', 'FC facets', 'DH depth hoar', 'SH surface hoar', 'MF melt forms', 'MFcr melt-freeze crust', 'IF ice'];
const TEST_TYPES = ['CT compression', 'ECT extended column', 'PST propagation saw', 'Hand shear'];

function obsFormRowLayer(i) {
  return `<div class="layer-row" data-layer="${i}">
    <input type="number" placeholder="Top cm" aria-label="Layer top depth cm" class="lr-top">
    <select class="lr-hard" aria-label="Hand hardness">${HAND_HARDNESS.map((h) => `<option>${h}</option>`).join('')}</select>
    <select class="lr-grain" aria-label="Grain form">${GRAIN_FORMS.map((g) => `<option>${g}</option>`).join('')}</select>
    <input type="number" step="0.5" placeholder="mm" aria-label="Grain size mm" class="lr-size">
  </div>`;
}

function viewObserve() {
  const s = Store.session();
  const isObserver = s && (s.role === 'observer' || s.role === 'forecaster');
  const saved = Store.observations();
  const draft = JSON.parse(localStorage.getItem('msc.obsDraft') || '{}');

  const publicBlock = `
    <a class="card tappable" href="https://forms.gle/CXabbENhVmuLfdga6" target="_blank" rel="noopener">
      <div class="row">${icon('send', 'icon accent')}
      <div class="grow"><h3>Submit to MSC</h3><div class="sub">Official public observation form (opens in browser)</div></div>
      ${icon('external', 'icon chev')}</div></a>`;

  if (!isObserver) {
    return `
      <h1>Observations</h1>
      <p class="lede">Field observations from the public make the forecasts better. Submit to MSC, or draft one here first.</p>
      ${publicBlock}
      <a class="card tappable" href="#/account"><div class="row">${icon('book', 'icon accent')}
        <div class="grow"><h3>Observer sign-in</h3><div class="sub">Trained observers: sign in for the full snow-profile toolkit</div></div>
        ${icon('chevR', 'icon chev')}</div></a>
      ${rule('Draft an observation', 'Saved on device')}
      <form id="obs-form" class="card">
        <label for="obs-where">Location</label>
        <input id="obs-where" name="where" placeholder="e.g. Etheridge Ridge, above Basin T-Bar" value="${esc(draft.where)}" autocomplete="off">
        <label for="obs-when">Date &amp; time</label>
        <input id="obs-when" name="when" type="datetime-local" value="${esc(draft.when)}">
        <label for="obs-type">What did you observe?</label>
        <select id="obs-type" name="type">
          ${['Avalanche activity', 'Cracking / whumpfing', 'Wind loading', 'Surface conditions (ice/crust)', 'Cornice', 'Weather / visibility', 'Wildlife / other']
            .map((o) => `<option ${draft.type === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
        <label for="obs-notes">Notes</label>
        <textarea id="obs-notes" name="notes" placeholder="Aspect, elevation, size, what made you notice it…">${esc(draft.notes)}</textarea>
        <button class="btn" type="submit">${icon('send', 'icon')} Share draft</button>
      </form>`;
  }

  return `
    <h1>Field data<span class="h1-sub">Signed in: ${esc(s.name)} · profiles save on this device</span></h1>
    ${publicBlock}
    ${rule('Snow profile', 'CAA-style conventions')}
    <form id="profile-form" class="card">
      <div class="ed-grid">
        <div class="span2"><label for="pf-loc">Location</label><input id="pf-loc" placeholder="Feature / ridgeline" required></div>
        <div class="span2"><label for="pf-when">Date &amp; time</label><input id="pf-when" type="datetime-local"></div>
        <div><label for="pf-aspect">Aspect</label>
          <select id="pf-aspect">${ASPECT_ORDER.map((a) => `<option>${a}</option>`).join('')}</select></div>
        <div><label for="pf-elev">Elevation (m)</label><input id="pf-elev" type="number" inputmode="numeric" placeholder="1850"></div>
        <div><label for="pf-angle">Slope angle (°)</label><input id="pf-angle" type="number" inputmode="numeric" placeholder="32"></div>
        <div><label for="pf-hs">HS — total depth (cm)</label><input id="pf-hs" type="number" inputmode="numeric" placeholder="145"></div>
        <div><label for="pf-airt">Air temp (°C)</label><input id="pf-airt" type="number" step="0.5" placeholder="-4"></div>
        <div><label for="pf-sky">Sky</label>
          <select id="pf-sky">${['CLR clear', 'FEW few clouds', 'SCT scattered', 'BKN broken', 'OVC overcast', 'X obscured'].map((x) => `<option>${x}</option>`).join('')}</select></div>
      </div>

      <label style="margin-top:16px">Layers — top depth · hand hardness · grain form · size</label>
      <div id="layers">${obsFormRowLayer(0)}</div>
      <button type="button" class="add-row" id="add-layer">+ Add layer</button>

      <label style="margin-top:16px">Snow temperatures — depth (cm) · temp (°C)</label>
      <div id="temps"><div class="temp-row"><input type="number" placeholder="Depth cm" aria-label="Temperature depth"><input type="number" step="0.5" placeholder="°C" aria-label="Snow temperature"></div></div>
      <button type="button" class="add-row" id="add-temp">+ Add temperature</button>

      <label style="margin-top:16px">Density (optional) — depth (cm) · kg/m³</label>
      <div class="temp-row"><input id="pf-dens-depth" type="number" placeholder="Depth cm"><input id="pf-dens" type="number" placeholder="kg/m³"></div>

      <label style="margin-top:16px">Stability test</label>
      <div class="ed-grid">
        <div><label for="pf-test" class="tiny">Type</label>
          <select id="pf-test">${TEST_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div><label for="pf-score" class="tiny">Result (e.g. CT13, ECTP15)</label><input id="pf-score" placeholder="ECTP15"></div>
        <div><label for="pf-shear" class="tiny">Shear quality</label>
          <select id="pf-shear">${['Q1 clean/fast', 'Q2 average', 'Q3 rough'].map((q) => `<option>${q}</option>`).join('')}</select></div>
        <div><label for="pf-faildepth" class="tiny">Failure depth (cm)</label><input id="pf-faildepth" type="number" placeholder="35"></div>
      </div>

      <label for="pf-notes" style="margin-top:16px">Comments</label>
      <textarea id="pf-notes" placeholder="Cracking, whumpfing, recent avalanches, wind effect…"></textarea>
      <button class="btn" type="submit">Save profile</button>
    </form>

    ${saved.length ? rule('Saved profiles', `${saved.length} on device`) : ''}
    ${saved.map((o) => `
      <div class="card obs-saved">
        <div class="row"><div class="grow">
          <h3>${esc(o.loc)} · ${esc(o.aspect)} · ${esc(o.elev)} m</h3>
          <div class="sub">${esc(o.when || '')} · HS ${esc(o.hs || '?')} cm · ${esc(o.test)} ${esc(o.score)} (${esc(o.shear)})</div>
          <div class="sub">${o.layers.map((l) => `${esc(l.top)}cm ${esc(l.hard)} ${esc(String(l.grain).split(' ')[0])} ${esc(l.size)}mm`).join(' · ')}</div>
        </div></div>
        <div class="obs-actions">
          <button class="mini-btn" data-share-obs="${o.id}">Share</button>
          <button class="mini-btn danger" data-del-obs="${o.id}">Delete</button>
        </div>
      </div>`).join('')}`;
}

function viewLearn(topicId) {
  if (topicId) {
    const t = LEARN_TOPICS.find((x) => x.id === topicId);
    if (t) {
      return `<button class="back-btn" data-nav="#/learn">${icon('chevL', 'icon')} Learn</button>
        <h1>${esc(t.title)}</h1>
        <div class="card article">${t.body.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
    }
  }
  return `
    <h1>Learn</h1>
    <p class="lede">Hazard knowledge for the Australian Alps — how the ratings work and the habits that keep you alive.</p>
    ${LEARN_TOPICS.map((t) => `
      <a class="card tappable" href="#/learn/${t.id}"><div class="row">
        ${icon('book', 'icon accent')}
        <div class="grow"><h3>${esc(t.title)}</h3><div class="sub">${esc(t.summary)}</div></div>
        ${icon('chevR', 'icon chev')}</div></a>`).join('')}`;
}

function viewSafety() {
  return `
    <h1>Emergency &amp; safety</h1>
    <a class="emergency-cta" href="tel:000">
      ${icon('phone', 'icon')}
      <div><div class="big">Call 000 — ask for Police</div>
      <div class="sub2">Police coordinate alpine search &amp; rescue. 112 also works from any mobile.</div></div>
    </a>
    <div class="card">
      <h3>If you’re calling for rescue</h3>
      <ul class="advice">
        <li>Location first: nearest named feature, then grid reference or coordinates from your phone/GPS.</li>
        <li>Number of people, injuries, and shelter status.</li>
        <li>Battery status and a time you’ll call back. Then keep the phone warm and dry.</li>
        <li>If you have a PLB and it’s serious: activate it. That’s what it’s for.</li>
      </ul>
    </div>

    ${rule('Companion rescue', 'Avalanche burial')}
    <div class="card">
      ${RESCUE_STEPS.map((s, i) => `<div class="step"><div class="num">${i + 1}</div>
        <div><h4>${esc(s.title)}</h4><p>${esc(s.body)}</p></div></div>`).join('')}
    </div>

    ${rule('Before you go', 'Trip intentions')}
    ${SAFETY_LINKS.tripIntention.map((l) => `
      <a class="card tappable" href="${esc(l.url)}" target="_blank" rel="noopener"><div class="row">
        ${icon('send', 'icon accent')}
        <div class="grow"><h3>${esc(l.label)}</h3><div class="sub">Tell someone where you’re going</div></div>
        ${icon('external', 'icon chev')}</div></a>`).join('')}

    ${rule('MSC links', 'mountainsafetycollective.org')}
    ${SAFETY_LINKS.msc.map((l) => `
      <a class="card tappable" href="${esc(l.url)}" target="_blank" rel="noopener"><div class="row">
        ${icon('mountain', 'icon accent')}
        <div class="grow"><h3>${esc(l.label)}</h3></div>
        ${icon('external', 'icon chev')}</div></a>`).join('')}
    ${rule('About this app')}
    <div class="card">
      <p class="sub">An independent companion app for Mountain Safety Collective's Backcountry Conditions Reports, built as a concept by Zac Reid. Not an official MSC product. All safety content is general guidance — formal training (AST1) is the real thing.</p>
      <p class="sub" style="margin-top:8px">MSC is a not-for-profit keeping Australian backcountry travellers alive. If this app is useful, join: mountainsafetycollective.org/membership</p>
    </div>`;
}

// ---------- router ----------
const TABS = [
  { path: '#/today',   label: 'Today',   icon: 'mountain',   render: viewToday },
  { path: '#/report',  label: 'Report',  icon: 'report',     render: viewReport },
  { path: '#/observe', label: 'Observe', icon: 'binoculars', render: viewObserve },
  { path: '#/learn',   label: 'Learn',   icon: 'book',       render: viewLearn },
  { path: '#/safety',  label: 'Safety',  icon: 'cross',      render: viewSafety }
];

const EXTRA_VIEWS = { '#/account': viewAccount, '#/edit': viewEdit, '#/archive': viewArchive };

function render() {
  const hash = location.hash || '#/today';
  const [, seg1, seg2] = hash.split('/'); // '#/learn/topic' → ['#','learn','topic']
  const base = '#/' + (seg1 || 'today');
  const extra = EXTRA_VIEWS[base];
  const tab = TABS.find((t) => t.path === base) || (extra ? null : TABS[0]);

  $('#view').innerHTML = `<div class="view">${(extra || tab.render)(seg2)}</div>`;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (tab && a.getAttribute('href') === tab.path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  bindView();
}

function bindView() {
  document.querySelectorAll('[data-region]').forEach((b) =>
    b.addEventListener('click', () => { store.region = b.dataset.region; render(); }));
  document.querySelectorAll('[data-rtab]').forEach((b) =>
    b.addEventListener('click', () => { store.reportTab = b.dataset.rtab; render(); }));
  document.querySelectorAll('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = b.dataset.nav; }));

  const rep = currentReport();
  document.querySelectorAll('[data-hazard]').forEach((b) =>
    b.addEventListener('click', () => openSheet(hazardSheet(b.dataset.hazard, rep))));
  document.querySelectorAll('[data-aspect]').forEach((s) => {
    const open = () => openSheet(aspectSheet(s.dataset.aspect, rep.aspects.alpine[s.dataset.aspect] ?? 0));
    s.addEventListener('click', open);
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });

  // hazard-card About toggles
  document.querySelectorAll('[data-about]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = document.getElementById('about-' + b.dataset.about);
      const open = t.hasAttribute('hidden');
      if (open) t.removeAttribute('hidden'); else t.setAttribute('hidden', '');
      b.setAttribute('aria-expanded', String(open));
      b.textContent = open ? 'About –' : 'About +';
    }));

  // archive loader
  const al = $('#arch-load');
  if (al) al.addEventListener('click', () => {
    const d = $('#arch-date').value;
    if (d) fetchArchive(d);
  });

  // login / logout / customisation
  const lf = $('#login-form');
  if (lf) lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = lf.querySelector('.btn');
    btn.disabled = true;
    const d = Object.fromEntries(new FormData(lf).entries());
    const ok = await Store.login(d.user || '', d.pin || '');
    btn.disabled = false;
    if (ok) render();
    else $('#login-err').removeAttribute('hidden');
  });
  const lo = $('#logout-btn');
  if (lo) lo.addEventListener('click', () => { Store.logout(); render(); });
  const wipe = $('#wipe-btn');
  if (wipe) wipe.addEventListener('click', () => {
    if (confirm('Delete all app data stored on this device? This clears your session, saved profiles, forecast updates and settings.')) {
      localStorage.clear();
      applyTheme(); applyCustom(); render();
    }
  });
  const cf = $('#custom-form');
  if (cf) cf.addEventListener('submit', (e) => {
    e.preventDefault();
    Store.setCustom({
      modules: { charts: $('#cm-charts').checked, rose: $('#cm-rose').checked },
      accent: $('#cm-accent').value
    });
    applyCustom();
    render();
  });
  const co = $('#clear-override');
  if (co) co.addEventListener('click', () => { Store.clearOverride(store.region); render(); });

  // user management (forecaster/admin)
  const auf = $('#adduser-form');
  if (auf) auf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(auf).entries());
    const res = await Store.addUser(d);
    if (res.error) {
      const err = $('#au-err'); err.textContent = res.error; err.removeAttribute('hidden');
    } else render();
  });
  document.querySelectorAll('[data-del-user]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm(`Remove account "${b.dataset.delUser}"?`)) { Store.removeUser(b.dataset.delUser); render(); }
    }));
  const ex = $('#export-btn');
  if (ex) ex.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Store.exportBundle(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'msc-app-migration.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  const imf = $('#import-file');
  if (imf) imf.addEventListener('change', async () => {
    const f = imf.files?.[0];
    if (!f || f.size > 2_000_000) return;
    try {
      const res = Store.importBundle(JSON.parse(await f.text()));
      const msg = $('#import-msg');
      msg.textContent = res.error || `Imported ${res.users} account(s).`;
      msg.removeAttribute('hidden');
      if (!res.error) setTimeout(render, 900);
    } catch { const msg = $('#import-msg'); msg.textContent = 'Could not read that file as JSON.'; msg.removeAttribute('hidden'); }
  });

  // forecast editor
  const ef = $('#edit-form');
  if (ef) ef.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = Store.session();
    const band = (b) => ({
      score: $(`#ed-${b}-score`).value,
      dangers: Object.fromEntries(Object.keys(HAZARD_CATEGORIES).map((cat) => [cat, $(`#ed-${b}-${cat}`).value])),
      travel: $(`#ed-${b}-travel`).value.split('\n').map((x) => x.trim()).filter(Boolean)
    });
    Store.setOverride(store.region, {
      dayScore: $('#ed-score').value,
      confidence: $('#ed-conf').value,
      synopsis: $('#ed-syn').value,
      bands: { alpine: band('alpine'), subalpine: band('subalpine') },
      preparedBy: s.name,
      issued: new Date().toLocaleString('en-AU', { hour12: false }).slice(0, 17) + ' AEST',
      updated: { by: s.name, at: Date.now() }
    });
    location.hash = '#/report';
  });

  // observer profile form
  const pf = $('#profile-form');
  if (pf) {
    $('#add-layer').addEventListener('click', () => {
      $('#layers').insertAdjacentHTML('beforeend', obsFormRowLayer(document.querySelectorAll('.layer-row').length));
    });
    $('#add-temp').addEventListener('click', () => {
      $('#temps').insertAdjacentHTML('beforeend',
        '<div class="temp-row"><input type="number" placeholder="Depth cm" aria-label="Temperature depth"><input type="number" step="0.5" placeholder="°C" aria-label="Snow temperature"></div>');
    });
    pf.addEventListener('submit', (e) => {
      e.preventDefault();
      const layers = [...document.querySelectorAll('.layer-row')].map((r) => ({
        top: r.querySelector('.lr-top').value, hard: r.querySelector('.lr-hard').value,
        grain: r.querySelector('.lr-grain').value, size: r.querySelector('.lr-size').value
      })).filter((l) => l.top !== '');
      const temps = [...document.querySelectorAll('#temps .temp-row')].map((r) => {
        const [d, t] = r.querySelectorAll('input');
        return { depth: d.value, temp: t.value };
      }).filter((t) => t.depth !== '');
      Store.saveObservation({
        loc: $('#pf-loc').value, when: $('#pf-when').value, aspect: $('#pf-aspect').value,
        elev: $('#pf-elev').value, angle: $('#pf-angle').value, hs: $('#pf-hs').value,
        airT: $('#pf-airt').value, sky: $('#pf-sky').value,
        layers, temps,
        density: { depth: $('#pf-dens-depth').value, val: $('#pf-dens').value },
        test: $('#pf-test').value.split(' ')[0], score: $('#pf-score').value,
        shear: $('#pf-shear').value.split(' ')[0], failDepth: $('#pf-faildepth').value,
        notes: $('#pf-notes').value
      });
      render();
    });
  }
  document.querySelectorAll('[data-del-obs]').forEach((b) =>
    b.addEventListener('click', () => { Store.deleteObservation(b.dataset.delObs); render(); }));
  document.querySelectorAll('[data-share-obs]').forEach((b) =>
    b.addEventListener('click', async () => {
      const o = Store.observations().find((x) => x.id === b.dataset.shareObs);
      if (!o) return;
      const text = [
        `SNOW PROFILE — ${o.loc}`,
        `${o.when} · ${o.aspect} aspect · ${o.elev} m · ${o.angle}° · HS ${o.hs} cm`,
        `Air ${o.airT}°C · Sky ${o.sky}`,
        `Layers: ${o.layers.map((l) => `${l.top}cm ${l.hard} ${String(l.grain).split(' ')[0]} ${l.size}mm`).join(' | ')}`,
        `Temps: ${o.temps.map((t) => `${t.depth}cm ${t.temp}°C`).join(' | ')}`,
        o.density.val ? `Density: ${o.density.val} kg/m³ @ ${o.density.depth}cm` : '',
        `Test: ${o.test} ${o.score} ${o.shear}${o.failDepth ? ` @ ${o.failDepth}cm` : ''}`,
        o.notes ? `Notes: ${o.notes}` : ''
      ].filter(Boolean).join('\n');
      if (navigator.share) { try { await navigator.share({ title: 'Snow profile', text }); } catch { /* cancelled */ } }
      else location.href = 'mailto:?subject=' + encodeURIComponent('Snow profile — ' + o.loc) + '&body=' + encodeURIComponent(text);
    }));

  const form = $('#obs-form');
  if (form) {
    const save = () => {
      const d = Object.fromEntries(new FormData(form).entries());
      localStorage.setItem('msc.obsDraft', JSON.stringify(d));
    };
    form.addEventListener('input', save);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      save();
      const d = Object.fromEntries(new FormData(form).entries());
      const text = `MSC field observation (draft)\nLocation: ${d.where || '-'}\nWhen: ${d.when || '-'}\nType: ${d.type || '-'}\nNotes: ${d.notes || '-'}`;
      if (navigator.share) {
        try { await navigator.share({ title: 'MSC observation', text }); } catch { /* user cancelled */ }
      } else {
        location.href = 'mailto:?subject=' + encodeURIComponent('MSC field observation') + '&body=' + encodeURIComponent(text);
      }
    });
  }
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', Store.theme());
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', Store.theme() === 'dark' ? '#0a1826' : '#ffffff');
  const tb = $('#theme-btn');
  if (tb) tb.setAttribute('aria-label', Store.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function applyCustom() {
  const c = Store.custom();
  document.documentElement.setAttribute('data-accent', c.accent || 'red');
}

function boot() {
  applyTheme();
  applyCustom();
  $('#tabbar').innerHTML = TABS.map((t) =>
    `<a href="${t.path}">${icon(t.icon)}<span>${t.label}</span></a>`).join('');
  $('#theme-btn').addEventListener('click', () => {
    Store.setTheme(Store.theme() === 'dark' ? 'light' : 'dark');
    applyTheme();
  });
  window.addEventListener('hashchange', render);
  render();
  tryLiveFetch();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* http/LAN — offline cache unavailable */ });
  }
}

document.addEventListener('DOMContentLoaded', boot);
