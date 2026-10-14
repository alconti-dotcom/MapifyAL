(function (g) {
  'use strict';
  const FONT = 'Helvetica, Arial, sans-serif';
  const ctx = document.createElement('canvas').getContext('2d');
  const GAP = 38, BOX_PAD = 18, EDGE_PAD = 10, MAX_FAN = 3.6;

  /* ---- measure & wrap text inside each box ---- */
  function measure(n) {
    const root = n.depth === 0;
    const fs = root ? 22 : (n.group && n.depth <= 1 ? 16 : 14);
    const fw = (root || n.depth === 1) ? 'bold' : 'normal';
    ctx.font = fw + ' ' + fs + 'px ' + FONT;
    const maxW = root ? 300 : 210;
    const lines = []; let line = '';
    for (const w of n.text.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    let tw = 0; lines.forEach(l => { tw = Math.max(tw, ctx.measureText(l).width); });
    n.fs = fs; n.fontWeight = fw; n.lines = lines; n.lh = Math.round(fs * 1.32);
    n.padY = root ? 13 : 9;
    n.w = Math.ceil(tw) + (root ? 50 : 34);      // slack for PDF font-metric differences
    n.h = lines.length * n.lh + n.padY * 2;
  }

  /* ---- distance needed so two boxes at angle (c,s) don't touch ---- */
  function sepDist(a, b, c, s, gap) {
    const ac = Math.abs(c), as = Math.abs(s);
    const dx = ac > 1e-6 ? ((a.w + b.w) / 2 + gap) / ac : Infinity;
    const dy = as > 1e-6 ? ((a.h + b.h) / 2 + gap) / as : Infinity;
    return Math.min(dx, dy);
  }
  function overlapAny(list, pad) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad) return true;
    }
    return false;
  }

  /* ---- initial radial placement: each subtree gets an angular sector ---- */
  function placeKids(n) {
    const kids = n.children; if (!kids.length) return;
    const total = kids.reduce((s, c) => s + c.leaves, 0);
    const fan = n.depth === 0 ? Math.PI * 2
      : Math.min(MAX_FAN, Math.max(n.span, Math.min(2.6, 0.55 * kids.length)));
    let a = n.ang - fan / 2;
    for (const c of kids) {
      const sl = fan * (0.5 * c.leaves / total + 0.5 / kids.length);
      c.ang = a + sl / 2; c.span = sl; a += sl;
    }
    const dirs = kids.map(c => [Math.cos(c.ang), Math.sin(c.ang)]);
    let extra = 0;
    for (let it = 0; it < 150; it++) {
      kids.forEach((c, i) => {
        const d = sepDist(n, c, dirs[i][0], dirs[i][1], GAP) + extra;
        c.x = n.x + dirs[i][0] * d; c.y = n.y + dirs[i][1] * d;
      });
      if (!overlapAny(kids, 14)) break;
      extra += 16;
    }
    kids.forEach(k => placeKids(k));
  }

  /* ---- overlap solver (box↔box and box↔connector line) ---- */
  function pushApart(a, b, pad, root) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const ox = (a.w + b.w) / 2 + pad - Math.abs(dx);
    const oy = (a.h + b.h) / 2 + pad - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return 0;
    let px = 0, py = 0;
    if (ox < oy) px = (dx === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dx)) * (ox + 1);
    else py = (dy === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dy)) * (oy + 1);
    let sa = a === root ? 0 : (a.depth + 1), sb = b === root ? 0 : (b.depth + 1);
    const sum = sa + sb; sa /= sum; sb /= sum;
    a.x -= px * sa; a.y -= py * sa; b.x += px * sb; b.y += py * sb;
    return 1;
  }

  function segHitsRect(x0, y0, x1, y1, rx0, ry0, rx1, ry1) {
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy], q = [x0 - rx0, rx1 - x0, y0 - ry0, ry1 - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; }
      else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }

  function pushOffEdge(m, p, c, root) {
    const sx = c.x - p.x, sy = c.y - p.y, len = Math.hypot(sx, sy);
    if (len < 1) return 0;
    const hx = m.w / 2 + EDGE_PAD, hy = m.h / 2 + EDGE_PAD;
    if (!segHitsRect(p.x, p.y, c.x, c.y, m.x - hx, m.y - hy, m.x + hx, m.y + hy)) return 0;
    let nx = -sy / len, ny = sx / len;
    const side = (m.x - p.x) * nx + (m.y - p.y) * ny;
    const sgn = side === 0 ? (m.id % 2 ? 1 : -1) : Math.sign(side);
    nx *= sgn; ny *= sgn;
    const push = hx * Math.abs(nx) + hy * Math.abs(ny) - Math.abs(side) + 1;
    if (push <= 0) return 0;
    const target = m === root ? c : m, dir = m === root ? -1 : 1;
    target.x += nx * push * dir; target.y += ny * push * dir;
    return 1;
  }

  function resolve(nodes, root) {
    const t0 = performance.now();
    for (let it = 0; it < 500; it++) {
      let moved = 0;
      const cell = 260, grid = new Map();
      for (const n of nodes) {
        const x0 = Math.floor((n.x - n.w / 2 - BOX_PAD) / cell), x1 = Math.floor((n.x + n.w / 2 + BOX_PAD) / cell);
        const y0 = Math.floor((n.y - n.h / 2 - BOX_PAD) / cell), y1 = Math.floor((n.y + n.h / 2 + BOX_PAD) / cell);
        for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
          const k = gx + ',' + gy; (grid.get(k) || grid.set(k, []).get(k)).push(n);
        }
      }
      const seen = new Set();
      for (const list of grid.values()) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j], key = Math.min(a.id, b.id) * 65536 + Math.max(a.id, b.id);
          if (seen.has(key)) continue; seen.add(key);
          moved += pushApart(a, b, BOX_PAD, root);
        }
      }
      for (const c of nodes) {
        const p = c.parent; if (!p) continue;
        const minx = Math.min(p.x, c.x) - EDGE_PAD, maxx = Math.max(p.x, c.x) + EDGE_PAD;
        const miny = Math.min(p.y, c.y) - EDGE_PAD, maxy = Math.max(p.y, c.y) + EDGE_PAD;
        for (const m of nodes) {
          if (m === p || m === c) continue;
          if (m.x + m.w / 2 < minx || m.x - m.w / 2 > maxx || m.y + m.h / 2 < miny || m.y - m.h / 2 > maxy) continue;
          moved += pushOffEdge(m, p, c, root);
        }
      }
      if (!moved || performance.now() - t0 > 5000) break;
    }
  }

  function layout(root) {
    const nodes = [];
    (function walk(n) { nodes.push(n); n.children.forEach(walk); })(root);
    nodes.forEach(measure);
    (function wt(n) { n.leaves = n.children.length ? n.children.reduce((s, c) => s + wt(c), 0) : 1; return n.leaves; })(root);
    root.x = 0; root.y = 0; root.ang = -Math.PI / 2; root.span = Math.PI * 2;
    placeKids(root);
    resolve(nodes, root);
    return nodes;
  }

  function bounds(nodes, margin) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach(n => {
      x0 = Math.min(x0, n.x - n.w / 2); x1 = Math.max(x1, n.x + n.w / 2);
      y0 = Math.min(y0, n.y - n.h / 2); y1 = Math.max(y1, n.y + n.h / 2);
    });
    return { x: x0 - margin, y: y0 - margin, w: x1 - x0 + 2 * margin, h: y1 - y0 + 2 * margin };
  }

  function borderPoint(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const tx = dx ? (a.w / 2) / Math.abs(dx) : Infinity;
    const ty = dy ? (a.h / 2) / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty, 1);
    return { x: a.x + dx * t, y: a.y + dy * t };
  }

  g.MM = { layout, bounds, borderPoint, FONT };
})(window);

