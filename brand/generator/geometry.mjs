/**
 * VSM LOGO GEOMETRY — shared, parametric building blocks for every logo concept script.
 *
 * Skeleton (cap height H = 100, y grows downward like SVG):
 *   V  — two diagonal strokes meeting in a pointed apex (optical overshoot below the baseline)
 *   S  — "stadium" S: three horizontal bars joined by two semicircles (open counters at bold weights;
 *        its offset curves are exact, so parallel lines/bands can follow it perfectly)
 *   M  — two stems + an inner V whose vertex reaches the baseline
 * Tools: polygon booleans (polygon-clipping, wrapped by `safe`), exact-arc S bands, SVG writers with vertex
 * simplification, rsvg/ImageMagick renderers and a contact-sheet builder (`emit`).
 * Output rules for every logo: filled paths only, currentColor, fill-rule evenodd → favicon/CSS/three.js safe.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pc from 'polygon-clipping';

export const ROOT = resolve(import.meta.dirname, '..', 'concepts');
export const GOLD = '#D8B86A';
export const BG = '#0A0806';
export const LIGHT = '#F4F1EA';
export const ACCENTS = ['#E6BFC1', '#E1C4AE', '#CFC4E4', '#B7D3BB', '#B1CFE5', '#A9D4D3', '#CCCEAC'];
export const LABEL_FONT = '/System/Library/Fonts/SFNSMono.ttf'; // contact-sheet labels only (macOS); not part of any logo

// ---------------------------------------------------------------- vector helpers
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const norm = (a) => {
  const l = Math.hypot(a[0], a[1]);
  return [a[0] / l, a[1] / l];
};
export const area = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
};
export const polyArea = (poly) => Math.abs(area(poly[0])) - poly.slice(1).reduce((s, r) => s + Math.abs(area(r)), 0);
/** Drop slivers smaller than `min` square units (they vanish when rendered and break extrusion). */
export const clean = (mp, min = 6) => mp.filter((poly) => polyArea(poly) >= min);

/** Thin band parallel to direction d, at distance t (to its centre) from an edge line through p, along inward normal n. */
export function band(p, d, n, t, w, half = 400) {
  const a = add(p, mul(n, t - w / 2));
  const b = add(p, mul(n, t + w / 2));
  return [[add(a, mul(d, -half)), add(a, mul(d, half)), add(b, mul(d, half)), add(b, mul(d, -half))]];
}

/** Offsets (distance from the stroke edge to each line centre) for `count` lines of width w with gaps g. */
export function lineOffsets(W, count, ratio) {
  const g = W / (count * ratio + (count - 1));
  const w = g * ratio;
  return { w, g, offsets: Array.from({ length: count }, (_, i) => w / 2 + i * (w + g)) };
}

// ---------------------------------------------------------------- skeleton
export function vGeometry(x0, width, W, ov) {
  const apex = [x0 + width / 2, 100 + ov];
  const dL = norm([width / 2, 100 + ov]); // outer-left edge direction (down-right)
  const sin = dL[1];
  const Wh = W / sin; // horizontal stroke thickness that gives perpendicular weight W
  const tan = (100 + ov) / (width / 2);
  const yi = (width / 2 - Wh) * tan;
  const silhouette = [[[x0, 0], [x0 + Wh, 0], [x0 + width / 2, yi], [x0 + width - Wh, 0], [x0 + width, 0], apex]];
  const left = { p: [x0, 0], d: dL, n: [dL[1], -dL[0]] };
  const dR = norm([-width / 2, 100 + ov]);
  const right = { p: [x0 + width, 0], d: dR, n: [-dR[1], dR[0]] };
  return { silhouette, edges: [left, right], Wh };
}

export function mGeometry(x0, width, W, ov) {
  const inner = vGeometry(x0, width, W, ov);
  const stemL = [[[x0, 0], [x0 + W, 0], [x0 + W, 100], [x0, 100]]];
  const stemR = [[[x0 + width - W, 0], [x0 + width, 0], [x0 + width, 100], [x0 + width - W, 100]]];
  const silhouette = pc.union(stemL, stemR, inner.silhouette);
  const stemEdges = [
    { p: [x0, 0], d: [0, 1], n: [1, 0] },
    { p: [x0 + width, 0], d: [0, 1], n: [-1, 0] },
  ];
  return {
    silhouette,
    edges: [...stemEdges, ...inner.edges],
    // Split parts let treatments keep the stems' lines clean (no lattice where diagonals cross the stems).
    stems: { silhouette: pc.union(stemL, stemR), edges: stemEdges },
    diagonals: { silhouette: pc.difference(inner.silhouette, pc.union(stemL, stemR)), edges: inner.edges },
  };
}

/** Stadium-S centreline as a dense polyline with per-point unit normals. */
export function sCentreline(x0, width, W) {
  const yT = W / 2;
  const yM = 50;
  const yB = 100 - W / 2;
  const r = (yM - yT) / 2;
  const cxL = x0 + r + W / 2;
  const cxR = x0 + width - r - W / 2;
  // Points carry their ANALYTIC tangent, so straight bars need only their end points and
  // arcs only enough samples for sub-0.01-unit chord error — small files, exact offsets.
  const pts = [];
  const tans = [];
  const push = (p, t) => {
    pts.push(p);
    tans.push(t);
  };
  const N = 64; // samples per semicircle (≈2.8°): chord error < 0.01 units at r ≈ 20
  // top bar: right terminal → left
  push([x0 + width, yT], [-1, 0]);
  // left turn: 270° → 90° through 180° (counter-clockwise on screen); tangent = −d/da
  for (let k = 0; k <= N; k++) {
    const a = 1.5 * Math.PI - (k / N) * Math.PI;
    push([cxL + r * Math.cos(a), yT + r + r * Math.sin(a)], [Math.sin(a), -Math.cos(a)]);
  }
  // middle bar → right turn: 270° → 450° through 360° (clockwise); tangent = +d/da
  for (let k = 0; k <= N; k++) {
    const a = 1.5 * Math.PI + (k / N) * Math.PI;
    push([cxR + r * Math.cos(a), yM + r + r * Math.sin(a)], [-Math.sin(a), Math.cos(a)]);
  }
  // bottom bar: → left terminal
  push([x0, yB], [-1, 0]);
  const normals = tans.map(([tx, ty]) => [ty, -tx]); // left-hand normal of travel direction
  return { pts, normals, params: { x0, width, yT, yM, yB, r, cxL, cxR } };
}

/**
 * Exact S band as an SVG path with ARC commands (no polygon sampling): edge offsets e1 < e2 measured along
 * the left-hand normal. Normal points down on the top/bottom bars and up on the middle bar, so the left
 * turn's radius is r − e and the right turn's is r + e. Transform (tx, ty, s) matches pathD().
 */
export function sBandArcD({ x0, width, yT, yM, yB, r, cxL, cxR }, e1, e2, tx = 0, ty = 0, s = 1) {
  const X = (x) => f((x + tx) * s);
  const Y = (y) => f((y + ty) * s);
  const R = (v) => f(v * s);
  return (
    `M${X(x0 + width)} ${Y(yT + e1)}L${X(cxL)} ${Y(yT + e1)}` +
    `A${R(r - e1)} ${R(r - e1)} 0 0 0 ${X(cxL)} ${Y(yM - e1)}L${X(cxR)} ${Y(yM - e1)}` +
    `A${R(r + e1)} ${R(r + e1)} 0 0 1 ${X(cxR)} ${Y(yB + e1)}L${X(x0)} ${Y(yB + e1)}` +
    `L${X(x0)} ${Y(yB + e2)}L${X(cxR)} ${Y(yB + e2)}` +
    `A${R(r + e2)} ${R(r + e2)} 0 0 0 ${X(cxR)} ${Y(yM - e2)}L${X(cxL)} ${Y(yM - e2)}` +
    `A${R(r - e2)} ${R(r - e2)} 0 0 1 ${X(cxL)} ${Y(yT + e2)}L${X(x0 + width)} ${Y(yT + e2)}Z`
  );
}

/** Band of width w along the centreline, offset by t (−W/2…W/2). */
export function sBand({ pts, normals }, t, w) {
  const a = pts.map((p, i) => add(p, mul(normals[i], t - w / 2)));
  const b = pts.map((p, i) => add(p, mul(normals[i], t + w / 2)));
  return [[...a, ...b.reverse()]];
}

export function layout(W, gaps = { vs: 3, sm: 10 }, widths = { v: 100, s: 80, m: 118 }, ov = 3) {
  const xV = 0;
  const xS = widths.v + gaps.vs;
  const xM = xS + widths.s + gaps.sm;
  return {
    V: vGeometry(xV, widths.v, W, ov),
    S: { centre: sCentreline(xS, widths.s, W), x0: xS, width: widths.s },
    M: mGeometry(xM, widths.m, W, ov),
    total: xM + widths.m,
    ov,
  };
}

// ---------------------------------------------------------------- treatments
export function solid(L, W) {
  return pc.union(L.V.silhouette, sBand(L.S.centre, 0, W), L.M.silhouette);
}

/**
 * polygon-clipping can fail to assemble rings when edges are *exactly* collinear (a line's outer edge lying
 * on the letter's outer edge). Nudge by an invisible epsilon, and retry with a tiny jitter if it still fails.
 */
export const EPS = 1e-4;
export function safe(op, ...geoms) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return op(...geoms);
    } catch (err) {
      const j = (attempt + 1) * 1e-5;
      const jitterRing = (ring) => ring.map(([x, y]) => [x + j, y - j]);
      // polygon-clipping accepts a Polygon (ring[]) or a MultiPolygon (Polygon[]) — jitter both shapes.
      const isPolygon = (g) => typeof g[0]?.[0]?.[0] === 'number';
      geoms = geoms.map((g) => (isPolygon(g) ? g.map(jitterRing) : g.map((poly) => poly.map(jitterRing))));
      if (attempt === 3) throw err;
    }
  }
  return [];
}

/**
 * Lines treatment. Returns `byLine[i]` = every piece belonging to line i (0 = outer edge … count-1),
 * so hero variants can colour line i with division i; `all` is their union.
 * cleanStems: M's diagonals stop at the stems (lattices only at the V apex and the M vertex, which rhyme).
 */
export function lines(L, W, { count = 7, ratio = 1.55, cleanStems = true } = {}) {
  const { w, offsets } = lineOffsets(W, count, ratio);
  const piece = (e, t, silhouette) => safe(pc.intersection, band(e.p, e.d, e.n, t + EPS, w - 2 * EPS, 250), silhouette);
  const parts = cleanStems
    ? [
        [L.V.edges, L.V.silhouette],
        [L.M.stems.edges, L.M.stems.silhouette],
        [L.M.diagonals.edges, L.M.diagonals.silhouette],
      ]
    : [
        [L.V.edges, L.V.silhouette],
        [L.M.edges, L.M.silhouette],
      ];
  // V + M lines are clipped polygons; the S never overlaps them, so its bands are emitted as exact SVG arcs.
  const byLine = offsets.map((t) => clean(safe(pc.union, ...parts.flatMap(([edges, sil]) => edges.map((e) => piece(e, t, sil)))), 2));
  const sEdges = offsets.map((t) => [t - W / 2 - w / 2, t - W / 2 + w / 2]);
  const sp = L.S.centre.params;
  const arcsFor = (idx) => (tx, ty, s) => idx.map((i) => sBandArcD(sp, sEdges[i][0], sEdges[i][1], tx, ty, s)).join('');
  return {
    byLine,
    all: clean(safe(pc.union, ...byLine), 2),
    arcsD: arcsFor(offsets.map((_, i) => i)), // every S band
    arcsByLine: offsets.map((_, i) => arcsFor([i])), // S band i only (for per-line colouring)
  };
}
export const sevenLines = (L, W, opts) => {
  const r = lines(L, W, opts);
  return { polys: r.all, arcsD: r.arcsD };
};

export function slice(L, W, { count = 7, angle = 67, width = 2.8, start = 30, spacing = null } = {}) {
  const base = solid(L, W);
  const d = norm([Math.cos((angle * Math.PI) / 180), -Math.sin((angle * Math.PI) / 180)]);
  const n = [-d[1], d[0]];
  const step = spacing ?? (L.total - start * 2) / (count - 1);
  const cuts = Array.from({ length: count }, (_, i) => band([start + i * step, 50], d, n, 0, width));
  return clean(pc.difference(base, pc.union(...cuts)), 10);
}

export function field(L, W, { pitch = 5.2, thick = 0.64, thin = 0.16, top = 0, bottom = 100 } = {}) {
  const base = solid(L, W);
  const cols = Math.round(L.total / pitch);
  const p = L.total / cols;
  const bars = [];
  const hair = [];
  for (let i = 0; i <= cols; i++) {
    const x = i * p;
    bars.push([[[x - (p * thick) / 2, -10], [x + (p * thick) / 2, -10], [x + (p * thick) / 2, 120], [x - (p * thick) / 2, 120]]]);
    hair.push([[[x - (p * thin) / 2, top], [x + (p * thin) / 2, top], [x + (p * thin) / 2, bottom], [x - (p * thin) / 2, bottom]]]);
  }
  return clean(pc.union(pc.intersection(pc.union(...bars), base), ...hair), 1);
}

export function equalizer(L, W, { bands = 7, gap = 3.2, skewDeg = 11 } = {}) {
  const base = solid(L, W);
  const h = (100 + L.ov - gap * (bands - 1)) / bands;
  const rows = Array.from({ length: bands }, (_, i) => {
    const y0 = i * (h + gap);
    return [[[-50, y0], [L.total + 50, y0], [L.total + 50, y0 + h], [-50, y0 + h]]];
  });
  const k = Math.tan((skewDeg * Math.PI) / 180);
  const out = clean(pc.intersection(base, pc.union(...rows)), 4);
  return out.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + (100 - y) * k, y])));
}

// ---------------------------------------------------------------- SVG output
export function bbox(mp) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of mp) for (const ring of poly) for (const [x, y] of ring) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export const f = (v) => (Math.round(v * 100) / 100).toString();
/**
 * Round, then drop duplicate vertices and collinear PASS-THROUGH vertices. A collinear vertex where the
 * outline reverses direction (a → b → back toward a) is a real corner of a lattice channel and must stay —
 * removing it would let the outline cut straight across a counter.
 */
export function simplifyRing(ring) {
  let pts = ring.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop(); // Z closes the ring
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const dup = a[0] === b[0] && a[1] === b[1];
      const abx = b[0] - a[0], aby = b[1] - a[1], bcx = c[0] - b[0], bcy = c[1] - b[1];
      const collinear = Math.abs(abx * bcy - aby * bcx) < 1e-6;
      const forward = abx * bcx + aby * bcy > 0;
      if (dup || (collinear && forward)) {
        pts.splice(i, 1); // remove in place so neighbours are always current
        i--;
        changed = true;
      }
    }
  }
  return pts;
}
export function pathD(mp, tx = 0, ty = 0, s = 1) {
  return mp
    .map((poly) =>
      poly
        .map((ring) => simplifyRing(ring))
        .filter((ring) => ring.length >= 3)
        .map((ring) => 'M' + ring.map(([x, y]) => `${f((x + tx) * s)} ${f((y + ty) * s)}`).join('L') + 'Z')
        .join(''),
    )
    .join('');
}
/** A logo shape is either a MultiPolygon or { polys, arcsD(tx, ty, s) } (extra exact-arc subpaths, e.g. the S). */
export const shapeOf = (x) => (Array.isArray(x) ? { polys: x, arcsD: null } : x);
export function svgWordmark(shape, pad = 0, fill = 'currentColor', defs = '') {
  const { polys, arcsD } = shapeOf(shape);
  const b = bbox(polys);
  const d = pathD(polys, pad - b.x0, pad - b.y0) + (arcsD ? arcsD(pad - b.x0, pad - b.y0, 1) : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(b.w + pad * 2)} ${f(b.h + pad * 2)}">${defs}<path fill="${fill}" fill-rule="evenodd" d="${d}"/></svg>\n`;
}
export function svgSquare(shape, size = 512, pad = 64, fill = 'currentColor') {
  const { polys, arcsD } = shapeOf(shape);
  const b = bbox(polys);
  const s = (size - pad * 2) / Math.max(b.w, b.h);
  const tx = (size - b.w * s) / 2 / s - b.x0;
  const ty = (size - b.h * s) / 2 / s - b.y0;
  const d = pathD(polys, tx, ty, s) + (arcsD ? arcsD(tx, ty, s) : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><path fill="${fill}" fill-rule="evenodd" d="${d}"/></svg>\n`;
}
export const GOLD_GRAD = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6E4AE"/><stop offset=".45" stop-color="#D8B86A"/><stop offset="1" stop-color="#8C6D33"/></linearGradient></defs>';
/** Hero: each of the seven bands/lines tinted by one division (only meaningful for banded concepts). */
export function svgSpectrum(mp, groupOf) {
  const b = bbox(mp);
  const groups = ACCENTS.map(() => []);
  for (const poly of mp) groups[groupOf(poly)].push(poly);
  const paths = groups.map((g, i) => (g.length ? `<path fill="${ACCENTS[i]}" fill-rule="evenodd" d="${pathD(g, -b.x0, -b.y0)}"/>` : '')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(b.w)} ${f(b.h)}">${paths}</svg>\n`;
}

// ---------------------------------------------------------------- rendering
export function render(svgText, out, { w, h, bg, color }) {
  const tmp = out.replace(/\.png$/, '.tmp.svg');
  writeFileSync(tmp, svgText.replace(/currentColor/g, color ?? GOLD));
  const args = ['-b', bg];
  if (w) args.push('-w', String(w));
  if (h) args.push('-h', String(h));
  execFileSync('rsvg-convert', [...args, tmp, '-o', out]);
  execFileSync('rm', [tmp]);
}
export const magick = (...args) => execFileSync('magick', args);

export function sheetFor(dir, title) {
  const r = (n) => join(dir, 'renders', n);
  magick('-size', '1800x110', `xc:${BG}`, '-font', LABEL_FONT, '-fill', GOLD, '-pointsize', '34', '-gravity', 'west', '-annotate', '+40+0', title, r('_title.png'));
  // masthead test: logo 40px tall on a 600x80 dark bar
  magick('-size', '600x80', `xc:${BG}`, r('logo-h40.png'), '-gravity', 'west', '-geometry', '+24+0', '-composite', r('masthead.png'));
  // small marks row: 64 / 32 / 16 at actual size, then ×8 zoom of 16 and ×4 of 32
  magick(r('mark-16.png'), '-filter', 'point', '-resize', '800%', r('_m16x8.png'));
  magick(r('mark-32.png'), '-filter', 'point', '-resize', '400%', r('_m32x4.png'));
  magick('-background', BG, r('mark-64.png'), r('mark-32.png'), r('mark-16.png'), r('_m32x4.png'), r('_m16x8.png'), '-gravity', 'northwest', '-splice', '30x30', '-gravity', 'center', '+append', r('_smalls.png'));
  magick('-background', BG, r('mark-dark-256.png'), r('mark-light-256.png'), '-gravity', 'northwest', '-splice', '30x30', '+append', r('_marks.png'));
  magick(
    '-background', BG,
    r('_title.png'), r('logo-hero.png'), r('logo-dark.png'), r('logo-light.png'), r('masthead.png'), r('_marks.png'), r('_smalls.png'),
    '-gravity', 'north', '-splice', '0x28', '-gravity', 'west', '-append', '-extent', '1800x', join(dir, 'sheet.png'),
  );
  for (const tmp of ['_title', '_m16x8', '_m32x4', '_smalls', '_marks']) execFileSync('rm', [r(tmp + '.png')]);
}

/** Same geometry frame for every layer so coloured layers register exactly. */
export function svgLayers(groups, colors, arcsByGroup = []) {
  const b = bbox(groups.flat());
  const paths = groups
    .map((g, i) => {
      const d = pathD(g, -b.x0, -b.y0) + (arcsByGroup[i] ? arcsByGroup[i](-b.x0, -b.y0, 1) : '');
      return d ? `<path fill="${colors[i % colors.length]}" fill-rule="evenodd" d="${d}"/>` : '';
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(b.w)} ${f(b.h)}">${paths}</svg>\n`;
}

/**
 * extras.markSmall — optional simplified mark for ≤32px (favicons). Identity systems routinely redraw
 *                    for small sizes; hairlines that look rich at 512px average into a dim blur at 16px.
 * extras.files     — additional named SVG files (e.g. the spectrum hero).
 */
export function emit(id, title, wordmark, mark, hero, extras = {}) {
  const dir = join(ROOT, id);
  mkdirSync(join(dir, 'renders'), { recursive: true });
  const logoSvg = svgWordmark(wordmark);
  const markSvg = svgSquare(mark);
  const smallSvg = extras.markSmall ? svgSquare(extras.markSmall, 512, 40) : markSvg;
  writeFileSync(join(dir, 'logo.svg'), logoSvg);
  writeFileSync(join(dir, 'mark.svg'), markSvg);
  if (extras.markSmall) writeFileSync(join(dir, 'mark-small.svg'), smallSvg);
  writeFileSync(join(dir, 'logo-hero.svg'), hero);
  for (const [name, text] of Object.entries(extras.files ?? {})) writeFileSync(join(dir, name), text);
  const r = (n) => join(dir, 'renders', n);
  render(hero, r('logo-hero.png'), { w: 1600, bg: BG });
  for (const [name, text] of Object.entries(extras.files ?? {})) render(text, r(name.replace(/\.svg$/, '.png')), { w: 1600, bg: BG });
  render(logoSvg, r('logo-dark.png'), { w: 1200, bg: BG });
  render(logoSvg, r('logo-light.png'), { w: 1200, bg: LIGHT, color: '#111111' });
  render(logoSvg, r('logo-h40.png'), { h: 40, bg: BG });
  render(markSvg, r('mark-dark-256.png'), { w: 256, bg: BG });
  render(markSvg, r('mark-light-256.png'), { w: 256, bg: LIGHT, color: '#111111' });
  render(markSvg, r('mark-64.png'), { w: 64, bg: BG });
  for (const s of [32, 16]) render(smallSvg, r(`mark-${s}.png`), { w: s, bg: BG });
  sheetFor(dir, title);
  console.log('  ✓', id);
  return { id, dir };
}

