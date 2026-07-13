// MSC app content data.
// Structure mirrors the real MSC Backcountry Conditions Report anatomy:
// regional outlook (issued / prepared by / confidence / synopsis), day score
// (Usual Caution / Extra Caution / Travel Not Recommended), four hazard
// categories (Exposure, Visibility, Surface, Avalanche), two elevation bands
// (Alpine / Subalpine), travel & terrain advice per band.
// All report copy here is ORIGINAL SAMPLE content for demo/offline use —
// clearly badged in the UI. The live adapter in app.js replaces it when the
// public MSC API is reachable.

const DAY_SCORES = {
  'usual-caution': {
    label: 'Usual Caution',
    color: 'var(--dgr-low)',
    text: '#0d1a2b',
    blurb: 'Standard alpine care applies. Conditions are broadly manageable for equipped, informed parties.'
  },
  'extra-caution': {
    label: 'Extra Caution',
    color: 'var(--dgr-considerable)',
    text: '#0d1a2b',
    blurb: 'Heightened hazard. Conservative terrain choices, strong navigation and constant reassessment required.'
  },
  'travel-not-recommended': {
    label: 'Travel Not Recommended',
    color: 'var(--dgr-high)',
    text: '#ffffff',
    blurb: 'Hazard combination is severe. Backcountry travel is not recommended today.'
  }
};

const HAZARD_CATEGORIES = {
  exposure:   { label: 'Exposure',   icon: 'wind',
    desc: 'Wind chill and weather exposure — the leading cause of serious incidents in the Australian Alps.' },
  visibility: { label: 'Visibility', icon: 'eye',
    desc: 'Good, Poor (under 1 km) or Whiteout (under 50 m). Whiteout navigation is a skill, not a setting.' },
  surface:    { label: 'Surface',    icon: 'layers',
    desc: 'Ice, rime and breakable crust. Firm surfaces turn simple slopes into slide-for-life terrain.' },
  avalanche:  { label: 'Avalanche',  icon: 'triangle',
    desc: 'Rated Low, Moderate, Considerable or High using international definitions (Extreme is not used in Australia).' }
};

const HAZARD_LEVELS = {
  exposure:   ['Mild', 'Notable', 'Severe'],
  visibility: ['Good', 'Poor', 'Whiteout'],
  surface:    ['Soft', 'Firm', 'Icy'],
  avalanche:  ['Low', 'Moderate', 'Considerable', 'High']
};

// severity index into a shared 0..3 colour ramp (green → yellow → orange → red)
const LEVEL_SEVERITY = {
  exposure:   { Mild: 0, Notable: 2, Severe: 3 },
  visibility: { Good: 0, Poor: 2, Whiteout: 3 },
  surface:    { Soft: 0, Firm: 2, Icy: 3 },
  avalanche:  { Low: 0, Moderate: 1, Considerable: 2, High: 3 }
};

// apiRange = MSC API region id (empirical: 3 = Main range, 2 = Dividing Range)
const REGIONS = [
  { id: 'main-range',     apiRange: 3, name: 'NSW Main Range',     area: 'Kosciuszko National Park, NSW' },
  { id: 'dividing-range', apiRange: 2, name: 'VIC Dividing Range', area: 'Victorian Alps, VIC' }
];

const SAMPLE_REPORTS = {
  'main-range': {
    sample: true,
    issued: '2026-07-13 07:00 AEST',
    preparedBy: 'Demo content, not a forecast',
    confidence: 'Moderate',
    dayScore: 'extra-caution',
    synopsis: 'A cold front crossing the ranges this afternoon brings strengthening north-westerlies ahead of it and falling temperatures behind it. Surfaces refroze overnight above 1900 m and will stay firm on shaded aspects all day. Visibility deteriorates from mid-afternoon.',
    weather: { temp: '-4°C', wind: 'NW 45–65 km/h', freezing: '1400 m', snow24: '5–10 cm from tonight' },
    trend: {
      hours: ['06', '09', '12', '15', '18', '21', '00', '03'],
      temp: [-4, -3, -2, -3, -6, -8, -9, -10],
      wind: [35, 45, 55, 65, 60, 50, 45, 40],
      snow: [0, 0, 0, 0, 2, 4, 3, 2]
    },
    // wind-slab loading by aspect, 0 (minimal) → 3 (heavy)
    aspects: {
      alpine:    { N: 1, NE: 2, E: 3, SE: 3, S: 2, SW: 1, W: 0, NW: 0 },
      subalpine: { N: 0, NE: 1, E: 1, SE: 1, S: 0, SW: 0, W: 0, NW: 0 }
    },
    hazards: [
      {
        n: 1, tier: 'Primary', name: 'Wind slab avalanche', type: 'avalanche',
        desc: 'Fresh slabs are building on lee features as the north-westerly ramps up. Reactivity is expected to rise through the afternoon as loading continues onto the overnight crust.',
        about: 'Wind slab forms when wind-transported snow packs into a cohesive layer over a weaker surface. It is most reactive just below ridgelines, on convex rolls and in cross-loaded gullies.',
        bands: ['alpine'], aspects: ['E', 'SE', 'S'], size: 2, likelihood: 'Likely'
      },
      {
        n: 2, tier: 'Secondary', name: 'Icy sliding surfaces', type: 'surface',
        desc: 'Refrozen surfaces on shaded aspects will not soften today. A simple slip can become a long slide into rocks — firm-snow tools and the skill to use them are the mitigation.',
        about: 'Slide-for-life conditions occur when a fall on firm snow cannot be arrested. Consequence, not probability, is what changes: benign slopes become serious above cliffs, rocks or gullies.',
        bands: ['alpine', 'subalpine'], aspects: ['S', 'SW', 'SE']
      },
      {
        n: 3, tier: 'Tertiary', name: 'Whiteout navigation', type: 'visibility',
        desc: 'Cloud drops onto the range from mid-afternoon ahead of the front. Featureless terrain above treeline will lose all definition quickly.',
        about: 'In whiteout, the snow surface and sky merge; slope angle and drop-offs become unreadable. Navigation by bearing and altitude, rehearsed beforehand, is the reliable fallback.',
        bands: ['alpine'], aspects: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
      }
    ],
    bands: {
      alpine: {
        score: 'extra-caution',
        dangers: { exposure: 'Severe', visibility: 'Poor', surface: 'Icy', avalanche: 'Moderate' },
        travel: [
          'Wind chill near -20°C on exposed ridgelines — cover all skin and keep moving or get below the ridge.',
          'Firm, icy surfaces on S–SE aspects; ski crampons or boot crampons and an ice axe are appropriate.',
          'Wind slabs building in lee features (E–SE) through the afternoon — avoid convex rolls above terrain traps.',
          'Navigation will be demanding after 15:00; have a compass bearing home before the cloud drops.'
        ]
      },
      subalpine: {
        score: 'usual-caution',
        dangers: { exposure: 'Notable', visibility: 'Good', surface: 'Firm', avalanche: 'Low' },
        travel: [
          'Sheltered valley travel is the sensible plan for the afternoon.',
          'Creek crossings are open and undercut — cross at established snow bridges only.',
          'Icy patches persist on shaded track sections below tree line.'
        ]
      }
    },
    details: 'Overnight refreeze was strong above 1900 m after Saturday’s rain event, leaving a widespread melt-freeze crust. New snow arriving tonight will fall onto this slick interface — expect the avalanche hazard to rise tomorrow as fresh slabs bond poorly to the crust. The exposure hazard is the day’s main story: the pre-frontal wind ramp will make ridgeline travel punishing well before any snow arrives.'
  },
  'dividing-range': {
    sample: true,
    issued: '2026-07-13 07:00 AEST',
    preparedBy: 'Demo content, not a forecast',
    confidence: 'Strong',
    dayScore: 'usual-caution',
    synopsis: 'A quieter day on the Victorian side. Light westerlies, freezing level near 1300 m, and a settled snowpack after last week’s storm cycle. A good window for longer tours before the front arrives overnight.',
    weather: { temp: '-1°C', wind: 'W 20–30 km/h', freezing: '1300 m', snow24: 'Nil until overnight' },
    trend: {
      hours: ['06', '09', '12', '15', '18', '21', '00', '03'],
      temp: [-3, -1, 1, 2, 0, -2, -4, -5],
      wind: [15, 20, 25, 30, 28, 35, 45, 55],
      snow: [0, 0, 0, 0, 0, 0, 1, 3]
    },
    aspects: {
      alpine:    { N: 0, NE: 1, E: 2, SE: 1, S: 0, SW: 0, W: 0, NW: 0 },
      subalpine: { N: 0, NE: 0, E: 1, SE: 0, S: 0, SW: 0, W: 0, NW: 0 }
    },
    hazards: [
      {
        n: 1, tier: 'Primary', name: 'Cornice fall', type: 'avalanche',
        desc: 'Large cornices from last week’s storm overhang east-facing ridgelines. Daytime warming increases the chance of natural failures onto slopes below.',
        about: 'Cornices break further back than they appear from above, and a collapse can trigger the slope beneath. Give edges several metres and avoid lingering below them in warming conditions.',
        bands: ['alpine'], aspects: ['E', 'NE', 'SE'], size: 2, likelihood: 'Possible'
      },
      {
        n: 2, tier: 'Secondary', name: 'Morning icy patches', type: 'surface',
        desc: 'Refrozen patches persist on shaded track sections and above 1500 m until mid-morning. Consequence is low on gentle terrain but rises quickly on steeper sidles.',
        about: 'Melt-freeze surfaces are most hazardous early in the day and on shaded aspects; softening usually arrives with sun and rising freezing levels.',
        bands: ['alpine', 'subalpine'], aspects: ['S', 'SW', 'SE']
      }
    ],
    bands: {
      alpine: {
        score: 'usual-caution',
        dangers: { exposure: 'Notable', visibility: 'Good', surface: 'Firm', avalanche: 'Low' },
        travel: [
          'Morning surfaces are firm — time descents for afternoon softening on sunny aspects.',
          'Cornices remain along E-facing ridgelines from last week’s storm; give edges a wide berth.',
          'Weather deteriorates overnight — be off high ground by dark.'
        ]
      },
      subalpine: {
        score: 'usual-caution',
        dangers: { exposure: 'Mild', visibility: 'Good', surface: 'Soft', avalanche: 'Low' },
        travel: [
          'Good touring conditions on sheltered terrain.',
          'Thin cover on sunny aspects below 1500 m — expect rocks and vegetation near the surface.'
        ]
      }
    },
    details: 'The snowpack has settled well since the storm cycle ended Thursday. Isolated wind slabs from the storm are now stubborn and confined to extreme lee terrain. The main planning consideration is tonight’s front — parties on multi-day trips should plan conservative Monday terrain.'
  }
};

// Inline line-art diagrams for Learn articles. Static trusted markup —
// colours come from .learn-fig CSS classes so they follow the theme.
const LEARN_FIGS = {

  // Slab anatomy: crown, flank, bed surface, weak layer, debris
  'slab-anatomy': `<svg viewBox="0 0 360 190" role="img" aria-label="Slab avalanche anatomy diagram">
    <path class="mute" fill="none" stroke-width="1.5" d="M8 30 L120 78 L340 160"/>
    <path class="fg" fill="none" stroke-width="2.5" d="M8 22 L118 68"/>
    <path class="fg" fill="none" stroke-width="2.5" d="M118 68 L118 84"/>
    <path class="acc" fill="none" stroke-width="2" stroke-dasharray="5 4" d="M118 84 L336 168"/>
    <path class="fg" fill="none" stroke-width="2" d="M244 128 C258 122 276 128 282 140 C296 136 312 142 316 154 C330 152 340 158 342 166 L252 166 C240 156 236 138 244 128 Z"/>
    <text class="lbl" x="14" y="14">Crown — where the slab broke away</text>
    <line class="mute" x1="70" y1="18" x2="112" y2="62" stroke-width="1"/>
    <text class="lbl" x="130" y="60">Slab (cohesive wind-packed snow)</text>
    <text class="lbl" x="128" y="104">Weak layer / bed surface</text>
    <text class="lbl" x="236" y="186">Debris</text>
  </svg>`,

  // Slope angle: fan showing sub-25 / 25-30 / 30-45 (prime) / 45+ bands
  'slope-angle': `<svg viewBox="0 0 360 200" role="img" aria-label="Slope angle and avalanche release diagram">
    <line class="mute" x1="20" y1="180" x2="340" y2="180" stroke-width="1.5"/>
    <line class="mute" x1="20" y1="180" x2="330" y2="124" stroke-width="1.5"/>
    <line class="blue" x1="20" y1="180" x2="320" y2="80" stroke-width="1.5"/>
    <line class="acc" x1="20" y1="180" x2="270" y2="20" stroke-width="2.5"/>
    <line class="acc" x1="20" y1="180" x2="150" y2="10" stroke-width="2.5"/>
    <line class="fg" x1="20" y1="180" x2="80" y2="8" stroke-width="1.5"/>
    <text class="lbl" x="285" y="150">&lt;25° rarely slides</text>
    <text class="lbl" x="270" y="98">25–30° possible</text>
    <text class="lbl" x="180" y="52">30–45° PRIME</text>
    <text class="lbl" x="30" y="30">45°+ sluffs often,</text>
    <text class="lbl" x="30" y="42">slabs less</text>
    <text class="lbl" x="24" y="196">Measure the steepest part of the slope, not the average</text>
  </svg>`,

  // Wind loading + cornice: westerly wind, scoured windward, lee slab + cornice
  'wind-loading': `<svg viewBox="0 0 360 200" role="img" aria-label="Wind loading over a ridge diagram">
    <path class="fg" fill="none" stroke-width="2.5" d="M10 150 C70 120 120 84 160 62 C176 54 192 52 200 58 C204 62 202 68 196 72 C220 84 250 110 292 140 C312 152 336 162 352 168"/>
    <path class="acc" fill="none" stroke-width="2.5" d="M200 58 C216 58 224 66 222 74 C218 82 208 80 196 72"/>
    <path class="blue" fill="none" stroke-width="2" stroke-dasharray="6 4" d="M204 74 C232 92 262 118 300 146"/>
    <g class="mute" stroke-width="1.5" fill="none">
      <path d="M18 60 L74 60 M62 54 L74 60 L62 66"/>
      <path d="M30 88 L92 88 M80 82 L92 88 L80 94"/>
      <path d="M46 116 L106 116 M94 110 L106 116 L94 122"/>
    </g>
    <text class="lbl" x="20" y="44">Prevailing W–NW wind</text>
    <text class="lbl" x="60" y="160">Windward: scoured, firm</text>
    <text class="lbl" x="228" y="60">Cornice</text>
    <text class="lbl" x="238" y="112">Lee (E–SE): wind slab</text>
    <text class="lbl" x="240" y="126">builds here</text>
  </svg>`,

  // Cornice: cross-section, fracture line further back than the visible edge
  'cornice-line': `<svg viewBox="0 0 360 180" role="img" aria-label="Cornice cross-section diagram">
    <path class="fg" fill="none" stroke-width="2.5" d="M10 80 L150 80 C190 80 224 86 240 100 C254 112 252 128 240 132 C230 136 216 128 210 118"/>
    <path class="mute" fill="none" stroke-width="1.5" d="M150 172 C180 150 200 136 210 118"/>
    <line class="acc" x1="150" y1="80" x2="150" y2="46" stroke-width="2" stroke-dasharray="4 3"/>
    <path class="acc-fill" d="M144 46 L156 46 L150 36 Z"/>
    <g class="mute" stroke-width="1" fill="none"><path d="M262 70 L306 70 M296 65 L306 70 L296 75"/></g>
    <text class="lbl" x="14" y="66">Solid ground under here…</text>
    <text class="lbl" x="160" y="40">…but the fracture line is back here</text>
    <text class="lbl" x="252" y="58">Wind</text>
    <text class="lbl" x="248" y="158">Overhung snow —</text>
    <text class="lbl" x="248" y="170">nothing beneath it</text>
  </svg>`,

  // Burial survival curve (Canadian data): steep drop after ~10 min
  'survival-curve': `<svg viewBox="0 0 360 200" role="img" aria-label="Avalanche burial survival curve">
    <line class="mute" x1="44" y1="16" x2="44" y2="168" stroke-width="1.5"/>
    <line class="mute" x1="44" y1="168" x2="344" y2="168" stroke-width="1.5"/>
    <path class="acc" fill="none" stroke-width="3" d="M44 26 C90 28 106 30 122 40 C142 54 150 92 170 118 C192 144 240 152 306 156"/>
    <line class="blue" x1="122" y1="16" x2="122" y2="168" stroke-width="1.5" stroke-dasharray="5 4"/>
    <text class="lbl" x="4" y="30">100%</text>
    <text class="lbl" x="12" y="172">0%</text>
    <text class="lbl" x="40" y="186">0</text>
    <text class="lbl" x="112" y="186">10 min</text>
    <text class="lbl" x="230" y="186">30 min</text>
    <text class="lbl" x="128" y="34">Survival falls off a cliff</text>
    <text class="lbl" x="128" y="48">after ~10 minutes</text>
    <text class="lbl" x="196" y="136">Rescue from outside almost</text>
    <text class="lbl" x="196" y="150">never arrives in time</text>
  </svg>`,

  // Terrain trap: open slope vs gully — same avalanche, different burial
  'terrain-trap': `<svg viewBox="0 0 360 190" role="img" aria-label="Terrain trap diagram — gullies concentrate debris">
    <path class="fg" fill="none" stroke-width="2" d="M10 40 C50 70 90 110 150 140 L174 148"/>
    <path class="mute-fill" d="M120 122 C140 136 160 144 174 148 L174 156 C154 152 132 142 114 130 Z" opacity="0.5"/>
    <text class="lbl" x="18" y="26">Open runout: debris spreads thin</text>
    <path class="fg" fill="none" stroke-width="2" d="M200 30 C240 60 268 92 286 118 C296 132 304 138 312 140 C322 138 330 130 338 116"/>
    <path class="acc-fill" d="M288 122 C296 132 304 138 312 140 C320 138 328 132 334 122 L330 152 C322 160 300 160 292 150 Z" opacity="0.75"/>
    <text class="lbl" x="206" y="16">Gully / creek line: the same</text>
    <text class="lbl" x="206" y="28">slide buries you metres deep</text>
    <text class="lbl" x="20" y="182">Ask: if it slides, where does the snow — and where do I — end up?</text>
  </svg>`,

  // Rescue sequence timeline
  'rescue-seq': `<svg viewBox="0 0 360 150" role="img" aria-label="Companion rescue sequence">
    <line class="mute" x1="20" y1="46" x2="340" y2="46" stroke-width="2"/>
    <g class="acc-fill">
      <circle cx="40" cy="46" r="7"/><circle cx="112" cy="46" r="7"/>
      <circle cx="184" cy="46" r="7"/><circle cx="256" cy="46" r="7"/><circle cx="328" cy="46" r="7"/>
    </g>
    <text class="lbl" x="22" y="24">SAFE?</text>
    <text class="lbl" x="88" y="24">SIGNAL</text>
    <text class="lbl" x="162" y="24">COARSE</text>
    <text class="lbl" x="238" y="24">FINE</text>
    <text class="lbl" x="304" y="24">PROBE</text>
    <text class="lbl" x="22" y="70">Hang-fire</text>
    <text class="lbl" x="22" y="82">check first</text>
    <text class="lbl" x="88" y="70">All to search;</text>
    <text class="lbl" x="88" y="82">40 m strips</text>
    <text class="lbl" x="162" y="70">Follow arrow,</text>
    <text class="lbl" x="162" y="82">run don't walk</text>
    <text class="lbl" x="238" y="70">On the snow,</text>
    <text class="lbl" x="238" y="82">bracket lowest</text>
    <text class="lbl" x="304" y="70">Spiral 25 cm;</text>
    <text class="lbl" x="304" y="82">leave it in</text>
    <text class="lbl" x="22" y="120">Then dig: start 1.5× burial depth downhill, throw snow to the sides,</text>
    <text class="lbl" x="22" y="134">swap the lead shoveller every minute or two. Airway first.</text>
  </svg>`
};

// MSC's official YouTube channel (linked from mountainsafetycollective.org's
// footer). Seed library = their published videos; forecasters can add more
// in-app. IDs verified against the channel's RSS feed 2026-07-13.
const MSC_YT_CHANNEL = 'https://www.youtube.com/channel/UCnqIbssyBn7QDnySaMXPaJA';
const SEED_VIDEOS = [
  { id: 'GXphQpXMt4U', title: 'Aligning your mindset with the MSC Backcountry Conditions Report', note: 'How the forecasters intend the report to be read · 19 min' },
  { id: 'daugTasfZ1Y', title: 'Northern Hemisphere Backcountry Preparation', note: 'Taking Australian skills to bigger ranges · 23 min' },
  { id: 'R0xwWkfCBWM', title: 'Mountain Safety Collective — who we are', note: 'MSC in 90 seconds' },
  { id: 'LpwzjL6B2no', title: 'Annual General Meeting 2025', note: 'State of the collective · 56 min' }
];

const LEARN_TOPICS = [

  // ---------------- START HERE ----------------
  {
    id: 'day-score',
    group: 'Start here',
    icon: 'report',
    title: 'How the MSC day score works',
    summary: 'Usual Caution, Extra Caution, Travel Not Recommended — and why Australia rates hazards its own way.',
    body: [
      'MSC rates each day across four hazard categories — Exposure, Visibility, Surface and Avalanche — then combines them into a single travel recommendation. That structure is deliberately different from overseas avalanche bulletins, because in the Australian Alps weather exposure, not avalanches, drives the greatest share of rescues.',
      { h: 'The three ratings' },
      { list: [
        'USUAL CAUTION — the standard care any equipped backcountry party should always apply. Not "safe": normal mountain rules.',
        'EXTRA CAUTION — one or more hazards are elevated. Choose conservative terrain, tighten navigation, keep reassessing.',
        'TRAVEL NOT RECOMMENDED — the combination of hazards is severe enough that staying out of the backcountry is the right call.'
      ] },
      { h: 'Why no “Extreme”?' },
      'Overseas services publish the five-level international danger scale (Low to Extreme). MSC instead scores each hazard individually and aggregates to its three travel tiers — so "Extreme" simply never appears here. Within the report, avalanche hazard is still described on the familiar Low / Moderate / Considerable / High ladder.',
      { note: 'Each elevation band (Alpine and Subalpine) gets its own score. Read both — the band you travel through is the one that matters.' }
    ],
    quiz: [
      { q: 'What drives the greatest share of backcountry rescues in the Australian Alps?',
        options: ['Avalanche burials', 'Weather exposure and hypothermia', 'Snake bites', 'Chairlift failures'],
        a: 1, why: 'MSC and NSW Parks both identify weather exposure as the leading cause of alpine rescues — which is why the day score weighs Exposure and Visibility as heavily as Avalanche.' },
      { q: '“Usual Caution” means…',
        options: ['The mountains are safe today', 'Normal backcountry care still applies', 'Only experts should travel', 'No hazards were assessed'],
        a: 1, why: 'Usual Caution is not a green light — it is the baseline care an equipped, informed party should always apply.' },
      { q: 'Why does the rating “Extreme” never appear in Australian reports?',
        options: ['Australian avalanches are impossible', 'MSC uses its own three-tier travel advice rather than the five-level international danger scale', 'It is reserved for Victoria only', 'The word is trademarked'],
        a: 1, why: 'MSC scores individual hazards and aggregates to Usual / Extra Caution and Travel Not Recommended, rather than publishing the international five-level scale.' }
    ],
    sources: 'Mountain Safety Collective (Australian Mountain Hazards); NPWS Alpine Safety'
  },

  {
    id: 'what-kills',
    group: 'Start here',
    icon: 'triangle',
    title: 'What actually hurts people here',
    summary: 'Exposure, slide-for-life, avalanche — the Australian risk ranking, with the evidence.',
    body: [
      'The Australian Alps kill differently from Canada or the Alps. Ranked by how often they actually hurt people here:',
      { h: '1 · Weather exposure' },
      'Wet, windy, near-zero conditions produce hypothermia fast, and whiteouts strip navigation. Exposure accounts for the greatest proportion of rescues in the Australian alpine area. It is usually a navigation failure first: parties separate or push on in cloud, then the cold does the rest — the pattern of the 1928 Seaman and Hayes deaths that Seaman’s Hut memorialises.',
      { h: '2 · Falls on firm snow — “slide-for-life”' },
      'Rime, frozen rain and melt-freeze crusts build genuinely bulletproof surfaces. A simple slip becomes an unstoppable accelerating slide into rocks, trees or over cliffs. This has killed skiers and walkers from Feathertop’s icy faces (as far back as Molly Hill, 1932) to Watsons Crags (2022). If the report says Firm or Icy, crampons and an ice axe — and the skill to self-arrest — are the mitigation, not confidence.',
      { h: '3 · Avalanche' },
      'Real but rare: Australia’s verified avalanche deaths are the 1956 Kunama Hütte event and two snowboarders on Mt Bogong in 2014, plus unconfirmed cornice-related deaths on Feathertop. Rare is not zero — wind slab terrain here is genuine avalanche terrain — but the local killer list puts ice and weather first.',
      { note: 'No agency publishes an aggregated Australian alpine fatality dataset — this ranking reflects the consistent qualitative evidence from MSC, NPWS and incident history rather than official statistics.' }
    ],
    quiz: [
      { q: 'The biggest single killer in the Australian backcountry historically is…',
        options: ['Avalanche', 'Weather exposure / hypothermia', 'Rockfall', 'Cornice collapse'],
        a: 1, why: 'Exposure events — usually triggered by weather changes and navigation failure — dominate Australian alpine rescues and fatalities.' },
      { q: 'The report says surface conditions are Icy. The right response is…',
        options: ['Softer boots for grip', 'Crampons, ice axe, and self-arrest skills — or different terrain', 'Travel faster to stay warm', 'Wait for afternoon and it will soften eventually'],
        a: 1, why: 'Firm-snow falls are Australia’s second killer. Steel points and an axe (with practised self-arrest) are the mitigation; timing helps but east faces can stay bulletproof all day in midwinter.' },
      { q: 'Verified avalanche deaths in Australia number…',
        options: ['None — it never happens', 'A handful — rare, but real', 'Dozens every season', 'Only in ski resorts'],
        a: 1, why: 'Three verified deaths (Kunama 1956, Mt Bogong 2014 ×2). Rare enough that people dismiss the hazard, real enough that they shouldn’t.' }
    ],
    sources: 'MSC Australian Mountain Hazards; NPWS; Kosciuszko Huts Association; coronial reporting'
  },

  {
    id: 'backcountry-tips',
    group: 'Start here',
    icon: 'book',
    title: 'Ten backcountry essentials',
    summary: 'The habits that keep Australian backcountry travellers alive.',
    body: [
      { list: [
        'Read the conditions report the morning you travel — not the night before.',
        'Tell someone where you’re going: lodge a trip intention form (NSW NPWS or VIC Police) and set a check-in time.',
        'Carry a Personal Locator Beacon (PLB). Phone coverage in the Alps is a rumour, not a plan.',
        'Dress for the wind chill, not the temperature. Carry a storm shell and insulation even on bluebird days.',
        'Navigate like the whiteout is coming — because it is. Map, compass, and a GPS track you know how to follow backwards.',
        'In avalanche terrain carry transceiver, shovel and probe — and train with them.',
        'Firm-snow tools (crampons, ice axe) and the skills to use them open the Main Range safely in winter.',
        'Know the daylight. Winter days are short; turn around early.',
        'Travel with company whose judgement you trust, and agree on decision points before you leave the carpark.',
        'The mountain is there next weekend. Turning around is a skill, not a failure.'
      ] }
    ],
    quiz: [
      { q: 'Your emergency comms plan for the Main Range should be…',
        options: ['A charged phone', 'A registered PLB, with the phone as backup', 'Yelling — sound carries in cold air', 'Checking in on social media'],
        a: 1, why: 'Mobile coverage in the Alps is patchy to non-existent. A PLB works everywhere, in any weather, with no network.' },
      { q: 'When should the party agree its turnaround time and decision points?',
        options: ['When conditions get bad', 'Before leaving the carpark', 'At the summit', 'Whoever is fittest decides en route'],
        a: 1, why: 'Decisions made in advance are made by your calm self. Decisions improvised in wind and cloud are made by the stressed one — that’s how the traps get you.' }
    ]
  },

  // ---------------- AVALANCHE FUNDAMENTALS ----------------
  {
    id: 'avalanche-problems',
    group: 'Avalanche fundamentals',
    icon: 'layers',
    title: 'The nine avalanche problems',
    summary: 'The international problem-type framework, and which problems Australia actually serves up.',
    body: [
      'Modern forecasting (the Conceptual Model of Avalanche Hazard, used by Avalanche Canada and forecasters worldwide) describes hazard by answering four questions: what type of avalanche problem exists, where it lives in the terrain, how likely it is to release, and how big it would be. Each problem type demands a different management response — that is the whole point of naming them.',
      { fig: 'slab-anatomy', caption: 'Slab avalanche anatomy: a cohesive slab releases on a weak layer, breaking away at the crown.' },
      { h: 'The problems, Australian edition' },
      { list: [
        'WIND SLAB — stiff wind-deposited snow on lee features. THE Australian problem: most local incidents involve wind slab on east–southeast aspects. Management: recognise and avoid fresh lee pockets below ridgelines and cornices, especially in the first days after loading.',
        'STORM SLAB — new snow that hasn’t bonded, most reactive during and 24–48 h after snowfall. Management: give storm snow its stabilisation window; back off steepness while it settles.',
        'CORNICE — overhanging wind-built snow that fails and can trigger the slope below. A first-class Australian problem — see the wind and cornices article.',
        'WET LOOSE — point-release sluffs in sun-softened snow, classic on spring afternoons. Management: timing — travel refrozen mornings, be off sun-affected steeps by early afternoon.',
        'WET SLAB — a slab failing on a layer weakened by melt or rain-on-snow. Management: avoid during rapid warming and rain events; refrozen mornings again.',
        'GLIDE — the whole snowpack creeping on smooth ground, releasing unpredictably. Spring feature above 1900 m here. Management: don’t linger under glide cracks; snowpack tests tell you nothing about them.',
        'PERSISTENT SLAB — a slab on buried surface hoar, facets or crusts that stays reactive for weeks. Rare in Australia’s melt-freeze snowpack but not absent: 2022 produced a genuine persistent weak layer season. Management: discipline — avoid the problem aspect/elevation entirely; don’t let a stable-feeling test talk you onto it.',
        'DEEP PERSISTENT SLAB — a thick hard slab over a weakness near the ground; hard to trigger, unsurvivable when you do. Essentially an inland-continental problem; almost never Australian.',
        'DRY LOOSE — cohesionless sluff from a point. Small, matters mainly when the terrain below is unforgiving.'
      ] },
      { note: 'The daily report names the active problems for each range. Match your terrain choices to the named problem — that is what the categorisation section is for.' }
    ],
    quiz: [
      { q: 'The most common avalanche problem in the Australian Alps is…',
        options: ['Deep persistent slab', 'Wind slab on lee (E–SE) features', 'Glide avalanches', 'Dry loose sluffs'],
        a: 1, why: 'Prevailing westerlies + open alpine terrain = wind slab on eastern lee features. Most Australian avalanche incidents fit this pattern.' },
      { q: 'How do you manage a persistent slab problem?',
        options: ['Dig a pit — if it looks stable, ride it', 'Avoid the named aspect and elevation entirely until the forecaster stands down the problem', 'Ski it one at a time', 'Wait 24 hours after the storm'],
        a: 1, why: 'Persistent problems produce misleadingly stable test results between cycles. The professional consensus: manage by avoidance, not by testing your luck.' },
      { q: 'Storm snow is generally most reactive…',
        options: ['A week after snowfall', 'During and 24–48 hours after the storm', 'Only at night', 'After a melt-freeze morning'],
        a: 1, why: 'New snow needs time to bond. The first day or two after loading is the high-reactivity window for storm and wind slabs.' }
    ],
    sources: 'Statham et al. 2018 (Conceptual Model of Avalanche Hazard); avalanche.ca; MSC seasonal reporting'
  },

  {
    id: 'terrain',
    group: 'Avalanche fundamentals',
    icon: 'mountain',
    title: 'Reading terrain: angle, traps, ATES',
    summary: 'Slope angle, terrain traps, and the five-class terrain scale used for trip planning.',
    body: [
      { h: 'Slope angle' },
      { fig: 'slope-angle', caption: 'Slab avalanches release mostly between 30° and 45°. Measure the steepest section, not the average.' },
      'Most slab avalanches release on slopes of 30–45°, with the sweet spot around 35–40°. Below 25° slides are rare (though runout from above still reaches you); above 45–50° snow tends to sluff off before slabs build. An inclinometer (or phone app used carefully) beats eyeballing — people consistently underestimate steepness.',
      { h: 'Terrain traps' },
      { fig: 'terrain-trap', caption: 'The same small slide: shallow spread on an open runout, metres-deep burial in a gully.' },
      'A terrain trap is anything that multiplies the consequence of a slide: gullies and creek lines that concentrate debris into deep burials, cliffs and rock bands that turn a slide into a fall, trees that turn moving snow into trauma. Australian classics: creek lines under lee slopes (the 2022 Twin Humps slide ran into Leatherbarrel Creek) and the chute-over-rocks architecture of Watsons Crags. Always ask: if this slides — or if I simply slip — where do I end up?',
      { h: 'ATES: grading terrain like runs' },
      'The Avalanche Terrain Exposure Scale (version 2, 2023) grades terrain itself, independent of today’s conditions, in five classes: 0 Non-avalanche, 1 Simple, 2 Challenging, 3 Complex, 4 Extreme. Simple terrain has options to avoid avalanche paths entirely; Complex terrain forces exposure to multiple overlapping paths. The planning logic of the Canadian Avaluator: cross today’s danger with the terrain class — elevated danger plus Challenging-or-harder terrain is the “extra caution / not recommended” zone. Same logic works with the MSC day score.',
      { note: 'Australia has no official ATES maps yet — grade the terrain yourself from the map before you go: where are the 30°+ slopes, what is above you, what is below you?' }
    ],
    quiz: [
      { q: 'The prime slope angle band for slab avalanches is…',
        options: ['15–25°', '30–45°', '50–60°', 'Any angle equally'],
        a: 1, why: 'Below ~25° slabs rarely release; above ~45° snow sluffs before deep slabs form. 30–45° — prime skiing pitch — is exactly the danger band.' },
      { q: 'A terrain trap is…',
        options: ['A crevasse', 'Any feature that multiplies the consequences of a slide or fall — gullies, cliffs, creeks, trees', 'A closed resort area', 'A slope steeper than 45°'],
        a: 1, why: 'The slide is only half the equation. A small slide into a creek-line burial or over a rock band is a fatality; the same slide on an open fan is a story.' },
      { q: 'In ATES v2, “Simple” (class 1) terrain means…',
        options: ['No snow', 'Exposure to avalanche paths can be avoided with route choice', 'Beginner ski runs', 'Terrain below 1500 m'],
        a: 1, why: 'Simple terrain offers well-defined options to stay clear of avalanche paths — the terrain you choose when conditions are uncertain or elevated.' }
    ],
    sources: 'Statham & Campbell, ATES v2 (ISSW 2023 / NHESS 2025); Avaluator 2.0, avalanche.ca'
  },

  {
    id: 'wind-cornices',
    group: 'Avalanche fundamentals',
    icon: 'wind',
    title: 'Wind, slabs and cornices',
    summary: 'Westerly loading, east-facing lee features, and the cornice lines of the Main Range.',
    body: [
      'If Australia has one snowpack story, it is wind. A shallow maritime snowpack raked by prevailing west–northwesterlies means windward slopes scour to ice while lee slopes — east through southeast — collect dense slabs and grow cornices. The Main Range’s glacial cirques (Blue Lake, Club Lake, the Twynam–Watsons Crags headwalls) sit exactly under these loaded aspects: treat their rims as loading zones and their floors as overhead-hazard zones.',
      { fig: 'wind-loading', caption: 'Westerly wind scours the windward side firm and builds slab + cornice on the E–SE lee.' },
      { h: 'Cornices' },
      { fig: 'cornice-line', caption: 'The fracture line sits back from the visible edge — solid-feeling snow can be overhung air.' },
      'Cornices are wind-built overhangs along ridgelines. Two rules: from above, stay several metres back from the edge — they fracture further back than they look, over nothing. From below, minimise time under them; a cornice fall is both a hit and a potential trigger for the slope it lands on. They are touchiest when freshly formed and during rapid warming or storms.',
      { h: 'The 1956 lesson' },
      'Australia’s canonical avalanche — the Kunama Hütte disaster — was a cornice/slab release off Mt Clarke after heavy dry snow arrived on a southeasterly: an unusual loading direction that built slab on slopes that don’t usually carry it. The lesson survives: read where this storm’s wind actually loaded, not where storms usually load.',
      { note: 'Fresh lee loading + a slope steep enough to slide + a terrain trap below is the standard Australian incident recipe. Any two of the three should slow you down.' }
    ],
    quiz: [
      { q: 'In the Australian Alps, wind slab typically builds on which aspects?',
        options: ['West-facing (into the wind)', 'East to southeast (lee of the prevailing westerlies)', 'North only', 'Wind doesn’t affect slab formation'],
        a: 1, why: 'Prevailing W–NW winds scour windward faces and deposit dense slab on E–SE lee features — sub-ridge rolls, gully walls, cirque headwalls.' },
      { q: 'Cornices are most likely to fail…',
        options: ['On cold clear mornings', 'When freshly formed, and during rapid warming or storms', 'Only in spring', 'When someone yells near them'],
        a: 1, why: 'New cornices are weakest, and warming or storm loading stresses them further. Kunama (1956) fell during a heavy storm on an unusual wind.' },
      { q: 'Travelling a corniced ridgeline in cloud, you should…',
        options: ['Follow the very edge — best snow', 'Stay several metres back: the fracture line sits behind the visible edge', 'Rope up to the person in front', 'Move fast along the lip'],
        a: 1, why: 'Cornices break further back than they appear, and in flat light you cannot see where snow ends and overhang begins. Distance is the only defence.' }
    ],
    sources: 'MSC Australian Mountain Hazards; Australian Ski Year Book 1957 (Kunama); Wild magazine 2022 season review'
  },

  // ---------------- DECISION-MAKING ----------------
  {
    id: 'daily-process',
    group: 'Decision-making',
    icon: 'clock',
    title: 'Plan, travel, debrief',
    summary: 'The daily process taught in avalanche courses, adapted to the MSC report.',
    body: [
      'Good backcountry decisions are a workflow, not a vibe. The process taught in Avalanche Skills Training, adapted to Australia:',
      { h: '1 · Plan (at home)' },
      { list: [
        'Read today’s report: day score, both elevation bands, the named problems.',
        'Choose terrain that matches conditions — the Avaluator logic: elevated conditions + complex terrain = pick different terrain.',
        'Plan the route to slope scale, with escape options and a poor-visibility navigation plan you could follow on instruments alone.',
        'Pre-agree decision points: named places where you will stop and explicitly decide to continue or turn.'
      ] },
      { h: '2 · Travel' },
      { list: [
        'Expose one person at a time on suspect slopes; the rest watch from safe ground.',
        'Regroup only in genuinely safe spots — not mid-slope, not under cornices.',
        'Keep evaluating: is what you see matching what the report said? Wind effect, new loading, softening surfaces.',
        'At each decision point: everyone states their view, every concern gets voiced, and any member’s veto is respected. No negotiation, no scorekeeping.'
      ] },
      { h: '3 · Debrief' },
      'Five minutes at the car: what did we see, what surprised us, what would we do differently? This is how single seasons turn into experience — and it is exactly what the observer accounts in this app are for.',
      { note: 'Default rule when information is missing or the party disagrees: in doubt means the terrain is closed. The mountain is there next weekend.' }
    ],
    quiz: [
      { q: 'Why cross a suspect slope one at a time?',
        options: ['It’s faster overall', 'Only one person is exposed if it slides — and everyone else is a rescuer, not a victim', 'It preserves the snow', 'Tradition'],
        a: 1, why: 'One-at-a-time caps the consequence: a single burial with a full rescue team watching beats a party-wide burial with nobody left to dig.' },
      { q: 'When should decision points be agreed?',
        options: ['At the decision point itself', 'In the plan, before you leave', 'Only if weather turns', 'The leader decides silently'],
        a: 1, why: 'Pre-agreed decision points are the structural defence against summit fever and momentum — the decision is half-made before the pressure arrives.' },
      { q: 'A party member says they’re not comfortable with the slope. The rule is…',
        options: ['Majority vote', 'The most experienced person decides', 'Their veto is respected — the party takes the alternative', 'They can wait while others ride it'],
        a: 2, why: 'Modern group-decision doctrine: any member’s veto is honoured without negotiation. Splitting the party converts one problem into two.' }
    ],
    sources: 'Avalanche Canada AST curriculum; Avaluator 2.0; AIARE decision-making framework'
  },

  {
    id: 'human-factors',
    group: 'Decision-making',
    icon: 'eye',
    title: 'The traps in your head',
    summary: 'FACETS — six heuristic traps found in hundreds of accidents — and the structural defences.',
    body: [
      'Most avalanche victims were not ignorant: analysis of 715 US accidents found parties with training walked into hazard they could recognise. The mind takes shortcuts; in avalanche terrain the shortcuts have names — FACETS:',
      { list: [
        'FAMILIARITY — “I’ve ridden this bowl every winter.” Familiar terrain feels safer than it is; the slope doesn’t remember you.',
        'ACCEPTANCE — riding harder lines to be valued by the group. Applies to everyone, documented strongly in mixed groups.',
        'COMMITMENT — the objective was set at 6 am, so it gets pursued at 2 pm in different conditions. Plans should expire when conditions change.',
        'EXPERT HALO — “She’s done a course / he’s local, they’ll notice if it’s dodgy.” Unspoken delegation to an informal leader who may be assuming the same about you.',
        'TRACKS / SCARCITY — first fresh snow in weeks and the powder panic of a short Australian season. Competition for untracked snow is a documented accident driver.',
        'SOCIAL FACILITATION — other tracks on the slope, other parties around: everyone’s risk tolerance quietly rises. Tracks are evidence someone got away with it, not that it’s stable.'
      ] },
      { h: 'The defence is structure, not willpower' },
      'You cannot think your way out of a bias while it is operating — the defences are procedural: pre-agreed decision points, stating decisions out loud so silence never passes for agreement, genuinely voicing every concern, and honouring any member’s veto. If you notice a FACETS letter in your own reasoning (“it’ll be fine, there are tracks everywhere”), that is the cue to stop and run the slope through the process properly.',
      { note: 'The short, fickle Australian season concentrates scarcity pressure: when the one good weekend in a month coincides with fresh lee loading, that is precisely when the traps bite hardest.' }
    ],
    quiz: [
      { q: 'The “expert halo” trap is…',
        options: ['Wearing a helmet', 'Deferring safety judgement to an informal leader who may not have decided anything', 'Hiring a guide', 'Overconfidence after a course'],
        a: 1, why: 'Groups quietly delegate vigilance to whoever seems most expert — who is often navigating, taking photos, or assuming someone else is watching.' },
      { q: 'Existing tracks on a slope tell you…',
        options: ['The slope is stable', 'Someone got away with it — nothing more', 'The snowpack has been tested', 'It’s within resort boundaries'],
        a: 1, why: 'Tracks are social proof, not stability data. Slopes are regularly triggered by the fifth or tenth rider, not the first.' },
      { q: 'The most reliable defence against heuristic traps is…',
        options: ['Experience — eventually you stop being biased', 'Structured process: pre-agreed decision points, spoken decisions, respected vetoes', 'Travelling alone so nobody pressures you', 'Memorising the FACETS acronym'],
        a: 1, why: 'Bias is not curable by awareness alone — accident records are full of experts. Procedure catches what confidence misses.' }
    ],
    sources: 'McCammon 2003/2004 (FACETS); AIARE fieldbook; avalanche.org decision-making'
  },

  {
    id: 'trip-plan',
    group: 'Decision-making',
    icon: 'report',
    title: 'Trip plan checklist',
    summary: 'The pre-departure run-through, in order.',
    body: [
      { list: [
        'Today’s conditions report read and understood — day score, both elevation bands, named problems.',
        'Route planned to slope scale with escape options, on a map that works offline. Poor-visibility plan included.',
        'Trip intention form lodged and a home contact briefed with your check-in time.',
        'PLB carried and registered. Phone charged, in a warm pocket, on low power.',
        'Storm shell, insulation, gloves, goggles — for the forecast wind chill, not the carpark weather.',
        'Avalanche kit (transceiver / shovel / probe) if travelling in or under steep snow terrain — checked, batteries confirmed, switched on at the trailhead.',
        'Firm-snow gear (crampons, ice axe) if surfaces are Firm or Icy in the report.',
        'Food, water, headtorch, first aid, emergency shelter.',
        'Decision points and turnaround time agreed out loud with the whole party.'
      ] }
    ]
  },

  // ---------------- RESCUE ----------------
  {
    id: 'companion-rescue',
    group: 'Rescue',
    icon: 'cross',
    title: 'Companion rescue: the ten-minute problem',
    summary: 'Burial survival collapses after ~10 minutes. In Australia, the rescue is your party or nobody.',
    body: [
      'The modern survival data (four decades of Swiss burials, updated 2023) is blunt: dig a critically buried person out within about ten minutes and survival exceeds 90%. After that, asphyxia takes over — roughly two-thirds of fully buried victims die of it in the following twenty minutes. The teaching number used to be fifteen to eighteen minutes; it is now ten.',
      { fig: 'survival-curve', caption: 'Survival vs burial time. The window is ~10 minutes — organised rescue arrives in hours.' },
      'For Australia the implication is absolute. There is no helicopter avalanche-rescue culture here; organised rescue is hours away across snowbound terrain. The people on the slope when it happens are the entire rescue.',
      { h: 'The sequence' },
      { fig: 'rescue-seq', caption: 'Safety check → signal → coarse → fine → probe → strategic dig. Rehearse until it is one motion.' },
      { list: [
        'STOP — watch the victim to their last-seen point. Count heads. One person leads.',
        'SAFETY — is more slope hanging above? Rescuers who become victims rescue nobody.',
        'SIGNAL — every rescuer to SEARCH mode immediately; one transmitting phone-pocket transceiver wrecks the search. Sweep below the last-seen point in 40 m strips.',
        'COARSE — first signal: follow the arrow and falling numbers at a run.',
        'FINE — transceiver on the snow surface, bracket to the lowest reading. Slow and precise beats fast and sloppy here.',
        'PROBE — spiral outward at 25 cm spacing, probe perpendicular to the surface. On a strike: LEAVE IT IN — it is your guide to the victim.',
        'DIG — strategically: start about 1.5× burial depth downhill of the probe, dig inward not downward, throw snow to the sides. Multiple diggers form a V and rotate the lead every minute or two. Reach the face first, clear the airway, then free the chest.'
      ] },
      { note: 'Call 000 in parallel if you have hands spare; dig first if you don’t. Hypothermia care after extrication: gentle handling, insulation from the snow, shelter.' }
    ],
    quiz: [
      { q: 'The survival window for a critical avalanche burial is about…',
        options: ['An hour', 'Ten minutes', 'Thirty minutes', 'Five hours if they have an airbag'],
        a: 1, why: 'Over 90% survive extrication inside ~10 minutes; survival then falls off a cliff as asphyxia sets in. The old “15–18 minutes” has been revised down.' },
      { q: 'First actions when a partner is caught…',
        options: ['Ski down at once', 'Watch them to the last-seen point, check for hang-fire, then everyone to SEARCH mode', 'Call 000 and wait', 'Send the fastest person for help'],
        a: 1, why: 'The last-seen point halves the search area; the hang-fire check keeps rescuers alive; and a rescuer still transmitting sabotages every other searcher.' },
      { q: 'You get a probe strike. You should…',
        options: ['Pull it out and start digging where it was', 'Leave the probe in and start digging ~1.5× burial depth downhill of it', 'Probe more to be sure', 'Mark it and continue searching for a better spot'],
        a: 1, why: 'The probe stays in as the physical guide. Digging from downhill and inward reaches the victim without collapsing snow onto their air pocket.' },
      { q: 'Why does everyone switch their transceiver to SEARCH?',
        options: ['To save battery', 'A transmitting rescuer’s signal is indistinguishable from the victim’s', 'It’s louder', 'Only the leader needs to search'],
        a: 1, why: 'Searchers home on the strongest transmit signal — if that’s a rescuer’s pocket, the search chases the wrong person while the victim suffocates.' }
    ],
    sources: 'Rauch/Brugger et al. (JAMA Netw Open, Swiss data 1981–2020); avalanche.org companion rescue & strategic shovelling'
  },

  {
    id: 'atc',
    group: 'Rescue',
    icon: 'binoculars',
    title: 'Avalanche Training Centres',
    summary: 'Free transceiver practice parks at Mt Hotham and Thredbo.',
    body: [
      'MSC operates two Avalanche Training Centres (ATCs) — permanent transceiver training parks with buried targets where you can practise companion rescue for free.',
      { list: [
        'MT HOTHAM (VIC): on Machinery Spur, accessed from the Mt Loch carpark.',
        'THREDBO (NSW): above the Supertrail, near the top of the Basin T-Bar.'
      ] },
      'A rescue you’ve rehearsed is minutes faster than one you haven’t — and with a ten-minute survival window, minutes are the whole game. Run a full search drill each season before you need it: signal to strike to airway, against a watch.',
      { note: 'Good session structure: one single burial for time, one deep burial for shovelling technique, one two-burial problem for signal separation.' }
    ]
  },

  // ---------------- CASE STUDIES ----------------
  {
    id: 'history',
    group: 'Case studies',
    icon: 'clock',
    title: 'A century of Australian incidents',
    summary: 'Seaman & Hayes to Watsons Crags — what the record actually teaches.',
    body: [
      'Australia’s alpine incident record is short but consistent — the same lessons recur for a hundred years.',
      { h: '1928 — Seaman & Hayes, Kosciuszko' },
      'Laurie Seaman and Evan Hayes became separated near the summit in deteriorating weather; both died of exposure. Seaman was found near Etheridge Ridge in September, Hayes the following summer. Seaman’s Hut was built as their memorial. Lesson: separation plus weather is the classic Australian fatality; the party that stays together, navigates together.',
      { h: '1932 — Molly Hill, Razorback (Feathertop)' },
      'Slipped on ice descending toward Federation Hut area, slid ~60 m into a tree; died of head injuries — likely Victoria’s first ski fatality. Lesson: slide-for-life is not a modern discovery; icy Australian surfaces have killed since skiing began here.',
      { h: '1956 — Kunama Hütte, Mt Clarke' },
      'At 7:20 am on 12 July an avalanche released off Mt Clarke and destroyed the Kunama lodge, killing Roslyn Wesche. Heavy dry snow on a southeasterly — an unusual loading direction — had built slab and cornice above a hard icy bed surface. Lesson: read where this storm loaded, not where storms usually load; and buildings are not immune (nor are camps below lee slopes).',
      { h: '1999 — snow cave, Lake Albina' },
      'Four snowboarders left Thredbo’s top station for the Racecourse Gully–Lake Albina area; a gale-force storm arrived overnight and their snow cave’s entrance drifted shut. All four suffocated; they were found in November. The coroner’s recommendation: snow shelters must keep a maintained aperture to open air, watched through the night. Lesson: in Australian storms the shelter itself can become the hazard; ventilation is a life-support system.',
      { h: '2014 — Mt Bogong avalanche' },
      'Two experienced snowboarders, Martin Buckland and Daniel Kerr, were killed in an avalanche after ascending via Eskdale Spur. Australia’s most recent avalanche deaths, and a driving event behind the founding of Mountain Safety Collective. Lesson: Victorian terrain avalanches too; experience is not exemption.',
      { h: '2022 — Watsons Crags' },
      'A 24-year-old Canberra skier died in a fall down an icy chute — injuries consistent with a fall from height, in classic slide-for-life terrain over rocks and fast water. Lesson: the Crags’ architecture (steep, icy, cliff-and-creek trapped) turns any slip terminal; firm-snow tools and route discipline are non-negotiable there.',
      { h: '2022 — the persistent-layer season' },
      'The same winter produced a rare Australian persistent weak layer, with slides at Sentinel Ridge, Twin Humps (running into Leatherbarrel Creek) and a crown at Hotham’s Blow Hole. Lesson: “Australia doesn’t get persistent problems” is a rule of thumb, not a law — when the report names one, the avoidance discipline applies here too.',
      { note: 'Pattern across a century: weather + separation, ice + terrain traps, unusual loading, and shelters without ventilation. Avalanches are on the list — but they share it.' }
    ],
    quiz: [
      { q: 'The Kunama Hütte avalanche (1956) released after heavy snow on a southeasterly wind. The enduring lesson:',
        options: ['South-east winds are always dangerous', 'Assess where this storm actually loaded, not where storms usually load', 'Lodges should be built of stone', 'Avalanches only happen in July'],
        a: 1, why: 'The fatal slab built on an unusual loading direction — slopes that don’t usually carry slab did that week. The habit that generalises: read each storm’s wind on its own terms.' },
      { q: 'The 1999 Lake Albina party died in their snow cave because…',
        options: ['It collapsed', 'The entrance drifted shut and they suffocated', 'Hypothermia despite good ventilation', 'An avalanche buried the cave'],
        a: 1, why: 'The coronial finding was accidental suffocation after the entrance was buried by the storm — hence the standing rule: a snow shelter needs a maintained, watched air aperture.' },
      { q: 'What does the 2022 season add to the “Australian avalanche problems” picture?',
        options: ['Nothing — it was a normal year', 'Persistent weak layers can occur here, and demand the same avoidance discipline as overseas', 'Avalanches only occur in NSW', 'Glide cracks are the main local killer'],
        a: 1, why: 'A rare persistent layer produced multiple significant slides. Rules of thumb about the “benign” Australian snowpack have exceptions — the report tells you when.' }
    ],
    sources: 'Perisher Historical Society; Kosciuszko Huts Association / Australian Ski Year Book 1957; Australian Alpine Club; BSAR; coronial reporting; Wild magazine'
  },

  // ---------------- REFERENCE ----------------
  {
    id: 'guides',
    group: 'Reference',
    icon: 'external',
    title: 'Guides & courses',
    summary: 'MSC’s Alpine Guiding Partners for avalanche and backcountry training.',
    body: [
      'Formal training beats trial and error. MSC partners with accredited operators across the Alps:',
      'Alpine Access Australia · Avalanche Training Australia · Blizzard Academy · K7 Adventures · The Climbing Company · Thredbo Backcountry Tours · Australian School of Mountaineering · Survive First Aid.',
      'Start with an AST1 (Avalanche Skills Training 1) course, then build with guided days in terrain a notch above what you’d choose alone. Add a firm-snow skills day (crampons, axe, self-arrest) — in Australia it is at least as life-saving as the avalanche course.'
    ]
  }
];

const SAFETY_LINKS = {
  emergency: [
    { label: 'Call Triple Zero (000)', tel: '000', note: 'Police coordinate alpine search & rescue in NSW and VIC. Ask for Police.' },
    { label: '112 — mobile alternative', tel: '112', note: 'Works on any mobile network with any signal, even without your carrier.' }
  ],
  tripIntention: [
    { label: 'NSW trip intention form (NPWS)', url: 'https://bookings.nationalparks.nsw.gov.au/mybookings/trips/intention' },
    { label: 'VIC outdoor safety & trip plans (VicPol)', url: 'https://www.police.vic.gov.au/outdoor-and-bush-safety' }
  ],
  msc: [
    { label: 'Live conditions reports', url: 'https://reports.mountainsafetycollective.org/main-range' },
    { label: 'Submit a public observation', url: 'https://forms.gle/CXabbENhVmuLfdga6' },
    { label: 'Become an MSC member ($50/yr)', url: 'https://mountainsafetycollective.org/membership' },
    { label: 'MSC blog', url: 'https://mountainsafetycollective.org/blog' },
    { label: 'MSC on YouTube', url: 'https://www.youtube.com/channel/UCnqIbssyBn7QDnySaMXPaJA' },
    { label: 'Instagram @mountain_safety_collective', url: 'https://www.instagram.com/mountain_safety_collective' },
    { label: 'Facebook — Mountain Safety Collective', url: 'https://www.facebook.com/mountainsafetycollective' }
  ]
};

const RESCUE_STEPS = [
  { title: 'Stop. Look. Shout.', body: 'Watch the victim’s last seen point. Count heads. Appoint a leader.' },
  { title: 'Assess danger', body: 'Is more of the slope hanging above you? Only enter if it’s safe for rescuers.' },
  { title: 'Transceivers to SEARCH', body: 'Every rescuer switches to search mode — a transmitting rescuer wrecks the search.' },
  { title: 'Signal search', body: 'Sweep from last seen point downhill, 40 m swaths, moving fast.' },
  { title: 'Fine search & probe', body: 'Bracket to the lowest distance reading, then probe in a spiral. Leave the probe in on a strike.' },
  { title: 'Strategic digging', body: 'Start downhill of the probe, 1.5× burial depth back. Clear the airway first.' },
  { title: 'Call 000 when hands allow', body: 'Burial survival is minutes — dig first if you’re shorthanded, call in parallel if not.' }
];
