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
    return `<div class="hazard-chip">
      <div class="lvl-bar ${sevClass(cat, lvl)}"></div>
      <div><div class="name">${esc(HAZARD_CATEGORIES[cat].label)}</div>
      <div class="lvl">${esc(lvl)}</div></div>
    </div>`;
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
    body = bandSection('Alpine', 'Above treeline · ~1850 m+', rep.bands.alpine)
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
    }).join('');
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
