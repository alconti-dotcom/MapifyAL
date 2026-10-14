(function () {
  'use strict';
  const { TYPES, TEAL, parse } = window.NLP;
  const { layout, bounds, borderPoint, FONT } = window.MM;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('svg'), canvas = $('canvas'), input = $('input'), statusEl = $('status');
  const editor = $('editor'), typeSel = $('typeSel'), panel = $('panel');

  let nodes = [], world = null, editing = null;
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
  const isGrad = n => n.isMember && n.type !== 'member';

  /* ---------- draw the graph into a <g> (used by screen AND pdf) ---------- */
  function drawGraph(list, g, defs) {
    const eg = S('g', {}, g), ng = S('g', {}, g);

    for (const n of list) {
      const p = n.parent; if (!p) continue;
      const a = borderPoint(p, n), b = borderPoint(n, p), col = TYPES[n.type].color;
      let stroke = col;
      if (isGrad(n)) {
        const id = 'eg' + n.id;
        const lg = S('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, defs);
        S('stop', { offset: '0', 'stop-color': TEAL }, lg);
        S('stop', { offset: '1', 'stop-color': col }, lg);
        stroke = 'url(#' + id + ')';
      }
      S('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke, 'stroke-width': n.depth <= 1 ? 3.5 : 2.2, 'stroke-linecap': 'round' }, eg);
    }

    for (const n of list) {
      const grp = S('g', { 'data-id': n.id, style: 'cursor:pointer' }, ng);
      const col = TYPES[n.type].color;
      let fill = col, tc;
      if (isGrad(n) && n.parent) {
        const id = 'ng' + n.id;
        let ux = n.parent.x - n.x, uy = n.parent.y - n.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
        const lg = S('linearGradient', { id, x1: 0.5 + 0.5 * ux, y1: 0.5 + 0.5 * uy, x2: 0.5 - 0.5 * ux, y2: 0.5 - 0.5 * uy }, defs);
        S('stop', { offset: '0', 'stop-color': TEAL }, lg);
        S('stop', { offset: '1', 'stop-color': col }, lg);
        fill = 'url(#' + id + ')';
        tc = textColor([TEAL, col]);
      } else tc = textColor([col]);

      S('rect', {
        x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: n.depth === 0 ? 18 : 10,
        fill, stroke: '#000000', 'stroke-opacity': 0.12, 'stroke-width': 1
      }, grp);
      n.lines.forEach((ln, i) => {
        const t = S('text', {
          x: n.x, y: n.y - n.h / 2 + n.padY + i * n.lh + n.lh / 2 + n.fs * 0.35,
          'text-anchor': 'middle', 'font-family': FONT, 'font-size': n.fs, 'font-weight': n.fontWeight, fill: tc
        }, grp);
        t.textContent = ln;
      });
    }
  }

  function render() {
    svg.innerHTML = '';
    const defs = S('defs', {}, svg);
    world = S('g', {}, svg);
    drawGraph(nodes, world, defs);
    applyView();
  }

  /* ---------- infinite canvas ---------- */
  function applyView() {
    if (world) world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    const s = 28 * view.k;
    canvas.style.backgroundSize = s + 'px ' + s + 'px';
    canvas.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
  }
  function zoomAt(px, py, f) {
    const k = Math.min(4, Math.max(0.02, view.k * f)), r = k / view.k;
    view.x = px - (px - view.x) * r; view.y = py - (py - view.y) * r; view.k = k; applyView();
  }
  function fit() {
    if (!nodes.length) return;
    const b = bounds(nodes, 60), r = canvas.getBoundingClientRect();
    view.k = Math.max(0.02, Math.min(r.width / b.w, r.height / b.h, 1.5));
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
      view.k = Math.min(4, Math.max(0.02, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
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
      if (el) openEditor(nodes.find(n => n.id === +el.getAttribute('data-id')), e);
      else editor.hidden = true;
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

  /* ---------- generate ---------- */
  function generate() {
    try {
      const root = parse(input.value);
      if (!root || !root.children.length) { statusEl.textContent = 'Nothing to map — add a few sentences or bullet points.'; return; }
      statusEl.textContent = 'Building…';
      setTimeout(() => {
        try {
          nodes = layout(root);
          editor.hidden = true;
          render(); fit();
          statusEl.textContent = nodes.length + ' boxes · drag to pan · scroll/pinch to zoom · tap a box to change its type';
          panel.classList.remove('open');
        } catch (err) { console.error(err); statusEl.textContent = 'Error: ' + err.message; }
      }, 20);
    } catch (err) { console.error(err); statusEl.textContent = 'Error: ' + err.message; }
  }

  /* ---------- PDF (vector, cropped to content) ---------- */
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
      S('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }, out);
      const g = S('g', { transform: `translate(${-b.x} ${-b.y})` }, out);
      drawGraph(nodes, g, defs);

      const pdf = new jsPDF({ orientation: W >= H ? 'l' : 'p', unit: 'px', format: [W * s, H * s], hotfixes: ['px_scaling'] });
      const opts = { x: 0, y: 0, width: W * s, height: H * s };
      if (typeof pdf.svg === 'function') await pdf.svg(out, opts);
      else await (window.svg2pdf.svg2pdf || window.svg2pdf)(out, pdf, opts);
      pdf.save((nodes[0].text.replace(/[^\w\-]+/g, '_') || 'mindmap') + '_mindmap.pdf');
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

  input.value = SAMPLE;
  generate();
})();

