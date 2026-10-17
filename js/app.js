(function () {
  'use strict';
  const { TYPES, TEAL, parse } = window.NLP;
  const { layout, stretch, bounds, borderPoint, FONT } = window.MM;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('svg'), canvas = $('canvas'), input = $('input'), statusEl = $('status');
  const editor = $('editor'), typeSel = $('typeSel'), panel = $('panel');
  const lenEl = $('len'), lenVal = $('lenVal'), themeBtn = $('theme');
  const levelsBody = $('levelsBody');

  let nodes = [], world = null, editing = null;
  let selected = null, nodeEls = new Map(), edgeEls = new Map();
  let lenK = (+lenEl.value || 120) / 100;
  let levels = {};                       // per-level line multipliers (absent = default layout = 100%)
  let dark = false;
  const view = { x: 0, y: 0, k: 1 };

  const SAMPLE = `Photosynthesis

Photosynthesis is the process by which green plants convert light energy into chemical energy. It takes place in the chloroplasts of leaf cells, usually at around 25 °C.

Inputs and Outputs
- Inputs: carbon dioxide, water, and sunlight
- Outputs: glucose and oxygen
- Chlorophyll: the green pigment that absorbs light

History
Jan Ingenhousz discovered in 1779 that light is essential for plants. Dr. Melvin Calvin later mapped the cycle and won the Nobel Prize in 1961. As he explained, "the path of carbon in photosynthesis was traced with radioactive tracers."`;

  /* ---------- svg helper ---------- */
  function S(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- colour helpers ---------- */
  function lum(hex) {
    const c = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function textColor(colors) {
    const w = Math.min(...colors.map(c => contrast('#ffffff', c)));
    const d = Math.min(...colors.map(c => contrast('#111111', c)));
    return w >= d ? '#ffffff' : '#111111';
  }
  function mix(h1, h2, t) {
    const a = [1, 3, 5].map(i => parseInt(h1.substr(i, 2), 16));
    const b = [1, 3, 5].map(i => parseInt(h2.substr(i, 2), 16));
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  const isGrad = n => n.isMember && n.type !== 'member';
  const PAGE_BG = () => (dark ? '#12161c' : '#ffffff');

  /* ---------- draw the graph into a <g> (used by screen AND pdf) ---------- */
  function drawGraph(list, g, defs, pre) {
    const eg = S('g', {}, g), ng = S('g', {}, g);
    const els = { nodes: new Map(), edges: new Map() };
    const STEPS = 10;

    // connectors: gradients are drawn as short solid segments (renders identically on screen and in the PDF)
    for (const n of list) {
      const p = n.parent; if (!p) continue;
      const a = borderPoint(p, n), b = borderPoint(n, p), col = TYPES[n.type].color;
      const w = Math.max(1.8, 4.2 - 0.6 * n.depth);
      const grp = S('g', { 'class': 'edge' }, eg);
      if (isGrad(n)) {
        for (let i = 0; i < STEPS; i++) {
          const t0 = i / STEPS, t1 = (i + 1) / STEPS;
          S('path', {
            d: 'M' + (a.x + (b.x - a.x) * t0) + ' ' + (a.y + (b.y - a.y) * t0) +
               'L' + (a.x + (b.x - a.x) * t1) + ' ' + (a.y + (b.y - a.y) * t1),
            fill: 'none', stroke: mix(TEAL, col, (i + 0.5) / STEPS),
            'stroke-width': w, 'stroke-linecap': 'round'
          }, grp);
        }
      } else {
        S('path', { d: 'M' + a.x + ' ' + a.y + 'L' + b.x + ' ' + b.y, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round' }, grp);
      }
      els.edges.set(n.id, grp);
    }

    for (const n of list) {
      const grp = S('g', { 'data-id': n.id, 'class': 'node', style: 'cursor:pointer' }, ng);
      const col = TYPES[n.type].color;
      let fill = col, tc;
      if (isGrad(n) && n.parent) {
        const id = pre + 'ng' + n.id;
        let ux = n.parent.x - n.x, uy = n.parent.y - n.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
        const lg = S('linearGradient', { id, x1: 0.5 + 0.5 * ux, y1: 0.5 + 0.5 * uy, x2: 0.5 - 0.5 * ux, y2: 0.5 - 0.5 * uy }, defs);
        S('stop', { offset: '0', 'stop-color': TEAL }, lg);
        S('stop', { offset: '1', 'stop-color': col }, lg);
        fill = 'url(#' + id + ')';
        tc = textColor([TEAL, col]);
      } else tc = textColor([col]);

      S('rect', {
        x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: n.depth === 0 ? 18 : 10,
        fill, stroke: dark ? '#ffffff' : '#000000', 'stroke-opacity': dark ? 0.22 : 0.12, 'stroke-width': 1
      }, grp);
      n.lines.forEach((ln, i) => {
        const t = S('text', {
          x: n.x, y: n.y - n.h / 2 + n.padY + i * n.lh + n.lh / 2 + n.fs * 0.35,
          'text-anchor': 'middle', 'font-family': FONT, 'font-size': n.fs, 'font-weight': n.fontWeight, fill: tc
        }, grp);
        t.textContent = ln;
      });
      els.nodes.set(n.id, grp);
    }
    return els;
  }

  function render() {
    svg.innerHTML = '';
    const defs = S('defs', {}, svg);
    world = S('g', {}, svg);
    const els = drawGraph(nodes, world, defs, 's');
    nodeEls = els.nodes; edgeEls = els.edges;
    applyView();
    applySelection();
  }

  /* ---------- highlight + domino ripple ---------- */
  function applySelection() {
    const keep = new Set();
    if (selected) (function w(m) { keep.add(m.id); m.children.forEach(w); })(selected);
    nodeEls.forEach((el, id) => el.classList.toggle('dim', !!selected && !keep.has(id)));
    edgeEls.forEach((el, id) => el.classList.toggle('dim', !!selected && (!keep.has(id) || id === selected.id)));
  }
  function ripple(n) {
    const base = n.depth;
    (function walk(m) {
      const el = nodeEls.get(m.id);
      if (el && el.animate) {
        el.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.4 }, { transform: 'scale(1)' }],
          { duration: 520, delay: (m.depth - base) * 130, easing: 'ease-in-out', iterations: 1 }
        );
      }
      m.children.forEach(walk);
    })(n);
  }
  function select(n, animate) {
    selected = n;
    applySelection();
    if (n && animate) ripple(n);
  }

  /* ---------- infinite canvas ---------- */
  function applyView() {
    if (world) world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    const s = 28 * view.k;
    canvas.style.backgroundSize = s + 'px ' + s + 'px';
    canvas.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
  }
  function zoomAt(px, py, f) {
    const k = Math.min(4, Math.max(0.01, view.k * f)), r = k / view.k;
    view.x = px - (px - view.x) * r; view.y = py - (py - view.y) * r; view.k = k; applyView();
  }
  function fit() {
    if (!nodes.length) return;
    const b = bounds(nodes, 60), r = canvas.getBoundingClientRect();
    view.k = Math.max(0.01, Math.min(r.width / b.w, r.height / b.h, 1.5));
    view.x = r.width / 2 - (b.x + b.w / 2) * view.k;
    view.y = r.height / 2 - (b.y + b.h / 2) * view.k;
    applyView();
  }

  const ptrs = new Map(); let drag = null, pinch = null;
  const rel = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', e => {
    if (e.target.closest('#toolbar') || e.target.closest('#editor')) return;
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, rel(e));
    if (ptrs.size === 1) drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, target: e.target };
    else if (ptrs.size === 2) {
      drag = null;
      const [a, b] = [...ptrs.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, wx: (m.x - view.x) / view.k, wy: (m.y - view.y) / view.k };
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, rel(e));
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      view.k = Math.min(4, Math.max(0.01, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      view.x = m.x - pinch.wx * view.k; view.y = m.y - pinch.wy * view.k; applyView();
    } else if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; applyView(); }
    }
  });
  const endPtr = e => {
    if (drag && !drag.moved && ptrs.size === 1) {
      const el = drag.target.closest && drag.target.closest('[data-id]');
      if (el) {
        const n = nodes.find(n => n.id === +el.getAttribute('data-id'));
        openEditor(n, e);
        select(n, true);
      } else { editor.hidden = true; select(null, false); }
    }
    ptrs.delete(e.pointerId); drag = null; if (ptrs.size < 2) pinch = null;
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const p = rel(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  /* ---------- click a box → change its type ---------- */
  Object.keys(TYPES).forEach(k => {
    const o = document.createElement('option'); o.value = k; o.textContent = TYPES[k].label; typeSel.appendChild(o);
  });
  function openEditor(n, e) {
    if (!n) return;
    editing = n; typeSel.value = n.type;
    const p = rel(e), r = canvas.getBoundingClientRect();
    editor.hidden = false;
    editor.style.left = Math.min(p.x + 8, r.width - 240) + 'px';
    editor.style.top = Math.min(p.y + 8, r.height - 60) + 'px';
  }
  typeSel.addEventListener('change', () => { if (editing) { editing.type = typeSel.value; render(); } });

  /* ---------- line-length sliders with a locked view anchor ---------- */
  // While any line slider is being dragged, the box nearest the screen centre stays pinned to its
  // on-screen spot, so the map grows/shrinks around what you're looking at instead of flying away.
  let anchor = null, raf = 0;
  function grabAnchor() {
    if (!nodes.length) return;
    const r = canvas.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
    let best = null, bd = Infinity, bsx = 0, bsy = 0;
    for (const n of nodes) {
      const sx = n.x * view.k + view.x, sy = n.y * view.k + view.y;
      const d = (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy);
      if (d < bd) { bd = d; best = n; bsx = sx; bsy = sy; }
    }
    anchor = best ? { n: best, sx: bsx, sy: bsy } : null;
  }
  const dropAnchor = () => { anchor = null; };
  function bindLock(el) {
    el.addEventListener('pointerdown', grabAnchor);
    el.addEventListener('keydown', () => { if (!anchor) grabAnchor(); });
    ['change', 'pointerup', 'pointercancel', 'blur'].forEach(ev => el.addEventListener(ev, dropAnchor));
  }
  function relayout() {
    if (!nodes.length) return;
    if (!anchor) grabAnchor();
    stretch(nodes, lenK, levels);
    if (anchor) { view.x = anchor.sx - anchor.n.x * view.k; view.y = anchor.sy - anchor.n.y * view.k; }
    editor.hidden = true;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
  }

  // overall slider
  bindLock(lenEl);
  lenEl.addEventListener('input', () => {
    lenK = (+lenEl.value) / 100;
    lenVal.textContent = Math.round(lenK * 100) + '%';
    relayout();
  });

  // one slider per branch level (level d = the lines that end at level-d boxes)
  function buildLevelControls() {
    levelsBody.innerHTML = '';
    let maxD = 0; nodes.forEach(n => { if (n.depth > maxD) maxD = n.depth; });
    if (maxD < 1) { levelsBody.innerHTML = '<small>No branches yet.</small>'; return; }

    const hint = document.createElement('small');
    hint.textContent = 'Each slider changes only the lines that end at that level. 100% = the default layout; 0% pulls those boxes onto their parent, so overlaps are expected near 0.';
    levelsBody.appendChild(hint);

    const sliders = [];
    for (let d = 1; d <= maxD; d++) {
      const wrap = document.createElement('div'); wrap.className = 'lvl';
      const lab = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = d === 1 ? 'Level 1 · center → main branches' : 'Level ' + d + ' · level ' + (d - 1) + ' → ' + d;
      const val = document.createElement('b'); val.textContent = '100%';
      lab.append(name, val);
      const sl = document.createElement('input');
      sl.type = 'range'; sl.min = 0; sl.max = 300; sl.step = 1; sl.value = 100;
      sl.addEventListener('input', () => {
        levels[d] = (+sl.value) / 100;
        val.textContent = sl.value + '%';
        relayout();
      });
      bindLock(sl);
      wrap.append(lab, sl);
      levelsBody.appendChild(wrap);
      sliders.push({ d, sl, val });
    }
    const rs = document.createElement('button');
    rs.className = 'reset'; rs.textContent = 'Reset levels';
    rs.onclick = () => {
      levels = {};
      sliders.forEach(s => { s.sl.value = 100; s.val.textContent = '100%'; });
      grabAnchor(); relayout(); dropAnchor();
    };
    levelsBody.appendChild(rs);
  }

  /* ---------- dark mode ---------- */
  function setTheme(d, save) {
    dark = d;
    document.body.classList.toggle('dark', dark);
    themeBtn.textContent = dark ? '☀' : '☾';
    if (save) { try { localStorage.setItem('mm-theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ } }
    if (nodes.length) render();
  }
  themeBtn.onclick = () => setTheme(!dark, true);
  (function initTheme() {
    let t = null;
    try { t = localStorage.getItem('mm-theme'); } catch (e) { /* ignore */ }
    const pref = t ? t === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setTheme(pref, false);
  })();

  /* ---------- generate ---------- */
  function generate() {
    try {
      const root = parse(input.value);
      if (!root || !root.children.length) { statusEl.textContent = 'Nothing to map — add a few sentences or bullet points.'; return; }
      statusEl.textContent = 'Building…';
      setTimeout(() => {
        try {
          levels = {};                                  // every new map starts from the default layout
          nodes = layout(root, lenK, levels);
          editor.hidden = true;
          selected = null;
          buildLevelControls();
          render(); fit();
          statusEl.textContent = nodes.length + ' boxes · drag to pan · scroll/pinch to zoom · tap a box to highlight its branch (tap empty space to clear)';
          panel.classList.remove('open');
        } catch (err) { console.error(err); statusEl.textContent = 'Error: ' + err.message; }
      }, 20);
    } catch (err) { console.error(err); statusEl.textContent = 'Error: ' + err.message; }
  }

  /* ---------- PDF (vector, cropped to content, current line lengths + current theme, never dimmed) ---------- */
  async function downloadPDF() {
    if (!nodes.length) { statusEl.textContent = 'Generate a map first.'; return; }
    try {
      const { jsPDF } = window.jspdf;
      const b = bounds(nodes, 40);
      const W = Math.ceil(b.w), H = Math.ceil(b.h);
      const s = Math.min(1, 19000 / Math.max(W, H));          // PDF page-size limit

      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none';
      document.body.appendChild(holder);
      const out = S('svg', { xmlns: NS, width: W, height: H, viewBox: `0 0 ${W} ${H}` }, holder);
      const defs = S('defs', {}, out);
      S('rect', { x: 0, y: 0, width: W, height: H, fill: PAGE_BG() }, out);
      const g = S('g', { transform: `translate(${-b.x} ${-b.y})` }, out);
      drawGraph(nodes, g, defs, 'p');

      const pdf = new jsPDF({ orientation: W >= H ? 'l' : 'p', unit: 'px', format: [W * s, H * s], hotfixes: ['px_scaling'] });
      const opts = { x: 0, y: 0, width: W * s, height: H * s };
      if (typeof pdf.svg === 'function') await pdf.svg(out, opts);
      else await (window.svg2pdf.svg2pdf || window.svg2pdf)(out, pdf, opts);
      pdf.save((nodes[0].text.replace(/[^\w\-]+/g, '_') || 'mindmap') + '_mindmap' + (dark ? '_dark' : '') + '.pdf');
      holder.remove();
    } catch (err) { console.error(err); statusEl.textContent = 'PDF error: ' + err.message; }
  }

  /* ---------- legend & wiring ---------- */
  const lg = $('legendBody');
  Object.keys(TYPES).forEach(k => {
    lg.insertAdjacentHTML('beforeend', `<div><span class="sw" style="background:${TYPES[k].color}"></span>${TYPES[k].label} <small>${TYPES[k].color}</small></div>`);
  });
  lg.insertAdjacentHTML('beforeend', `<div><span class="sw" style="background:linear-gradient(90deg,${TEAL},#9B5DE5)"></span>Group member with a type (teal → type colour)</div>`);

  $('gen').onclick = generate;
  $('sample').onclick = () => { input.value = SAMPLE; generate(); };
  $('fit').onclick = fit;
  $('zin').onclick = () => { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.3); };
  $('zout').onclick = () => { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.3); };
  $('pdf').onclick = downloadPDF;
  $('menuBtn').onclick = () => panel.classList.toggle('open');
  $('file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { input.value = rd.result; generate(); };
    rd.readAsText(f);
  };
  window.addEventListener('resize', () => { if (nodes.length) applyView(); });

  lenVal.textContent = Math.round(lenK * 100) + '%';
  input.value = SAMPLE;
  generate();
})();
