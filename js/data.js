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

const REGIONS = [
  { id: 'main-range',     apiRange: 1, name: 'NSW Main Range',     area: 'Kosciuszko National Park, NSW' },
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
    bands: {
      alpine: {
        dangers: { exposure: 'Severe', visibility: 'Poor', surface: 'Icy', avalanche: 'Moderate' },
        travel: [
          'Wind chill near -20°C on exposed ridgelines — cover all skin and keep moving or get below the ridge.',
          'Firm, icy surfaces on S–SE aspects; ski crampons or boot crampons and an ice axe are appropriate.',
          'Wind slabs building in lee features (E–SE) through the afternoon — avoid convex rolls above terrain traps.',
          'Navigation will be demanding after 15:00; have a compass bearing home before the cloud drops.'
        ]
      },
      subalpine: {
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
    bands: {
      alpine: {
        dangers: { exposure: 'Notable', visibility: 'Good', surface: 'Firm', avalanche: 'Low' },
        travel: [
          'Morning surfaces are firm — time descents for afternoon softening on sunny aspects.',
          'Cornices remain along E-facing ridgelines from last week’s storm; give edges a wide berth.',
          'Weather deteriorates overnight — be off high ground by dark.'
        ]
      },
      subalpine: {
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

const LEARN_TOPICS = [
  {
    id: 'day-score',
    title: 'How the MSC day score works',
    summary: 'Usual Caution, Extra Caution, Travel Not Recommended — what the three ratings mean.',
    body: [
      'MSC rates each day across four hazard categories — Exposure, Visibility, Surface and Avalanche — then combines them into a single day score. This differs from overseas services because in Australia, weather exposure (not avalanches) is the leading killer in the mountains.',
      'USUAL CAUTION: the standard care any equipped backcountry party should always apply.',
      'EXTRA CAUTION: one or more hazards are elevated. Choose conservative terrain, tighten navigation, and keep reassessing.',
      'TRAVEL NOT RECOMMENDED: the combination of hazards is severe enough that staying out of the backcountry is the right call.',
      'Avalanche hazard within the report uses the international scale — Low, Moderate, Considerable, High. Extreme is deliberately not used in Australia.'
    ]
  },
  {
    id: 'backcountry-tips',
    title: 'Ten backcountry essentials',
    summary: 'The habits that keep Australian backcountry travellers alive.',
    body: [
      '1. Read the conditions report the morning you travel — not the night before.',
      '2. Tell someone where you’re going: lodge a trip intention form (NSW NPWS or VIC Police) and set a check-in time.',
      '3. Carry a Personal Locator Beacon (PLB). Phone coverage in the Alps is a rumour, not a plan.',
      '4. Dress for the wind chill, not the temperature. Carry a storm shell and insulation even on bluebird days.',
      '5. Navigate like the whiteout is coming — because it is. Map, compass, and a GPS track you know how to follow backwards.',
      '6. In avalanche terrain carry transceiver, shovel and probe — and train with them.',
      '7. Firm-snow tools (crampons, ice axe) and the skills to use them open the Main Range safely in winter.',
      '8. Know the daylight. Winter days are short; turn around early.',
      '9. Travel with company whose judgement you trust, and agree on decision points before you leave the carpark.',
      '10. The mountain is there next weekend. Turning around is a skill, not a failure.'
    ]
  },
  {
    id: 'avalanche-problems',
    title: 'Avalanche problems in the Australian Alps',
    summary: 'Wind slab, storm slab, cornice fall and the melt-freeze cycle.',
    body: [
      'WIND SLAB — the classic Australian problem. Strong westerlies load E–SE lee features: sub-ridge rolls, gully walls, cornice aprons. Most Australian avalanche incidents involve wind slab in these features.',
      'STORM SLAB — new snow that hasn’t bonded, most reactive during and in the 24–48 hours after snowfall, especially on a refrozen crust.',
      'CORNICE FALL — cornices build large along the Main Range and Victorian high ridgelines. They fail in warming and can trigger slopes below. Give edges several metres — they break further back than you think.',
      'MELT-FREEZE / WET SNOW — spring cycles produce wet loose avalanches on sun-affected slopes in the afternoon. Timing is the mitigation: firm morning, soft midday, off by mid-afternoon.'
    ]
  },
  {
    id: 'atc',
    title: 'Avalanche Training Centres',
    summary: 'Free transceiver practice parks at Mt Hotham and Thredbo.',
    body: [
      'MSC operates two Avalanche Training Centres (ATCs) — permanent transceiver training parks with buried targets where you can practise companion rescue for free.',
      'MT HOTHAM (VIC): on Machinery Spur, accessed from the Mt Loch carpark.',
      'THREDBO (NSW): above the Supertrail, near the top of the Basin T-Bar.',
      'A rescue you’ve rehearsed is minutes faster than one you haven’t — and burial survival is measured in minutes. Run a full search drill each season before you need it.'
    ]
  },
  {
    id: 'trip-plan',
    title: 'Trip plan checklist',
    summary: 'The pre-departure run-through, in order.',
    body: [
      '1. Today’s conditions report read and understood — day score, both elevation bands.',
      '2. Route planned with escape options, marked on a map that works offline.',
      '3. Trip intention form lodged and a home contact briefed with your check-in time.',
      '4. PLB carried and registered. Phone charged, in a warm pocket, on low power.',
      '5. Storm shell, insulation, gloves, goggles — for the forecast wind chill, not the carpark weather.',
      '6. Avalanche kit (transceiver / shovel / probe) if travelling in or under steep snow terrain — checked and switched on.',
      '7. Firm-snow gear if surfaces are Firm or Icy in the report.',
      '8. Food, water, headtorch, first aid, emergency shelter.',
      '9. Turnaround time agreed out loud with the whole party.'
    ]
  },
  {
    id: 'guides',
    title: 'Guides & courses',
    summary: 'MSC’s Alpine Guiding Partners for avalanche and backcountry training.',
    body: [
      'Formal training beats trial and error. MSC partners with accredited operators across the Alps:',
      'Alpine Access Australia · Avalanche Training Australia · Blizzard Academy · K7 Adventures · The Climbing Company · Thredbo Backcountry Tours · Australian School of Mountaineering · Survive First Aid.',
      'Start with an AST1 (Avalanche Skills Training 1) course, then build with guided days in terrain a notch above what you’d choose alone.'
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
    { label: 'Instagram @mountain_safety_collective', url: 'https://www.instagram.com/mountain_safety_collective' }
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
