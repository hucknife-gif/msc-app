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
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  play:     '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5Z"/>',
  route:    '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5C11 13 7.5 9.5 12 7.5c2.6-1.2 4 .8 5.5-1"/>'
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
    <a class="card tappable" href="#/learn/videos"><div class="row">${icon('play', 'icon accent')}
      <div class="grow"><h3>Manage video library</h3><div class="sub">Add or remove YouTube videos in the Learn tab</div></div>
      ${icon('chevR', 'icon chev')}</div></a>
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

// article body blocks: plain string = paragraph; {h} = section heading;
// {list} = bullet list; {note} = callout; {fig, caption} = inline diagram
function learnBlock(b) {
  if (typeof b === 'string') return `<p>${esc(b)}</p>`;
  if (b.h) return `<h3 class="article-h">${esc(b.h)}</h3>`;
  if (b.list) return `<ul class="advice">${b.list.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  if (b.note) return `<div class="article-note">${esc(b.note)}</div>`;
  if (b.fig) {
    const svg = LEARN_FIGS[b.fig];
    return svg ? `<figure class="learn-fig">${svg}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>` : '';
  }
  return '';
}

function quizCard(t) {
  if (!t.quiz || !t.quiz.length) return '';
  return `${rule('Check yourself', `${t.quiz.length} questions`)}
    ${t.quiz.map((q, qi) => `
    <div class="card quiz" data-quiz="${qi}">
      <p class="quiz-q">${esc(q.q)}</p>
      ${q.options.map((o, oi) => `<button class="quiz-opt" data-q="${qi}" data-o="${oi}">${esc(o)}</button>`).join('')}
      <div class="quiz-why" hidden>${esc(q.why)}</div>
    </div>`).join('')}`;
}

// video library: MSC's YouTube channel, embedded on demand.
// IDs are validated (11-char YouTube form) before ever reaching an iframe src.
function viewVideos() {
  const vids = Store.allVideos();
  const admin = Store.role() === 'forecaster';
  return `<button class="back-btn" data-nav="#/learn">${icon('chevL', 'icon')} Learn</button>
    <h1>Video library<span class="h1-sub">From the MSC YouTube channel</span></h1>
    <p class="lede">Tap a video to play it here (needs reception), or open it in YouTube.</p>
    ${vids.map((v) => `
    <div class="card video-card">
      <div class="video-slot" id="vs-${esc(v.id)}">
        <button class="video-thumb" data-play="${esc(v.id)}" aria-label="Play: ${esc(v.title)}">
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy">
          <span class="video-play">${icon('play', 'icon')}</span>
        </button>
      </div>
      <h3 class="video-title">${esc(v.title)}</h3>
      ${v.note ? `<div class="sub">${esc(v.note)}</div>` : ''}
      <div class="row video-actions">
        <a class="mini-btn" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${esc(v.id)}">Watch on YouTube</a>
        ${admin && !v.seeded ? `<button class="mini-btn danger" data-del-video="${esc(v.id)}">Remove</button>` : ''}
      </div>
    </div>`).join('')}
    <a class="card tappable" target="_blank" rel="noopener" href="${MSC_YT_CHANNEL}"><div class="row">
      ${icon('external', 'icon accent')}
      <div class="grow"><h3>MSC on YouTube</h3><div class="sub">The full channel — @mountainsafetycollective</div></div>
      ${icon('chevR', 'icon chev')}</div></a>
    ${admin ? `
    <form id="addvideo-form" class="card">
      <h3>Add a video</h3>
      <p class="sub" style="margin-top:4px">Paste a YouTube link — it appears in every user’s library on this device build.</p>
      <label for="av-url">YouTube link or video ID</label>
      <input id="av-url" name="url" inputmode="url" autocapitalize="none" required>
      <label for="av-title">Title</label>
      <input id="av-title" name="title" maxlength="90" required>
      <label for="av-note">Note (optional)</label>
      <input id="av-note" name="note" maxlength="140">
      <p class="note" id="av-err" role="alert" hidden></p>
      <button class="btn" type="submit">Add to library</button>
    </form>` : ''}`;
}

function viewLearn(topicId) {
  if (topicId === 'videos') return viewVideos();
  if (topicId) {
    const t = LEARN_TOPICS.find((x) => x.id === topicId);
    if (t) {
      return `<button class="back-btn" data-nav="#/learn">${icon('chevL', 'icon')} Learn</button>
        <h1>${esc(t.title)}</h1>
        <div class="card article">${t.body.map(learnBlock).join('')}</div>
        ${quizCard(t)}
        ${t.sources ? `<p class="note">Drawn from: ${esc(t.sources)}</p>` : ''}`;
    }
  }
  const groups = [...new Set(LEARN_TOPICS.map((t) => t.group || 'Reference'))];
  return `
    <h1>Learn</h1>
    <p class="lede">Hazard knowledge for the Australian Alps — international avalanche practice, adapted to what actually kills people here.</p>
    ${groups.map((g) => `
      ${rule(g)}
      ${LEARN_TOPICS.filter((t) => (t.group || 'Reference') === g).map((t) => `
      <a class="card tappable" href="#/learn/${t.id}"><div class="row">
        ${icon(t.icon || 'book', 'icon accent')}
        <div class="grow"><h3>${esc(t.title)}</h3><div class="sub">${esc(t.summary)}</div></div>
        ${icon('chevR', 'icon chev')}</div></a>`).join('')}`).join('')}
    ${rule('Video library')}
    <a class="card tappable" href="#/learn/videos"><div class="row">
      ${icon('play', 'icon accent')}
      <div class="grow"><h3>MSC video library</h3><div class="sub">${Store.allVideos().length} videos from the MSC YouTube channel — watch in the app</div></div>
      ${icon('chevR', 'icon chev')}</div></a>`;
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

// ============================================================
// TOURS — GPS tracking, trip log, and on-device sharing feed.
// Tracks live via the Geolocation API (screen kept awake where
// supported), draws on OpenTopoMap tiles through vendored
// Leaflet, and stores tracks/photos in IndexedDB via Store.
// The "forum" is the same on-device multi-account model as the
// rest of the app — a hosted backend swaps in behind Store.
// ============================================================

const haversine = (a, b) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const fmtDist = (m) => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
const fmtDur = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0');
};

// map helper: topo base layer with attribution (CC-BY-SA / © OSM contributors)
function topoMap(el, opts = {}) {
  const map = L.map(el, { zoomControl: true, attributionControl: true, ...opts });
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 16,
    attribution: '© OpenStreetMap contributors, SRTM · © OpenTopoMap (CC-BY-SA)'
  }).addTo(map);
  return map;
}

// route polyline split into climb (accent) and descent (blue) segments
function drawRoute(map, points) {
  const segs = { up: [], down: [] };
  for (let i = 1; i < points.length; i++) {
    const d = (points[i][3] ?? 0) - (points[i - 1][3] ?? 0);
    segs[d >= 0 ? 'up' : 'down'].push([
      [points[i - 1][1], points[i - 1][2]],
      [points[i][1], points[i][2]]
    ]);
  }
  const up = L.polyline(segs.up.flat().length ? segs.up : [], { color: '#f15a24', weight: 4 }).addTo(map);
  const down = L.polyline(segs.down.flat().length ? segs.down : [], { color: '#29abe2', weight: 4 }).addTo(map);
  // draw as multi-segment lines
  up.setLatLngs(segs.up); down.setLatLngs(segs.down);
  if (points.length) {
    const latlngs = points.map((p) => [p[1], p[2]]);
    map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
  }
}

// ---------- live tracker engine ----------
const tracker = {
  status: 'idle', // idle | recording | paused
  watchId: null, timerId: null, wakeLock: null,
  startedAt: 0, pausedAccum: 0, pauseStarted: 0,
  points: [], obs: [], segsUp: [], segsDown: [],
  dist: 0, gain: 0, loss: 0, altBuffer: 0, maxAlt: -Infinity,
  map: null, lineUp: null, lineDown: null, marker: null,

  async start() {
    this.reset();
    this.status = 'recording';
    this.startedAt = Date.now();
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onFix(pos),
      () => { const el = $('#tt-gps'); if (el) el.textContent = 'GPS: no signal — check location permission'; },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    this.timerId = setInterval(() => this.tickClock(), 1000);
    try { this.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported */ }
    document.addEventListener('visibilitychange', tracker.rewake);
  },
  rewake() {
    if (document.visibilityState === 'visible' && tracker.status === 'recording') {
      navigator.wakeLock?.request('screen').then((w) => { tracker.wakeLock = w; }).catch(() => {});
    }
  },
  pause() {
    if (this.status !== 'recording') return;
    this.status = 'paused';
    this.pauseStarted = Date.now();
  },
  resume() {
    if (this.status !== 'paused') return;
    this.pausedAccum += Date.now() - this.pauseStarted;
    this.status = 'recording';
  },
  elapsedSec() {
    if (!this.startedAt) return 0;
    const pausedNow = this.status === 'paused' ? Date.now() - this.pauseStarted : 0;
    return Math.max(0, (Date.now() - this.startedAt - this.pausedAccum - pausedNow) / 1000);
  },
  onFix(pos) {
    if (this.status !== 'recording') return;
    const { latitude, longitude, altitude, accuracy } = pos.coords;
    if (accuracy > 60) return; // junk fix
    const t = Math.round((Date.now() - this.startedAt) / 1000);
    const p = [t, +latitude.toFixed(6), +longitude.toFixed(6), altitude == null ? null : Math.round(altitude)];
    const last = this.points[this.points.length - 1];
    if (last) {
      const d = haversine([last[1], last[2]], [p[1], p[2]]);
      if (d < 4 && t - last[0] < 10) return; // stationary jitter
      this.dist += d;
      // elevation with 3 m hysteresis so GPS noise doesn't count as climbing
      if (p[3] != null && last[3] != null) {
        this.altBuffer += p[3] - last[3];
        if (this.altBuffer >= 3) { this.gain += this.altBuffer; this.altBuffer = 0; }
        else if (this.altBuffer <= -3) { this.loss -= this.altBuffer; this.altBuffer = 0; }
      }
    }
    if (p[3] != null && p[3] > this.maxAlt) this.maxAlt = p[3];
    this.points.push(p);
    this.paint(p);
  },
  paint(p) {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#tt-dist', fmtDist(this.dist));
    set('#tt-gain', Math.round(this.gain) + ' m');
    set('#tt-loss', Math.round(this.loss) + ' m');
    set('#tt-alt', p[3] != null ? p[3] + ' m' : '—');
    set('#tt-gps', 'GPS: locked · ±' + this.points.length + ' pts');
    if (this.map) {
      const ll = [p[1], p[2]];
      const last = this.points[this.points.length - 2];
      if (last) {
        const up = (p[3] ?? 0) >= (last[3] ?? 0);
        const segs = up ? this.segsUp : this.segsDown;
        segs.push([[last[1], last[2]], ll]);
        const line = up ? this.lineUp : this.lineDown;
        if (line) line.setLatLngs(segs);
      }
      if (!this.marker) this.marker = L.circleMarker(ll, { radius: 7, color: '#ffffff', weight: 2, fillColor: '#ed1c24', fillOpacity: 1 }).addTo(this.map);
      else this.marker.setLatLng(ll);
      this.map.setView(ll, Math.max(this.map.getZoom(), 14));
    }
  },
  tickClock() {
    const el = $('#tt-time');
    if (el) el.textContent = fmtDur(this.elapsedSec());
  },
  addObs(text) {
    const body = String(text || '').trim().slice(0, 300);
    if (!body) return false;
    const last = this.points[this.points.length - 1];
    this.obs.push({ at: Date.now(), t: Math.round((Date.now() - this.startedAt) / 1000),
      lat: last?.[1] ?? null, lng: last?.[2] ?? null, alt: last?.[3] ?? null, text: body });
    return true;
  },
  async finish() {
    const s = Store.session();
    const durSec = Math.round(this.elapsedSec());
    const trip = {
      id: 'trip-' + this.startedAt,
      owner: s.user, ownerName: s.name,
      title: 'Tour ' + new Date(this.startedAt).toLocaleDateString('en-AU'),
      desc: '',
      started: this.startedAt, ended: Date.now(),
      points: this.points,
      stats: { dist: Math.round(this.dist), gain: Math.round(this.gain),
               loss: Math.round(this.loss), maxAlt: this.maxAlt === -Infinity ? null : this.maxAlt, durSec },
      photos: [], videoLinks: [], obs: this.obs,
      shared: false, likes: [], comments: []
    };
    await Store.saveTrip(trip);
    this.stop();
    tours.list = null; tours.trip = null;
    location.hash = '#/tours/' + trip.id;
    return trip.id;
  },
  stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    if (this.timerId) clearInterval(this.timerId);
    this.wakeLock?.release?.().catch?.(() => {});
    document.removeEventListener('visibilitychange', tracker.rewake);
    this.status = 'idle';
    this.map = null; this.lineUp = null; this.lineDown = null; this.marker = null;
  },
  reset() {
    this.stop();
    this.points = []; this.obs = []; this.segsUp = []; this.segsDown = [];
    this.dist = 0; this.gain = 0; this.loss = 0; this.altBuffer = 0; this.maxAlt = -Infinity;
    this.startedAt = 0; this.pausedAccum = 0; this.pauseStarted = 0;
  }
};

// ---------- elevation profile (distance vs altitude, up/down coloured) ----------
function elevProfile(points) {
  const pts = points.filter((p) => p[3] != null);
  if (pts.length < 2) return '<p class="sub">No elevation data recorded.</p>';
  let cum = 0;
  const xs = [0];
  for (let i = 1; i < pts.length; i++) {
    cum += haversine([pts[i - 1][1], pts[i - 1][2]], [pts[i][1], pts[i][2]]);
    xs.push(cum);
  }
  const alts = pts.map((p) => p[3]);
  const minA = Math.min(...alts), maxA = Math.max(...alts);
  const W = 340, H = 130, PX = 10, PY = 12;
  const sx = (d) => PX + (d / (cum || 1)) * (W - 2 * PX);
  const sy = (a) => H - PY - ((a - minA) / ((maxA - minA) || 1)) * (H - 2 * PY);
  let segsUp = '', segsDown = '';
  for (let i = 1; i < pts.length; i++) {
    const seg = `M${sx(xs[i - 1]).toFixed(1)} ${sy(alts[i - 1]).toFixed(1)} L${sx(xs[i]).toFixed(1)} ${sy(alts[i]).toFixed(1)}`;
    if (alts[i] >= alts[i - 1]) segsUp += seg; else segsDown += seg;
  }
  return `<svg class="elev-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile">
    <path d="${segsUp}" fill="none" stroke="#f15a24" stroke-width="2.5" stroke-linecap="round"/>
    <path d="${segsDown}" fill="none" stroke="#29abe2" stroke-width="2.5" stroke-linecap="round"/>
    <text x="${PX}" y="11" class="elev-lbl">${maxA} m</text>
    <text x="${PX}" y="${H - 2}" class="elev-lbl">${minA} m</text>
    <text x="${W - PX}" y="${H - 2}" class="elev-lbl" text-anchor="end">${fmtDist(cum)}</text>
  </svg>`;
}

// ---------- tours state + views ----------
const tours = { list: null, trip: null, photoUrls: {}, loadingList: false, loadingTrip: null };

async function loadTours() {
  if (tours.loadingList) return;
  tours.loadingList = true;
  tours.list = await Store.allTrips();
  tours.loadingList = false;
  render();
}

async function loadTrip(id) {
  if (tours.loadingTrip === id) return;
  tours.loadingTrip = id;
  const t = await Store.getTrip(id);
  if (t) {
    for (const mid of t.photos || []) {
      if (!tours.photoUrls[mid]) {
        const blob = await Store.getPhoto(mid);
        if (blob) tours.photoUrls[mid] = URL.createObjectURL(blob);
      }
    }
  }
  tours.trip = t || { missing: true, id };
  tours.loadingTrip = null;
  render();
}

const FEED_TABS = [
  { id: 'general', label: 'General' },
  { id: 'favs', label: 'Favourites' },
  { id: 'mine', label: 'My tours' }
];
function feedTab() { return sessionStorage.getItem('msc.feedTab') || 'general'; }

function tripCard(t, me) {
  const liked = me && (t.likes || []).includes(me);
  const fav = Store.favProfiles().includes(t.owner);
  return `
  <a class="card tappable trip-card" href="#/tours/${esc(t.id)}"><div class="row">
    <div class="grow">
      <h3>${esc(t.title)}</h3>
      <div class="sub">${esc(t.ownerName)} · ${esc(new Date(t.started).toLocaleDateString('en-AU'))}
        ${t.shared ? '' : ' · <strong>private</strong>'}${fav ? ' · ★' : ''}</div>
      <div class="trip-stats">
        <span>${fmtDist(t.stats.dist)}</span><span>↑ ${t.stats.gain} m</span>
        <span>↓ ${t.stats.loss} m</span><span>${fmtDur(t.stats.durSec)}</span>
      </div>
      <div class="sub">▲ ${(t.likes || []).length} ${liked ? '· liked' : ''} · ${(t.comments || []).length} comments${(t.photos || []).length ? ' · ' + t.photos.length + ' photos' : ''}</div>
    </div>
    ${icon('chevR', 'icon chev')}</div></a>`;
}

function viewTours(seg2) {
  if (seg2 === 'track') return viewTourTrack();
  if (seg2) return viewTourDetail(seg2);

  if (!tours.list) { loadTours(); return '<h1>Tours</h1><div class="card"><p class="sub">Loading tours…</p></div>'; }
  const s = Store.session();
  const me = s?.user;
  const tab = feedTab();
  const favs = Store.favProfiles();
  let feed = tours.list.filter((t) =>
    tab === 'mine' ? t.owner === me :
    tab === 'favs' ? t.shared && favs.includes(t.owner) :
    (t.shared || t.owner === me));
  return `
    <h1>Tours<span class="h1-sub">Track, log and share your days out</span></h1>
    ${tracker.status !== 'idle' ? `
    <a class="card tappable rec-banner" href="#/tours/track"><div class="row">
      <span class="badge live"><span class="dot"></span>Recording</span>
      <div class="grow" style="margin-left:10px"><h3>Tour in progress</h3><div class="sub">Tap to return to the tracking screen</div></div>
      ${icon('chevR', 'icon chev')}</div></a>` : `
    ${s ? `<a class="btn" href="#/tours/track" id="start-tour">${icon('route', 'icon')} Start a tour</a>`
        : `<div class="card"><h3>Sign in to record</h3><p class="sub" style="margin-top:6px">Tracking, trip logs and the feed use your account. Any tier works.</p><a class="btn" href="#/account">Sign in</a></div>`}`}

    ${rule('Feed')}
    <div class="seg-row">${FEED_TABS.map((f) => `<button class="seg ${feedTab() === f.id ? 'on' : ''}" data-feed="${f.id}">${f.label}</button>`).join('')}</div>
    ${feed.length ? feed.map((t) => tripCard(t, me)).join('')
      : `<div class="card"><p class="sub">${tab === 'mine' ? 'No tours yet — hit Start a tour.' : tab === 'favs' ? 'No shared tours from favourited profiles yet. Star people from their trip pages.' : 'Nothing shared yet. Recorded tours appear here when their owners share them.'}</p></div>`}
    <p class="note">Tours live on this device (and in migration bundles). Map data © OpenStreetMap contributors / OpenTopoMap.</p>`;
}

function viewTourTrack() {
  if (!Store.session()) {
    return `<h1>Track a tour</h1><div class="card"><h3>Sign in first</h3>
      <p class="sub" style="margin-top:6px">Tours are saved to your account on this device.</p></div>
      <a class="btn" href="#/account">Sign in</a>`;
  }
  const rec = tracker.status;
  return `
    <button class="back-btn" data-nav="#/tours">${icon('chevL', 'icon')} Tours</button>
    <h1>Live tracking</h1>
    <div id="tour-map" class="tour-map"></div>
    <p class="sub" id="tt-gps" style="margin:6px 2px">${rec === 'idle' ? 'GPS starts when you hit Record.' : 'GPS: waiting for first fix…'}</p>
    <div class="kv track-kv">
      <div class="cell"><div class="k">Time</div><div class="v big-stat" id="tt-time">0:00</div></div>
      <div class="cell"><div class="k">Distance</div><div class="v big-stat" id="tt-dist">0 m</div></div>
      <div class="cell"><div class="k">Ascent ↑</div><div class="v big-stat up" id="tt-gain">0 m</div></div>
      <div class="cell"><div class="k">Descent ↓</div><div class="v big-stat down" id="tt-loss">0 m</div></div>
      <div class="cell"><div class="k">Altitude</div><div class="v big-stat" id="tt-alt">—</div></div>
      <div class="cell"><div class="k">Observations</div><div class="v big-stat" id="tt-obs">${tracker.obs.length}</div></div>
    </div>
    <div class="track-controls">
      ${rec === 'idle' ? `<button class="btn" id="tt-start">● Record</button>` : ''}
      ${rec === 'recording' ? `<button class="btn secondary" id="tt-pause">❚❚ Pause</button>` : ''}
      ${rec === 'paused' ? `<button class="btn" id="tt-resume">● Resume</button>` : ''}
      ${rec !== 'idle' ? `<button class="btn" id="tt-finish">■ Finish & save</button>` : ''}
    </div>
    ${rec !== 'idle' ? `
    <form id="tt-obs-form" class="card">
      <h3>Log an observation here</h3>
      <p class="sub" style="margin-top:4px">Pinned to your current position and time. Wind effect, whumpfs, surface change, wildlife…</p>
      <textarea id="tt-obs-text" rows="2" maxlength="300" placeholder="e.g. Fresh wind slab forming on SE rolls near the saddle"></textarea>
      <button class="btn secondary" type="submit">Pin observation</button>
    </form>` : ''}
    <p class="note">Keep the app open while recording — iOS pauses GPS for backgrounded web apps. The screen is kept awake where the phone allows it.</p>`;
}

function tourObsList(obsArr) {
  if (!obsArr?.length) return '';
  return `${rule('Observations on route', `${obsArr.length}`)}
    ${obsArr.map((o) => `<div class="card"><p style="font-size:14.5px">${esc(o.text)}</p>
      <div class="sub">${esc(fmtDur(o.t || 0))} in${o.alt != null ? ` · ${esc(String(o.alt))} m` : ''}${o.lat != null ? ` · ${esc(o.lat.toFixed(4))}, ${esc(o.lng.toFixed(4))}` : ''}</div></div>`).join('')}`;
}

function viewTourDetail(id) {
  if (!tours.trip || tours.trip.id !== id) { loadTrip(id); return '<div class="card"><p class="sub">Loading tour…</p></div>'; }
  const t = tours.trip;
  if (t.missing) return `<button class="back-btn" data-nav="#/tours">${icon('chevL', 'icon')} Tours</button><div class="card"><p class="sub">That tour isn’t on this device.</p></div>`;
  const s = Store.session();
  const me = s?.user;
  const own = me === t.owner;
  const liked = me && (t.likes || []).includes(me);
  const fav = Store.favProfiles().includes(t.owner);
  return `
    <button class="back-btn" data-nav="#/tours">${icon('chevL', 'icon')} Tours</button>
    <h1>${esc(t.title)}</h1>
    <p class="sub" style="margin-bottom:10px">${esc(t.ownerName)} · ${esc(new Date(t.started).toLocaleString('en-AU', { hour12: false }))}
      ${own ? '' : `· <button class="mini-btn" id="fav-owner">${fav ? '★ Favourited' : '☆ Favourite profile'}</button>`}</p>
    <div id="trip-map" class="tour-map"></div>
    <div class="kv track-kv" style="margin-top:10px">
      <div class="cell"><div class="k">Distance</div><div class="v">${fmtDist(t.stats.dist)}</div></div>
      <div class="cell"><div class="k">Time</div><div class="v">${fmtDur(t.stats.durSec)}</div></div>
      <div class="cell"><div class="k">Ascent ↑</div><div class="v up">${esc(String(t.stats.gain))} m</div></div>
      <div class="cell"><div class="k">Descent ↓</div><div class="v down">${esc(String(t.stats.loss))} m</div></div>
    </div>
    ${rule('Elevation', t.stats.maxAlt ? `Max ${t.stats.maxAlt} m` : '')}
    <div class="card">${elevProfile(t.points)}
      <p class="sub" style="margin-top:6px"><span class="up">━</span> climbing · <span class="down">━</span> descending</p></div>

    ${t.desc || own ? rule('About this tour') : ''}
    ${own ? `
    <form id="trip-edit" class="card">
      <label for="te-title">Title</label>
      <input id="te-title" name="title" maxlength="80" value="${esc(t.title)}">
      <label for="te-desc">Description</label>
      <textarea id="te-desc" name="desc" rows="3" maxlength="1000" placeholder="Route, conditions, how it went…">${esc(t.desc)}</textarea>
      <button class="btn secondary" type="submit">Save details</button>
    </form>` : (t.desc ? `<div class="card article"><p>${esc(t.desc)}</p></div>` : '')}

    ${(t.photos || []).length || own ? rule('Photos', `${(t.photos || []).length}`) : ''}
    ${(t.photos || []).length ? `<div class="photo-grid">${t.photos.map((m) =>
      tours.photoUrls[m] ? `<img src="${esc(tours.photoUrls[m])}" alt="Tour photo" loading="lazy">` : '').join('')}</div>` : ''}
    ${own ? `<div class="card"><label for="trip-photo">Add photos</label>
      <input id="trip-photo" type="file" accept="image/*" multiple>
      <p class="sub" style="margin-top:6px">Stored on-device, compressed. Videos: paste a link below (YouTube or anywhere) — raw video files would fill the phone.</p>
      <label for="trip-video">Add a video link</label>
      <input id="trip-video" inputmode="url" placeholder="https://…">
      <button class="mini-btn" id="trip-video-add" type="button">Add link</button></div>` : ''}
    ${(t.videoLinks || []).length ? `<div class="card">${t.videoLinks.map((v, i) =>
      `<div class="row" style="padding:4px 0"><a class="grow" target="_blank" rel="noopener" href="${esc(v.url)}">${icon('play', 'icon accent')} ${esc(v.label || v.url)}</a>
       ${own ? `<button class="mini-btn danger" data-del-vlink="${i}">Remove</button>` : ''}</div>`).join('')}</div>` : ''}

    ${tourObsList(t.obs)}
    ${own ? `<form id="trip-obs-form" class="card"><h3>Add an observation (after the fact)</h3>
      <textarea id="trip-obs-text" rows="2" maxlength="300" placeholder="What you saw out there"></textarea>
      <button class="btn secondary" type="submit">Add observation</button></form>` : ''}

    ${rule('Sharing & feed')}
    <div class="card">
      <div class="row">
        <button class="mini-btn ${liked ? 'on' : ''}" id="trip-like" ${me ? '' : 'disabled'}>▲ ${(t.likes || []).length}</button>
        <div class="grow" style="margin-left:10px">
        ${own ? `<button class="mini-btn" id="trip-share">${t.shared ? 'Shared to feed — make private' : 'Private — share to feed'}</button>` : `<span class="sub">${t.shared ? 'Shared to the feed' : 'Private tour'}</span>`}
        </div>
        ${own ? `<button class="mini-btn danger" id="trip-delete">Delete tour</button>` : ''}
      </div>
    </div>
    ${rule('Comments', `${(t.comments || []).length}`)}
    ${(t.comments || []).map((c) => `<div class="card"><p style="font-size:14.5px">${esc(c.text)}</p>
      <div class="sub">${esc(c.name)} · ${esc(new Date(c.at).toLocaleString('en-AU', { hour12: false }))}</div></div>`).join('')}
    ${me ? `<form id="trip-comment-form" class="card">
      <textarea id="trip-comment-text" rows="2" maxlength="500" placeholder="Leave a comment"></textarea>
      <button class="btn secondary" type="submit">Comment</button></form>`
      : `<div class="card"><p class="sub">Sign in to like or comment.</p></div>`}`;
}

// image intake: downscale to ≤1400 px JPEG so a season of photos fits on-device
async function compressImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
}

function bindTours() {
  // feed tabs
  document.querySelectorAll('[data-feed]').forEach((b) =>
    b.addEventListener('click', () => { sessionStorage.setItem('msc.feedTab', b.dataset.feed); render(); }));

  // live tracking screen
  const mapEl = document.getElementById('tour-map');
  if (mapEl) {
    const map = topoMap(mapEl, { center: [-36.45, 148.26], zoom: 12 }); // Main Range default
    if (tracker.status !== 'idle') {
      tracker.map = map;
      tracker.lineUp = L.polyline(tracker.segsUp, { color: '#f15a24', weight: 4 }).addTo(map);
      tracker.lineDown = L.polyline(tracker.segsDown, { color: '#29abe2', weight: 4 }).addTo(map);
      const lastP = tracker.points[tracker.points.length - 1];
      if (lastP) {
        tracker.marker = null;
        tracker.paint(lastP);
      }
    } else {
      // idle: centre on the phone if it allows us
      navigator.geolocation?.getCurrentPosition?.((pos) =>
        map.setView([pos.coords.latitude, pos.coords.longitude], 13), () => {}, { timeout: 5000 });
      window.__mscTrackMap = map; // adopted by tracker on Record
    }
    const start = $('#tt-start');
    if (start) start.addEventListener('click', async () => {
      await tracker.start();
      render(); // bindTours reattaches the map + lines on the re-render
    });
    const pause = $('#tt-pause');
    if (pause) pause.addEventListener('click', () => { tracker.pause(); render(); });
    const resume = $('#tt-resume');
    if (resume) resume.addEventListener('click', () => { tracker.resume(); render(); });
    const finish = $('#tt-finish');
    if (finish) finish.addEventListener('click', async () => {
      if (tracker.points.length < 2 && !confirm('Almost no GPS points recorded — save anyway?')) return;
      await tracker.finish();
    });
    const obsForm = $('#tt-obs-form');
    if (obsForm) obsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (tracker.addObs($('#tt-obs-text').value)) {
        $('#tt-obs-text').value = '';
        const c = $('#tt-obs');
        if (c) c.textContent = tracker.obs.length;
      }
    });
  }

  // trip detail screen
  const tripMapEl = document.getElementById('trip-map');
  if (tripMapEl && tours.trip?.points) {
    const map = topoMap(tripMapEl);
    drawRoute(map, tours.trip.points);
  }
  const saveTrip = async () => { await Store.saveTrip(tours.trip); render(); };
  const te = $('#trip-edit');
  if (te) te.addEventListener('submit', async (e) => {
    e.preventDefault();
    tours.trip.title = $('#te-title').value.trim().slice(0, 80) || tours.trip.title;
    tours.trip.desc = $('#te-desc').value.trim().slice(0, 1000);
    tours.list = null;
    await saveTrip();
  });
  const like = $('#trip-like');
  if (like) like.addEventListener('click', async () => {
    await Store.toggleLike(tours.trip.id);
    tours.trip = null; tours.list = null;
    render();
  });
  const share = $('#trip-share');
  if (share) share.addEventListener('click', async () => {
    tours.trip.shared = !tours.trip.shared;
    tours.list = null;
    await saveTrip();
  });
  const del = $('#trip-delete');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Delete this tour and its photos? This can’t be undone.')) return;
    await Store.deleteTrip(tours.trip.id);
    tours.trip = null; tours.list = null;
    location.hash = '#/tours';
  });
  const favBtn = $('#fav-owner');
  if (favBtn) favBtn.addEventListener('click', () => { Store.toggleFav(tours.trip.owner); render(); });
  const photo = $('#trip-photo');
  if (photo) photo.addEventListener('change', async () => {
    for (const f of photo.files || []) {
      if (!f.type.startsWith('image/')) continue;
      const blob = await compressImage(f);
      const id = 'ph-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      await Store.savePhoto(id, blob);
      tours.trip.photos.push(id);
      tours.photoUrls[id] = URL.createObjectURL(blob);
    }
    await saveTrip();
  });
  const vAdd = $('#trip-video-add');
  if (vAdd) vAdd.addEventListener('click', async () => {
    const url = $('#trip-video').value.trim();
    if (!/^https:\/\/\S+$/.test(url) || url.length > 300) return;
    tours.trip.videoLinks = tours.trip.videoLinks || [];
    tours.trip.videoLinks.push({ url, label: url.replace(/^https:\/\/(www\.)?/, '').slice(0, 60) });
    await saveTrip();
  });
  document.querySelectorAll('[data-del-vlink]').forEach((b) =>
    b.addEventListener('click', async () => {
      tours.trip.videoLinks.splice(+b.dataset.delVlink, 1);
      await saveTrip();
    }));
  const obsF = $('#trip-obs-form');
  if (obsF) obsF.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#trip-obs-text').value.trim().slice(0, 300);
    if (!text) return;
    tours.trip.obs = tours.trip.obs || [];
    tours.trip.obs.push({ at: Date.now(), t: null, lat: null, lng: null, alt: null, text });
    await saveTrip();
  });
  const cm = $('#trip-comment-form');
  if (cm) cm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await Store.addComment(tours.trip.id, $('#trip-comment-text').value);
    tours.trip = null;
    render();
  });
}

// ---------- router ----------
const TABS = [
  { path: '#/today',   label: 'Today',   icon: 'mountain',   render: viewToday },
  { path: '#/report',  label: 'Report',  icon: 'report',     render: viewReport },
  { path: '#/observe', label: 'Observe', icon: 'binoculars', render: viewObserve },
  { path: '#/tours',   label: 'Tours',   icon: 'route',      render: viewTours },
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

  bindTours();

  // learn practice quizzes: first tap locks the question, shows the answer
  document.querySelectorAll('.quiz-opt').forEach((b) =>
    b.addEventListener('click', () => {
      const topic = LEARN_TOPICS.find((x) => x.id === (location.hash.split('/')[2] || ''));
      const q = topic?.quiz?.[+b.dataset.q];
      if (!q) return;
      const card = b.closest('.quiz');
      card.querySelectorAll('.quiz-opt').forEach((o) => {
        o.disabled = true;
        if (+o.dataset.o === q.a) o.classList.add('right');
      });
      if (+b.dataset.o !== q.a) b.classList.add('wrong');
      card.querySelector('.quiz-why').removeAttribute('hidden');
    }));

  // video library: swap thumbnail for the embed on tap; admin add/remove
  document.querySelectorAll('[data-play]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.play;
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      document.getElementById('vs-' + id).innerHTML =
        `<iframe class="video-frame" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1"
          title="MSC video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    }));
  document.querySelectorAll('[data-del-video]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm('Remove this video from the library?')) { Store.removeVideo(b.dataset.delVideo); render(); }
    }));
  const avf = $('#addvideo-form');
  if (avf) avf.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(avf).entries());
    const res = Store.addVideo(d);
    if (res.error) {
      const err = $('#av-err'); err.textContent = res.error; err.removeAttribute('hidden');
    } else render();
  });

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
  if (ex) ex.addEventListener('click', async () => {
    const blob = new Blob([JSON.stringify(await Store.exportBundle(), null, 2)], { type: 'application/json' });
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
      const res = await Store.importBundle(JSON.parse(await f.text()));
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
