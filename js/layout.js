(function (g) {
  'use strict';
  const FONT = 'Helvetica, Arial, sans-serif';
  const ctx = document.createElement('canvas').getContext('2d');
  const ROOT_FS = 34, FLOOR_FS = 13, NODE_GAP = 26, TAU = Math.PI * 2;

  /* ---- font size: big centre, exponential decay that plateaus at a readable floor ---- */
  function fontSize(depth, maxDepth) {
    if (depth === 0) return ROOT_FS;
    const k = 3 / Math.max(maxDepth, 3);            // reaches ~floor at the deepest branch
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
    n.w = Math.ceil(tw * 1.03) + Math.round(fs * (root ? 1.8 : 1.3)) + 6;   // slack for PDF font metrics
    n.h = lines.length * n.lh + n.padY * 2;
    n.rad = Math.hypot(n.w, n.h) / 2;                                      // bounding-circle radius
  }

  /* ---- angular space each subtree needs at the given ring radii ---- */
  function computeNeed(n, R) {
    let s = 0;
    for (const c of n.children) s += computeNeed(c, R);
    const own = n.depth === 0 ? 0
      : 2 * Math.asin(Math.min(1, (2 * n.rad + NODE_GAP) / (2 * R[n.depth])));
    n.childSum = s; n.need = Math.max(own, s);
    return n.need;
  }

  function fitScale(root, base) {
    const ok = f => { computeNeed(root, base.map((r, d) => d ? r * f : 0)); return root.childSum <= TAU * 0.985; };
    if (ok(1)) return 1;
    let hi = 1.6;
    while (!ok(hi) && hi < 400) hi *= 1.6;
    let lo = hi / 1.6;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  /* ---- every subtree lives inside its own angular wedge, so branches can't cross ---- */
  function assign(n, a0, W, R, cone) {
    const th = a0 + W / 2;
    n.ang = th; n.x = R[n.depth] * Math.cos(th); n.y = R[n.depth] * Math.sin(th);
    const kids = n.children;
    if (!kids.length) return;
    const S = n.childSum;
    const span = n.depth === 0 ? TAU : Math.min(W, Math.max(S, cone));
    const sc = span / S;
    let a = th - span / 2;
    for (const c of kids) { const w = c.need * sc; assign(c, a, w, R, cone); a += w; }
  }

  /* ---- geometry checks ---- */
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
  const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  function segCross(a1, a2, b1, b2) {
    const d1 = orient(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y), d2 = orient(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
    const d3 = orient(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y), d4 = orient(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function conflicts(nodes) {
    const n = nodes.length;
    for (let i = 0; i < n; i++) {                                   // box ↔ box
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 8 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 8) return true;
      }
    }
    const E = nodes.filter(m => m.parent);
    for (let i = 0; i < E.length; i++) {                            // line ↔ line
      const a = E[i], ap = a.parent;
      for (let j = i + 1; j < E.length; j++) {
        const b = E[j], bp = b.parent;
        if (ap === bp || a === bp || b === ap) continue;
        if (Math.max(a.x, ap.x) < Math.min(b.x, bp.x) || Math.max(b.x, bp.x) < Math.min(a.x, ap.x) ||
            Math.max(a.y, ap.y) < Math.min(b.y, bp.y) || Math.max(b.y, bp.y) < Math.min(a.y, ap.y)) continue;
        if (segCross(ap, a, bp, b)) return true;
      }
    }
    for (const e of E) {                                            // line ↔ unrelated box
      const p = e.parent;
      const minx = Math.min(e.x, p.x), maxx = Math.max(e.x, p.x), miny = Math.min(e.y, p.y), maxy = Math.max(e.y, p.y);
      for (const m of nodes) {
        if (m === e || m === p) continue;
        if (m.x + m.w / 2 < minx || m.x - m.w / 2 > maxx || m.y + m.h / 2 < miny || m.y - m.h / 2 > maxy) continue;
        if (segHitsRect(p.x, p.y, e.x, e.y, m.x - m.w / 2 - 6, m.y - m.h / 2 - 6, m.x + m.w / 2 + 6, m.y + m.h / 2 + 6)) return true;
      }
    }
    return false;
  }

  /* ---- ring radii + placement (re-tries with more breathing room if anything still collides) ---- */
  function place(root, nodes, maxDepth) {
    const rho = [], circ = [];
    nodes.forEach(n => {
      rho[n.depth] = Math.max(rho[n.depth] || 0, n.rad);
      circ[n.depth] = (circ[n.depth] || 0) + (2 * n.rad + NODE_GAP) / TAU;
    });
    let ringGap = 70, cone = 1.75;
    for (let attempt = 0; attempt < 9; attempt++) {
      const base = [0];
      for (let d = 1; d <= maxDepth; d++) base[d] = Math.max(base[d - 1] + rho[d - 1] + rho[d] + ringGap, circ[d]);
      const f = fitScale(root, base);
      const R = base.map((r, d) => d ? r * f : 0);
      computeNeed(root, R);
      assign(root, -Math.PI / 2, TAU, R, cone);
      if (!conflicts(nodes)) break;
      ringGap += 45; cone *= 0.88;
    }
  }

  function layout(root) {
    const nodes = [];
    (function walk(n) { nodes.push(n); n.children.forEach(walk); })(root);
    let maxDepth = 0; nodes.forEach(n => { if (n.depth > maxDepth) maxDepth = n.depth; });
    nodes.forEach(n => measure(n, maxDepth));
    place(root, nodes, maxDepth);
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
