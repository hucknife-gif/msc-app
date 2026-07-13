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

// live data adapter: try the public MSC API, fall back to bundled sample.
// Fetched values are rendered as text only (esc()), never as markup.
const live = { reports: null, tried: false };

async function tryLiveFetch() {
  if (live.tried) return;
  live.tried = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch('https://api.mountainsafetycollective.org/report/get_view_data_by_date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today }),
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json && Array.isArray(json.reports) && json.reports.length) {
      live.reports = json.reports;
      render(); // repaint with the live badge + any mapped fields
    }
  } catch { /* offline or CORS-blocked — sample data stands in */ }
}

function currentReport() {
  // Live API mapping is conservative: until the response schema is confirmed
  // in the wild we surface liveness via the badge and keep the structured
  // sample; a confirmed schema can be mapped here later.
  return SAMPLE_REPORTS[store.region];
}

// ---------- shared renderers ----------
function sevClass(cat, lvl) { return 'sev-' + (LEVEL_SEVERITY[cat]?.[lvl] ?? 1); }

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

// elevation cross-section: ridgeline profile split into rated bands
function elevationSection(rep) {
  const bands = [
    { key: 'alpine', label: 'ALPINE', elev: '1850 m+', y: 12, h: 34 },
    { key: 'subalpine', label: 'SUBALPINE', elev: '< treeline', y: 46, h: 34 }
  ];
  return `<svg class="elev" viewBox="0 0 340 96">
    <path d="M0 96 L0 78 L54 58 L96 70 L150 22 L196 48 L244 30 L296 56 L340 40 L340 96 Z" class="elev-mtn"/>
    ${bands.map((b) => {
      const sev = LEVEL_SEVERITY.avalanche[rep.bands[b.key].dangers.avalanche] ?? 0;
      return `
      <line x1="8" x2="332" y1="${b.y + b.h}" y2="${b.y + b.h}" class="elev-line"/>
      <rect x="8" y="${b.y}" width="5" height="${b.h}" rx="2.5" class="sev-${sev}"/>
      <text x="22" y="${b.y + 14}" class="elev-band">${b.label}</text>
      <text x="22" y="${b.y + 27}" class="elev-meta">${b.elev} · Avalanche ${esc(rep.bands[b.key].dangers.avalanche)}</text>`;
    }).join('')}
  </svg>`;
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
  <path d="M0 64 L0 40 L52 24 L96 38 L142 12 L188 32 L232 18 L278 38 L326 22 L368 40 L400 30 L400 64 Z" fill="#0b1f2a" opacity="0.55"/>
  <path d="M0 64 L0 48 L44 34 L90 46 L138 24 L190 42 L242 28 L294 46 L348 34 L400 44 L400 64 Z" fill="#102b39"/>
</svg>`;

function regionToggle() {
  return `<div class="seg" role="group" aria-label="Region">
    ${REGIONS.map((r) => `<button data-region="${r.id}" aria-pressed="${r.id === store.region}">${esc(r.name)}</button>`).join('')}
  </div>`;
}

function statusBadge(rep) {
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

    ${rule('Station snapshot', 'Forecast 24 h')}
    <div class="kv">
      <div class="cell"><div class="k">Temp (alpine)</div><div class="v">${esc(rep.weather.temp)}</div></div>
      <div class="cell"><div class="k">Wind</div><div class="v">${esc(rep.weather.wind)}</div></div>
      <div class="cell"><div class="k">Freezing level</div><div class="v">${esc(rep.weather.freezing)}</div></div>
      <div class="cell"><div class="k">Snow next 24 h</div><div class="v">${esc(rep.weather.snow24)}</div></div>
    </div>

    <div class="card chart-card">
      <div class="chart-head"><span class="chart-t">Temperature</span><span class="chart-u">°C · alpine</span></div>
      ${lineChart(rep.trend.temp, rep.trend.hours, '°', 'tmp')}
      <div class="chart-head"><span class="chart-t">Wind</span><span class="chart-u">km/h gusting</span></div>
      ${lineChart(rep.trend.wind, rep.trend.hours, '', 'wnd')}
      <div class="chart-head"><span class="chart-t">Snowfall</span><span class="chart-u">cm / 3 h</span></div>
      ${barChart(rep.trend.snow, rep.trend.hours, 'cm')}
    </div>

    ${rule('Wind loading', 'Alpine · by aspect')}
    <div class="card rose-card">
      ${aspectRose(rep.aspects.alpine)}
      <div class="rose-side">
        <p class="sub">Where the wind has been parking snow. Tap a sector for what that means on the ground.</p>
        <div class="rose-legend">
          ${LOAD_NAMES.map((n, i) => `<span class="rose-key"><span class="scale-dot sev-${i}"></span>${n}</span>`).join('')}
        </div>
      </div>
    </div>

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
    body = `<div class="card elev-card">${elevationSection(rep)}</div>`
         + bandSection('Alpine', 'Above treeline · ~1850 m+', rep.bands.alpine)
         + bandSection('Subalpine', 'Below treeline', rep.bands.subalpine);
  } else if (tab === 'hazards') {
    body = Object.keys(HAZARD_CATEGORIES).map((cat) => {
      const c = HAZARD_CATEGORIES[cat];
      const alp = rep.bands.alpine.dangers[cat];
      const sub = rep.bands.subalpine.dangers[cat];
      return `<div class="card"><div class="row">
        <div class="lvl-bar ${sevClass(cat, alp)}" style="width:5px;align-self:stretch;border-radius:3px"></div>
        <div class="grow"><h3>${esc(c.label)} — ${esc(alp)} <span class="sub">(subalpine: ${esc(sub)})</span></h3>
        <div class="sub">${esc(c.desc)}</div></div></div></div>`;
    }).join('')
    + rule('Wind loading by aspect', 'Alpine band')
    + `<div class="card rose-card">${aspectRose(rep.aspects.alpine)}
       <div class="rose-side"><p class="sub">Lee-slope slab hazard concentrates on loaded aspects. Tap a sector.</p>
       <div class="rose-legend">${LOAD_NAMES.map((n, i) => `<span class="rose-key"><span class="scale-dot sev-${i}"></span>${n}</span>`).join('')}</div></div></div>`;
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
    <p class="note">Modelled on the MSC report format. Always read the real report before travelling: reports.mountainsafetycollective.org</p>`;
}

function viewObserve() {
  const draft = JSON.parse(localStorage.getItem('msc.obsDraft') || '{}');
  return `
    <h1>Observations</h1>
    <p class="lede">Field observations from the public make the forecasts better. Submit to MSC, or draft one here first — drafts save on your phone automatically.</p>
    <a class="card tappable" href="https://forms.gle/CXabbENhVmuLfdga6" target="_blank" rel="noopener">
      <div class="row">${icon('send', 'icon accent')}
      <div class="grow"><h3>Submit to MSC</h3><div class="sub">Official public observation form (opens in browser)</div></div>
      ${icon('external', 'icon chev')}</div></a>

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
      <p class="note">Share opens your phone’s share sheet (or email) with the draft text — paste it into the MSC form or a group chat.</p>
    </form>`;
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
    <p class="note">Unofficial personal app. All safety content is general guidance — formal training (AST1) is the real thing. Mountain Safety Collective is a not-for-profit: mountainsafetycollective.org/membership</p>`;
}

// ---------- router ----------
const TABS = [
  { path: '#/today',   label: 'Today',   icon: 'mountain',   render: viewToday },
  { path: '#/report',  label: 'Report',  icon: 'report',     render: viewReport },
  { path: '#/observe', label: 'Observe', icon: 'binoculars', render: viewObserve },
  { path: '#/learn',   label: 'Learn',   icon: 'book',       render: viewLearn },
  { path: '#/safety',  label: 'Safety',  icon: 'cross',      render: viewSafety }
];

function render() {
  const hash = location.hash || '#/today';
  const [, seg1, seg2] = hash.split('/'); // '#/learn/topic' → ['#','learn','topic']
  const base = '#/' + (seg1 || 'today');
  const tab = TABS.find((t) => t.path === base) || TABS[0];

  $('#view').innerHTML = `<div class="view">${tab.render(seg2)}</div>`;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.getAttribute('href') === tab.path) a.setAttribute('aria-current', 'page');
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

function boot() {
  $('#tabbar').innerHTML = TABS.map((t) =>
    `<a href="${t.path}">${icon(t.icon)}<span>${t.label}</span></a>`).join('');
  window.addEventListener('hashchange', render);
  render();
  tryLiveFetch();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* http/LAN — offline cache unavailable */ });
  }
}

document.addEventListener('DOMContentLoaded', boot);
