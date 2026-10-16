(function (g) {
  'use strict';
  const FONT = 'Helvetica, Arial, sans-serif';
  const ctx = document.createElement('canvas').getContext('2d');
  const ROOT_FS = 34, FLOOR_FS = 13;
  const GAP = 14, EDGE_MIN = 34, EPS = 0.03, EXCL = 0.14;
  const FAN = 2.6, MAXFAN = 4.2, TAU = Math.PI * 2;

  /* ---- font size: big centre, decay that plateaus at a readable floor ---- */
  function fontSize(depth, maxDepth) {
    if (depth === 0) return ROOT_FS;
    const k = 3 / Math.max(maxDepth, 3);
    return Math.round((FLOOR_FS + (ROOT_FS - FLOOR_FS) * Math.exp(-k * depth)) * 10) / 10;
  }

  /* ---- measure & wrap text inside each box ---- */
  function measure(n, maxDepth) {
    const root = n.depth === 0;
    const fs = fontSize(n.depth, maxDepth);
    const fw = n.depth <= 1 ? 'bold' : 'normal';
    ctx.font = fw + ' ' + fs + 'px ' + FONT;
    const maxW = root ? 380 : Math.max(170, Math.round(fs * 9.5));
    const lines = []; let line = '';
    for (const w of n.text.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    let tw = 0; lines.forEach(l => { tw = Math.max(tw, ctx.measureText(l).width); });
    n.fs = fs; n.fontWeight = fw; n.lines = lines; n.lh = Math.round(fs * 1.3);
    n.padY = Math.round(fs * (root ? 0.55 : 0.42));
    n.w = Math.ceil(tw * 1.03) + Math.round(fs * (root ? 1.8 : 1.3)) + 6;
    n.h = lines.length * n.lh + n.padY * 2;
    n.rad = Math.hypot(n.w, n.h) / 2;                 // bounding-circle radius of the box
  }

  /* ------------------------------------------------------------------
     Natural tree layout ("balloon" style), applied identically at EVERY level.

     Each subtree is a rigid body wrapped in a circle (centre on the branch axis).
     A node fans its children out around itself; every child's circle sits inside
     its own tangent cone from the parent, the cones never overlap, and the
     direction back to the grandparent is kept free. So:
       - boxes can't overlap (they live in disjoint circles),
       - connectors can't cross each other or touch unrelated boxes.
     ------------------------------------------------------------------ */
  function build(n) {
    const kids = n.children;
    kids.forEach(build);
    if (!kids.length) { n.r = n.rad; n.a = 0; n.pl = []; return; }

    const k = kids.length, isRoot = !n.parent;
    const avail = isRoot ? TAU : Math.min(TAU - 2 * EXCL, MAXFAN);
    const gaps = isRoot ? k : k - 1;

    // closest each child circle may sit (touching the parent box + a visible line)
    const Dmin = kids.map(c => n.rad + c.r + 2 * GAP + EDGE_MIN);
    const need = f => {
      let s = gaps * EPS;
      for (let i = 0; i < k; i++) s += 2 * Math.asin(Math.min(1, (kids[i].r + GAP) / (Dmin[i] * f)));
      return s;
    };
    let f = 1;
    if (need(1) > avail) {                             // push children outward until the cones fit
      let hi = 2; while (need(hi) > avail && hi < 1e4) hi *= 2;
      let lo = hi / 2;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (need(mid) > avail) lo = mid; else hi = mid; }
      f = hi;
    }
    const D = Dmin.map(d => d * f);
    const al = kids.map((c, i) => Math.asin(Math.min(1, (c.r + GAP) / D[i])));
    const cones = al.reduce((s, a) => s + 2 * a, 0);

    let gap, cur;
    if (isRoot) {                                      // level 1: spread over the full circle
      gap = (TAU - cones) / k;
      cur = -Math.PI / 2;
    } else {                                           // deeper levels: a forward fan (same rule, centred on the branch)
      const T = Math.min(avail, Math.max(cones + gaps * EPS, Math.min(FAN, 0.9 * k)));
      gap = k > 1 ? (T - cones) / (k - 1) : 0;
      cur = -(cones + gap * (k - 1)) / 2;
    }
    n.pl = [];
    for (let i = 0; i < k; i++) {
      n.pl.push({ th: cur + al[i], D: D[i] });
      cur += 2 * al[i] + gap;
    }

    // smallest circle (centre on the axis) holding this box and all child circles
    const C = n.pl.map(p => [p.D * Math.cos(p.th), p.D * Math.sin(p.th)]);
    const fa = a => {
      let m = Math.abs(a) + n.rad;
      for (let i = 0; i < k; i++) m = Math.max(m, Math.hypot(C[i][0] - a, C[i][1]) + kids[i].r);
      return m;
    };
    let lo = -n.rad, hi = lo;
    for (let i = 0; i < k; i++) hi = Math.max(hi, C[i][0] + kids[i].r);
    for (let i = 0; i < 60; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (fa(m1) < fa(m2)) hi = m2; else lo = m1;
    }
    n.a = (lo + hi) / 2; n.r = fa(n.a);
  }

  function placeDown(n) {
    n.children.forEach((c, i) => {
      const p = n.pl[i], phi = n.ang + p.th, d = p.D - c.a;
      c.bx = n.bx + d * Math.cos(phi); c.by = n.by + d * Math.sin(phi); c.ang = phi;
      placeDown(c);
    });
  }

  /* ---- line-length knob: scales every distance from the centre (L >= 1 keeps it overlap-free) ---- */
  function stretch(nodes, L) {
    L = Math.max(1, L || 1);
    nodes.forEach(n => { n.x = n.bx * L; n.y = n.by * L; });
  }

  function layout(root, L) {
    const nodes = [];
    (function walk(n) { nodes.push(n); n.children.forEach(walk); })(root);
    let maxDepth = 0; nodes.forEach(n => { if (n.depth > maxDepth) maxDepth = n.depth; });
    nodes.forEach(n => measure(n, maxDepth));
    build(root);
    root.bx = 0; root.by = 0; root.ang = 0;
    placeDown(root);
    stretch(nodes, L);
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

  g.MM = { layout, stretch, bounds, borderPoint, FONT };
})(window);
