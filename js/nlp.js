(function (global) {
  'use strict';

  /* ---------------- types & colours ---------------- */
  const TYPES = {
    term:       { label: 'Term',              color: '#E63946' },
    definition: { label: 'Definition',        color: '#457B9D' },
    member:     { label: 'Member of a Group', color: '#2A9D8F' },
    value:      { label: 'Value / Number',    color: '#F4A261' },
    person:     { label: 'Name / Person',     color: '#9B5DE5' },
    substance:  { label: 'Name / Substance',  color: '#00B4D8' },
    structure:  { label: 'Name / Structure',  color: '#6C757D' },
    concept:    { label: 'Name / Concept',    color: '#7B2CBF' },
    plant:      { label: 'Name / Plant',      color: '#70AD47' },
    creature:   { label: 'Name / Creature',   color: '#F15BB5' },
    food:       { label: 'Name / Food',       color: '#E9C46A' },
    label:      { label: 'Label',             color: '#ADB5BD' },
    quote:      { label: 'Quotation',         color: '#FF6B6B' }
  };
  const TEAL = TYPES.member.color;

  /* ---------------- helpers ---------------- */
  const wc = s => (s.trim() ? s.trim().split(/\s+/).length : 0);
  const capFirst = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const bare = w => w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  const strip = s => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]+/g, ' ').replace(/\s+/g, ' ').trim();

  const STOP = new Set(('a an the of in on at to for with by from and or but as is are was were be been being that which who whom whose ' +
    'it its this these those they their them he she his her we our you your i my there here also then than into onto over under about ' +
    'can could will would shall should may might must do does did has have had very just such so if when while because although though ' +
    'however thus therefore both each other some any many much more most like through across between among during within without per via ' +
    'upon toward towards against along around behind beyond near').split(' '));

  /* ---------------- lexicons (rule-based "knowledge") ---------------- */
  const LEX = new Map();
  const addLex = (type, list) => list.split(/\s+/).forEach(w => { if (w && !LEX.has(w)) LEX.set(w, type); });

  addLex('plant', 'plant tree flower shrub vine herb weed seedling sapling conifer oak pine maple birch willow palm bamboo fern moss grass rose tulip lily orchid daisy sunflower cactus ivy algae wheat barley oat soybean cotton tobacco lotus jasmine lavender basil cedar elm eucalyptus seaweed crop');
  addLex('creature', 'animal dog cat horse cow pig sheep goat chicken duck rabbit mouse rat lion tiger wolf fox deer elephant giraffe monkey ape gorilla whale dolphin shark fish salmon trout frog toad snake lizard turtle crocodile bird eagle owl sparrow penguin bee ant butterfly spider beetle mosquito worm dinosaur camel zebra kangaroo panda otter octopus squid crab lobster snail bacteria bacterium mammal reptile amphibian insect predator');
  addLex('food', 'food bread rice pasta noodle cheese milk butter egg meat beef pork apple banana orange grape mango tomato potato carrot onion garlic lettuce spinach broccoli bean nut almond peanut honey sugar chocolate cake cookie pizza soup salad sandwich burger coffee tea juice wine beer yogurt fruit vegetable cereal flour');
  addLex('substance', 'water oxygen hydrogen carbon nitrogen helium sodium chlorine calcium iron gold silver copper zinc mercury sulfur sulphur phosphorus potassium magnesium aluminum aluminium lithium uranium plutonium silicon neon argon methane ethanol glucose fructose insulin protein enzyme hormone dna rna atp vitamin acid alkali salt oil plastic steel alloy oxide ozone ammonia hemoglobin haemoglobin chlorophyll cholesterol caffeine penicillin aspirin antibiotic vaccine toxin venom polymer mineral metal gas liquid ion molecule pigment fuel');
  addLex('structure', 'cell nucleus membrane mitochondria mitochondrion chloroplast ribosome organ heart lung liver kidney brain skin bone muscle tissue neuron artery vein stomach intestine eye ear nose tooth skeleton wall bridge tower building castle temple pyramid dam tunnel cathedral mosque palace stadium museum library university leaf root petal seed trunk cortex vacuole cytoplasm atom crystal planet star galaxy moon continent mountain river ocean sea lake volcano island desert valley canyon earth sun mars venus jupiter saturn neptune uranus');

  const PHRASES = {
    'carbon dioxide': 'substance', 'sulfuric acid': 'substance', 'hydrochloric acid': 'substance',
    'nitric acid': 'substance', 'amino acid': 'substance', 'fatty acid': 'substance',
    'red blood cell': 'structure', 'white blood cell': 'structure', 'blood cell': 'structure',
    'cell membrane': 'structure', 'cell wall': 'structure', 'black hole': 'structure',
    'solar system': 'structure', 'sweet potato': 'food', 'olive oil': 'food'
  };

  const FIRST = new Set(('james john robert michael william david richard joseph thomas charles mary patricia jennifer linda elizabeth barbara susan jessica sarah karen nancy lisa margaret sandra ashley emily donna michelle carol amanda melissa deborah stephanie rebecca laura sharon cynthia kathleen amy angela anna ruth brenda pamela nicole katherine samantha christine helen emma olivia sophia isabella ava mia charlotte amelia peter paul george henry edward albert isaac nikola marie pierre rosalind maria jose juan carlos luis pedro miguel antonio francisco ana andres emilio ferdinand benigno corazon gregorio apolinario marcelo rodrigo manuel ramon diosdado fidel elpidio melvin jan jean john-paul stephen alexander charles galileo leonardo isabel louis').split(' '));
  const FAMOUS = new Set(('aristotle plato socrates einstein newton darwin galileo tesla edison curie pasteur mendel hawking mozart beethoven shakespeare napoleon caesar cleopatra lincoln washington gandhi mandela rizal bonifacio aguinaldo magellan columbus').split(' '));
  const TITLE = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'st', 'lord', 'lady']);
  const PERSON_BEFORE = new Set(('by named called professor prof president king queen emperor captain general author philosopher scientist physicist chemist biologist mathematician inventor explorer writer poet painter artist composer doctor saint').split(' '));
  const PERSON_AFTER = new Set(('said argued wrote stated claimed noted discovered invented proposed founded born died believed suggested showed developed published described explained observed conducted named served became put').split(' '));
  const MONTHS = new Set(('january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday').split(' '));

  function lexType(w) {
    w = w.toLowerCase();
    const c = [w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, '')];
    for (const x of c) if (LEX.has(x)) return LEX.get(x);
    return null;
  }

  /* ---------------- entity finder ---------------- */
  const DATE_RE = /\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:,?\s+\d{4})?)\b/g;
  const UNITS = '%|percent|per cent|°\\s?[CFK]|degrees?(?:\\s(?:Celsius|Fahrenheit))?|km/h|mph|kg|mg|g|lbs?|cm|mm|km|m|mL|ml|L|l|Hz|kHz|MHz|GHz|KB|MB|GB|TB|ms|s|sec|seconds?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|decades?|centuries|century|million|billion|trillion|thousand|BC|AD|BCE|CE|times|miles?|meters?|metres?|kilometers?|kilometres?|feet|foot|ft|inch(?:es)?|liters?|litres?|grams?|kilograms?|tons?|tonnes?|volts?|V|watts?|W|kW|calories?|kcal|pounds?|dollars?|euros?|pesos?|people|species';
  const NUM_RE = new RegExp('(?:[$€£₱¥]\\s?)?\\b\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:\\s?[-–]\\s?\\d+(?:\\.\\d+)?)?(?:\\s?(?:' + UNITS + '))?(?![A-Za-z])', 'g');
  const CAP_RE = /\b(?:(?:Mr|Mrs|Ms|Dr|Prof|Sir|St|Lord|Lady)\.?\s+)?[A-Z][\w'’\-]*(?:\s+(?:(?:of|the|de|van|von|da|di|la|le)\s+)*[A-Z][\w'’\-]*)*/g;

  function classifyCaps(ws, text, start, end) {
    const lw = ws.map(bare);
    if (ws.length === 1 && MONTHS.has(lw[0])) return 'value';
    if (TITLE.has(lw[0])) return 'person';
    const lt = lexType(lw[lw.length - 1]);
    if (ws.length === 1 && /^[A-Z]{2,}$/.test(ws[0])) return lt || 'concept';
    if (lw.some(w => FIRST.has(w) || FAMOUS.has(w))) return 'person';
    const prev = (text.slice(0, start).match(/([A-Za-z]+)\W*$/) || [])[1];
    const next = (text.slice(end).match(/^\W*([A-Za-z]+)/) || [])[1];
    if ((prev && PERSON_BEFORE.has(prev.toLowerCase())) || (next && PERSON_AFTER.has(next.toLowerCase()))) return lt || 'person';
    if (lt) return lt;
    if (ws.length === 1 && /^(?:[A-Z][a-z]?\d*){2,}$/.test(ws[0]) && /[\da-z]/.test(ws[0])) return 'substance';
    return 'concept';
  }

  function findEntities(text) {
    const spans = [];
    const free = (a, b) => !spans.some(s => a < s.end && b > s.start);
    const add = (start, end, type) => {
      if (end > start && free(start, end)) spans.push({ start, end, type, text: text.slice(start, end).trim() });
    };

    for (const m of text.matchAll(DATE_RE)) add(m.index, m.index + m[0].length, 'value');
    for (const m of text.matchAll(NUM_RE)) add(m.index, m.index + m[0].length, 'value');

    const lead = text.search(/[A-Za-z0-9]/);
    for (const m of text.matchAll(CAP_RE)) {
      let start = m.index, str = m[0], stripped = 0;
      for (;;) {
        const mm = str.match(/^(\S+)\s*/);
        if (mm && STOP.has(bare(mm[1]))) { start += mm[0].length; str = str.slice(mm[0].length); stripped++; } else break;
      }
      if (str.length < 2) continue;
      const end = start + str.length;
      if (!free(start, end)) continue;
      const ws = str.split(/\s+/);
      const atStart = stripped === 0 && m.index <= lead;
      if (ws.length === 1 && atStart) {
        const w = bare(ws[0]);
        if (!(lexType(w) || /^[A-Z]{2,}$/.test(ws[0]) || FIRST.has(w) || FAMOUS.has(w) || MONTHS.has(w))) continue;
      }
      add(start, end, classifyCaps(ws, text, start, end));
    }

    const toks = [...text.matchAll(/[A-Za-z][A-Za-z'’\-]*/g)];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], s = t.index, e = s + t[0].length;
      if (!free(s, e)) continue;
      const w = t[0].toLowerCase(), nx = toks[i + 1];
      if (nx && free(nx.index, nx.index + nx[0].length) && /^\s$/.test(text.slice(e, nx.index))) {
        const ph = PHRASES[w + ' ' + nx[0].toLowerCase()];
        if (ph) { add(s, nx.index + nx[0].length, ph); i++; continue; }
      }
      const lt = lexType(w);
      if (lt) { add(s, e, lt); continue; }
      if (w.length >= 7 && /(?:ism|ology|osis|ography)$/.test(w)) add(s, e, 'concept');
    }
    return spans.sort((a, b) => a.start - b.start);
  }

  function singleEntity(t) {
    t = t.trim();
    const sp = findEntities(t);
    return sp.length === 1 && sp[0].start <= 1 && sp[0].end >= t.length - 1 ? sp[0] : null;
  }

  /* ---------------- text cleaning ---------------- */
  function tidy(f) {
    const w = f.replace(/[()\[\]"“”]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const stop = x => { const b = bare(x); return b === '' || STOP.has(b); };
    while (w.length && stop(w[0])) w.shift();
    while (w.length && stop(w[w.length - 1])) w.pop();
    return capFirst(w.join(' ').replace(/^[,;:.\-–—\s]+|[,;:.\-–—\s]+$/g, ''));
  }

  function splitClauses(str) {
    if (wc(str) <= 9) return [str];
    const parts = str
      .split(/\s*[;:,—–]\s*|\s+(?=(?:and|but|which|that|because|while|although|whereas|when|where|since|thus|therefore|however|then|unless|until)\s)/i)
      .map(tidy).filter(Boolean);
    const out = [];
    for (const p of parts) {
      if (out.length && wc(p) < 3) out[out.length - 1] += ' ' + p.toLowerCase();
      else out.push(p);
    }
    return out.length ? out : [str];
  }

  function splitSentences(p) {
    const t = p
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|No|Fig|approx|Inc|Ltd|Co)\./g, '$1\u0003')
      .replace(/\b(e\.g|i\.e|U\.S|a\.m|p\.m)\./gi, m => m.replace(/\./g, '\u0003'))
      .replace(/(\d)\.(\d)/g, '$1\u0003$2')
      .replace(/[“"][^”"]*[”"]/g, q => q.replace(/\./g, '\u0003').replace(/!/g, '\u0004').replace(/\?/g, '\u0005'));
    const parts = t.match(/[^.!?]+(?:[.!?]+["”')\]]*|$)/g) || [t];
    return parts.map(s => s.replace(/\u0003/g, '.').replace(/\u0004/g, '!').replace(/\u0005/g, '?').trim()).filter(s => wc(s) >= 1);
  }

  function autoTopic(text, excl) {
    const freq = new Map();
    for (const m of text.matchAll(/[A-Za-z][A-Za-z'\-]{3,}/g)) {
      const w = m[0].toLowerCase();
      if (STOP.has(w) || (excl && excl.includes(w))) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    let best = null, bs = 0;
    for (const [w, c] of freq) { const sc = c * (1 + Math.min(w.length, 12) / 20); if (sc > bs) { bs = sc; best = w; } }
    return best ? capFirst(best) : 'Mind Map';
  }

  /* ---------------- tree building ---------------- */
  let uid = 0;
  function createNode(text, type, parent) {
    text = text.trim();
    if (parent) {
      const dup = parent.children.find(c => c.type === type && c.text.toLowerCase() === text.toLowerCase());
      if (dup) return dup;
    }
    const n = {
      id: ++uid, text, type, parent: parent || null, children: [], group: false,
      depth: parent ? parent.depth + 1 : 0, isMember: !!(parent && parent.group)
    };
    if (parent) parent.children.push(n);
    return n;
  }

  // Turns a piece of text into: [entity | fragment] nodes, entities hang off the fragment that precedes them.
  function buildSegments(text, parent, opt) {
    const o = Object.assign({ headType: 'label', restType: 'label' }, opt);
    const spans = findEntities(text), segs = [];
    const frag = f => { const t = tidy(f); if (t) segs.push({ frag: true, text: t }); };
    let pos = 0;
    for (const s of spans) {
      if (s.start > pos) frag(text.slice(pos, s.start));
      segs.push({ frag: false, text: s.type === 'value' ? s.text : capFirst(s.text), type: s.type });
      pos = s.end;
    }
    if (pos < text.length) frag(text.slice(pos));

    let head = null, cur = null, headIsEnt = false;
    for (const sg of segs) {
      if (sg.frag) {
        const chunks = splitClauses(sg.text);
        const node = createNode(chunks[0], head ? o.restType : o.headType, head || parent);
        for (let i = 1; i < chunks.length; i++) createNode(chunks[i], o.restType, node);
        if (!head) { head = node; headIsEnt = false; }
        cur = node;
      } else {
        const sibling = !head || (headIsEnt && cur === head);
        const node = createNode(sg.text, sg.type, sibling ? parent : cur);
        if (!head) { head = node; headIsEnt = true; cur = node; }
      }
    }
    return head;
  }

  function splitList(tail) {
    return tail.replace(/[.!?]+$/, '').split(/\s*(?:,|;|\band\b|\bor\b|\bas well as\b)\s*/i)
      .map(s => s.trim()).filter(s => s && !/^etc\.?$/i.test(s));
  }

  function tryList(s, parent) {
    let m = s.match(/^(.{2,90}?),?\s+(?:include[sd]?|including|such as|consist(?:s|ed)? of|comprise[sd]?|composed of|made up of|divided into|classified into|categori[sz]ed into|come in)\s+(.+)$/i);
    let colon = false;
    if (!m) { m = s.match(/^([^:]{2,70}):\s+(.+)$/); colon = true; }
    if (!m) return null;
    const items = splitList(m[2]);
    if (items.length < 2 || Math.max(...items.map(wc)) > 6) return null;
    if (colon && (/^(?:a|an|the)\s/i.test(m[2]) || /\b(?:that|which|who|is|are|was|were)\b/i.test(items[0]))) return null;
    const head = buildSegments(m[1].replace(/^there\s+(?:are|is)\s+(?:\w+\s+)?/i, ''), parent, { headType: 'label' }) || parent;
    head.group = true;
    items.forEach(it => buildSegments(it, head, { headType: 'member' }));
    return head;
  }

  const PRON = /^(?:it|this|that|these|those|they|he|she|we|i|you|there|here|which|who|what|some|many|most|all)\b/i;
  function tryDefinition(s, parent) {
    let subj = null, obj = null;
    let m = s.match(/^(.{2,70}?)\s+(?:is defined as|can be defined as|is known as|are known as|is called|are called|refers? to|means|is|are|was|were)\s+(.{6,})$/i);
    if (m && !/,/.test(m[1]) && wc(m[1]) <= 5 && !PRON.test(m[1])) { subj = m[1]; obj = m[2]; }
    else {
      m = s.match(/^([^:]{2,50}):\s+(.{6,})$/);
      if (m && wc(m[1]) <= 5) { subj = m[1]; obj = m[2]; }
    }
    if (!subj || wc(obj) < 2) return null;
    subj = subj.replace(/^(?:the|a|an)\s+/i, '').trim();
    const ent = singleEntity(subj);
    const type = ent && ent.type !== 'concept' && ent.type !== 'value' ? ent.type : 'term';
    const node = createNode(capFirst(subj), type, parent);
    buildSegments(obj, node, { headType: 'definition', restType: 'definition' });
    return node;
  }

  function processText(raw, parent, opt) {
    opt = opt || {};
    let s = strip(raw);
    if (!s) return null;
    const quotes = [];
    s = s.replace(/[“"]([^”"]+)[”"]/g, (m, q) => {
      if (wc(q) >= 4) { quotes.push(q.trim()); return ' '; }
      return ' ' + q + ' ';
    }).replace(/\s+/g, ' ').trim();

    const head = s ? (tryList(s, parent) || tryDefinition(s, parent) || buildSegments(s, parent, { headType: opt.headType || 'label' })) : null;
    let first = null;
    quotes.forEach(q => {
      const n = createNode('“' + q.replace(/[.\s]+$/, '') + '”', 'quote', head || parent);
      first = first || n;
    });
    return head || first;
  }

  /* ---------------- document parser ---------------- */
  function parse(raw) {
    uid = 0;
    const lines = raw.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const blank = i => i < 0 || i >= lines.length || !lines[i].trim();
    const BUL = /^(\s*)(?:[-*•·–+]|\d+[.)]|[a-z][.)])\s+(.+)$/;

    const first = lines.findIndex(l => l.trim());
    if (first < 0) return null;

    let title = null, start = first;
    const f = lines[first].trim(), fm = f.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (fm) { title = strip(fm[1]); start = first + 1; }
    else if (wc(f) <= 12 && !/[.!?:;,]$/.test(f) && !BUL.test(lines[first]) && lines.slice(first + 1).some(l => l.trim())) {
      title = strip(f); start = first + 1;
    }

    function kind(i) {
      const rawL = lines[i], t = rawL.trim();
      if (!t) return { k: 'blank' };
      let m = t.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (m) return { k: 'head', level: m[1].length, text: m[2] };
      const prevBlank = i <= start || blank(i - 1);
      let nxt = i + 1; while (nxt < lines.length && !lines[nxt].trim()) nxt++;
      const hasNext = nxt < lines.length;
      m = t.match(/^(\d+(?:\.\d+)+)\.?\s+(.+)$/);
      if (m && wc(m[2]) <= 10 && !/[.!?;,]$/.test(m[2])) return { k: 'head', level: m[1].split('.').length, text: m[2] };
      m = t.match(/^\d+[.)]\s+(.+)$/);
      if (m && prevBlank && wc(m[1]) <= 9 && !/[.!?;,:]$/.test(m[1]) && hasNext && !/^\s*\d+[.)]\s/.test(lines[nxt]))
        return { k: 'head', level: 1, text: m[1] };
      m = rawL.match(BUL);
      if (m) return { k: 'bullet', indent: m[1].length, text: m[2] };
      if (/:$/.test(t) && wc(t) <= 12) return { k: 'colon', text: t.slice(0, -1) };
      const caps = /^[A-Z0-9][A-Z0-9\s\-&',]*$/.test(t) && /[A-Z]{2}/.test(t) && wc(t) <= 10;
      if (caps || (prevBlank && hasNext && wc(t) <= 8 && !/[.!?;,:]$/.test(t) && /^[A-Z0-9]/.test(t)))
        return { k: 'head', level: 1, text: caps ? capFirst(t.toLowerCase()) : t };
      return { k: 'text', text: t };
    }

    let anyHeads = false;
    for (let i = start; i < lines.length; i++) if (kind(i).k === 'head') { anyHeads = true; break; }

    const ent = title ? singleEntity(title) : null;
    const root = createNode(capFirst(title || autoTopic(raw)), ent && ent.type !== 'value' ? ent.type : 'concept', null);
    root.group = true;

    const stack = [];
    let container = root, bullets = [], para = [], colonGroup = null;

    function flushPara() {
      if (!para.length) return;
      const text = para.join(' ').replace(/\s+/g, ' ');
      para = [];
      const sents = splitSentences(text);
      let target = colonGroup || container;
      if (target === root && !anyHeads && sents.length >= 2) {
        target = createNode(autoTopic(text, [root.text.toLowerCase()]), 'label', root);
        target.group = true;
      }
      sents.forEach(s => processText(s, target, { headType: 'label' }));
    }

    for (let i = start; i < lines.length; i++) {
      const c = kind(i);
      if (c.k === 'blank') { flushPara(); bullets = []; colonGroup = null; }
      else if (c.k === 'head') {
        flushPara(); bullets = []; colonGroup = null;
        while (stack.length && stack[stack.length - 1].level >= c.level) stack.pop();
        const parent = stack.length ? stack[stack.length - 1].node : root;
        const node = createNode(capFirst(strip(c.text).replace(/:$/, '')), 'label', parent);
        node.group = true;
        stack.push({ level: c.level, node });
        container = node;
      } else if (c.k === 'colon') {
        flushPara(); bullets = [];
        const node = createNode(capFirst(strip(c.text)), 'label', container);
        node.group = true;
        colonGroup = node;
      } else if (c.k === 'bullet') {
        flushPara();
        while (bullets.length && bullets[bullets.length - 1].indent >= c.indent) bullets.pop();
        const parent = bullets.length ? bullets[bullets.length - 1].node : (colonGroup || container);
        if (bullets.length) parent.group = true;
        const node = processText(c.text, parent, { headType: 'member' });
        bullets.push({ indent: c.indent, node: node || parent });
      } else {
        bullets = [];
        para.push(c.text);
      }
    }
    flushPara();
    return root;
  }

  global.NLP = { TYPES, TEAL, parse };
})(window);

