#!/usr/bin/env node
/**
 * VSM LOGO — ROUND 3 "CREATIVE" CONCEPTS (owner asked for more creative, more unique).
 * Each concept carries an IDEA, not just a type treatment:
 *
 *   k-laser     stage lasers: VSM filled with beams converging on one point below (a light fan)
 *   l-ringed    "VSM planet": 7 elliptical rings (the divisions) orbit the word — behind at the top,
 *               in front at the bottom, with clearance gaps (over/under = real depth)
 *   m-gravity   the letters have mass: a field of lines thickens and bends around VSM (the reference line field, warped as physics)
 *   n-ribbon    one folded ribbon: creases at the V/M points, a Möbius twist through the middle of the S
 *   o-monogram  VSM in one glyph: the M's inner valley IS the V; the S weaves over/under through it
 *
 *   node brand/generator/creative.mjs   → brand/concepts/<id>/ + brand/concepts/board-creative.png
 */
import pc from 'polygon-clipping';
import { join } from 'node:path';
import { asMulti, inter, minus, offset, rect, translate, union } from './ops.mjs';
import {
  ACCENTS,
  BG,
  GOLD,
  GOLD_GRAD,
  ROOT,
  bbox,
  clean,
  emit,
  layout,
  magick,
  safe,
  sBand,
  sBandArcD,
  sCentreline,
  solid,
  svgLayers,
  svgWordmark,
} from './geometry.mjs';

const DARK_GOLD = '#8C6D33';
const TAU = Math.PI * 2;

/** Even-odd scanline rasteriser: returns Float32Array mask (1 inside) on a grid with `res` units per cell. */
function rasterize(mp, x0, y0, w, h, res = 1) {
  const cols = Math.ceil(w / res);
  const rows = Math.ceil(h / res);
  const m = new Float32Array(cols * rows);
  const edges = [];
  for (const poly of mp) for (const ring of poly) for (let i = 0; i < ring.length; i++) edges.push([ring[i], ring[(i + 1) % ring.length]]);
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * res;
    const xs = [];
    for (const [[ax, ay], [bx, by]] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - x0) / res - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - x0) / res - 0.5));
      for (let c = c0; c <= c1; c++) m[r * cols + c] = 1;
    }
  }
  return { m, cols, rows, x0, y0, res };
}

function blur(grid, sigma) {
  const { m, cols, rows } = grid;
  const rad = Math.ceil(sigma * 3);
  const k = Array.from({ length: rad * 2 + 1 }, (_, i) => Math.exp(-((i - rad) ** 2) / (2 * sigma * sigma)));
  const ks = k.reduce((a, b) => a + b, 0);
  const tmp = new Float32Array(m.length);
  const out = new Float32Array(m.length);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let s = 0;
      for (let i = -rad; i <= rad; i++) s += (m[r * cols + Math.min(cols - 1, Math.max(0, c + i))] ?? 0) * k[i + rad];
      tmp[r * cols + c] = s / ks;
    }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let s = 0;
      for (let i = -rad; i <= rad; i++) s += (tmp[Math.min(rows - 1, Math.max(0, r + i)) * cols + c] ?? 0) * k[i + rad];
      out[r * cols + c] = s / ks;
    }
  return { ...grid, m: out };
}

function sample(grid, x, y) {
  const { m, cols, rows, x0, y0, res } = grid;
  const fx = (x - x0) / res - 0.5;
  const fy = (y - y0) / res - 0.5;
  const c = Math.max(0, Math.min(cols - 2, Math.floor(fx)));
  const r = Math.max(0, Math.min(rows - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - c));
  const ty = Math.max(0, Math.min(1, fy - r));
  const a = m[r * cols + c];
  const b = m[r * cols + c + 1];
  const d = m[(r + 1) * cols + c];
  const e = m[(r + 1) * cols + c + 1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + d * (1 - tx) * ty + e * tx * ty;
}

/** Solve for the arm angle so a folded V of width `width` and stroke W closes exactly at the bottom. */
function foldAngle(width, W, H = 100) {
  let lo = 0.3;
  let hi = 1.55;
  for (let i = 0; i < 80; i++) {
    const a = (lo + hi) / 2;
    const c = H / Math.tan(a);
    const Wh = W / Math.sin(a);
    // want 2c + Wh = width
    if (2 * c + Wh > width) lo = a;
    else hi = a;
  }
  const a = (lo + hi) / 2;
  return { a, c: H / Math.tan(a), Wh: W / Math.sin(a) };
}

console.log('VSM creative concepts:');
const out = [];

// ---------------------------------------------------------------- K — LASER
{
  const W = 25;
  const L = layout(W, { vs: 2, sm: 10 }, { v: 104, s: 84, m: 124 });
  const base = solid(L, W);
  // Beams converge toward the source, so the fan must span the letters' box at BOTH the top and the
  // bottom edge — taking the extreme angle over all four corners (a top-only span missed the bottom corners).
  const fan = (cx, cy, x0, x1, count, duty = 0.56) => {
    const corners = [[x0, -20], [x1, -20], [x0, 110], [x1, 110]].map(([x, y]) => Math.atan2(y - cy, x - cx));
    const a0 = Math.min(...corners);
    const a1 = Math.max(...corners);
    const step = (a1 - a0) / count;
    const wedges = [];
    for (let i = 0; i <= count; i++) {
      const a = a0 + i * step;
      const h = (step * duty) / 2;
      wedges.push([[[cx, cy], [cx + Math.cos(a - h) * 900, cy + Math.sin(a - h) * 900], [cx + Math.cos(a + h) * 900, cy + Math.sin(a + h) * 900]]]);
    }
    return union(...wedges);
  };
  const logo = clean(inter(base, fan(L.total / 2, 100 + 120, -30, L.total + 30, 52)), 6);
  const vBase = inter(base, rect(-5, -5, 105, 110));
  const mark = clean(inter(vBase, fan(52, 100 + 90, -20, 124, 13, 0.6)), 6);
  const hero = svgWordmark(logo, 0, 'url(#g)', GOLD_GRAD);
  out.push(emit('k-laser', 'K · LASER — VSM made of stage-light beams converging on one point', logo, mark, hero));
}

// ---------------------------------------------------------------- L — RINGED ("VSM planet")
{
  const W = 26;
  const L = layout(W, { vs: 2, sm: 10 }, { v: 104, s: 84, m: 124 });
  const word = solid(L, W);
  const cx = L.total / 2;
  const cy = 52;
  const tilt = (-9 * Math.PI) / 180;
  const ringCount = 7;
  const ringStroke = 2.1;
  const ringGap = 2.3;
  // Half-step phase: no sample lands exactly on the tilted major axis (the behind/in-front cut line).
  const ellipse = (rx, ry, n = 360) =>
    Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * TAU;
      const x = Math.cos(t) * rx;
      const y = Math.sin(t) * ry;
      return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
    });
  const rings = [];
  for (let i = 0; i < ringCount; i++) {
    const rIn = i * (ringStroke + ringGap);
    const rx = 196 + rIn;
    const ry = 30 + rIn * 0.62;
    // annulus between two ellipses (outer CCW, inner as hole)
    rings.push([ellipse(rx + ringStroke, ry + ringStroke * 0.62), ellipse(rx, ry).reverse()]);
  }
  const ringsAll = union(...rings);
  // "behind" = the far half of the ellipse (above its tilted major axis)
  const nx = -Math.sin(tilt);
  const ny = Math.cos(tilt);
  const farHalf = [[[cx - 600 * Math.cos(tilt) - 600 * nx, cy - 600 * Math.sin(tilt) - 600 * ny], [cx + 600 * Math.cos(tilt) - 600 * nx, cy + 600 * Math.sin(tilt) - 600 * ny], [cx + 600 * Math.cos(tilt), cy + 600 * Math.sin(tilt)], [cx - 600 * Math.cos(tilt), cy - 600 * Math.sin(tilt)]]];
  const back = inter(ringsAll, farHalf);
  const front = minus(ringsAll, farHalf);
  const gap = 3.2;
  const backVisible = minus(back, offset(word, gap));
  const wordVisible = minus(word, offset(front, gap));
  const logo = clean(union(backVisible, wordVisible, front), 3);
  // Mark: the V "planet" with a single tilted ring pair — reads at icon size.
  const vWord = inter(word, rect(-5, -5, 105, 110));
  const vc = 52;
  const vEll = (rx, ry, n = 240) =>
    Array.from({ length: n }, (_, i) => {
      const t = ((i + 0.5) / n) * TAU;
      const x = Math.cos(t) * rx;
      const y = Math.sin(t) * ry;
      return [vc + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
    });
  const vRings = union([vEll(76, 22), vEll(70, 18).reverse()], [vEll(86, 28), vEll(80, 24).reverse()]);
  const vFar = translate(farHalf, vc - cx, 0);
  const vBack = minus(inter(vRings, vFar), offset(vWord, gap));
  const vFront = minus(vRings, vFar);
  const mark = clean(union(vBack, minus(vWord, offset(vFront, gap)), vFront), 3);
  // Hero: word in gold, the seven rings in the seven division colours (outer ring = Music).
  const wordHalo = offset(word, gap);
  const perRing = rings.map((r) => union(minus(inter([r], farHalf), wordHalo), minus([r], farHalf)));
  const heroGroups = [wordVisible, ...perRing.slice().reverse()];
  const hero = svgLayers(heroGroups, [GOLD, ...ACCENTS]);
  out.push(emit('l-ringed', 'L · RINGED — the "VSM planet": 7 orbit rings, behind at the top, in front at the bottom', logo, mark, svgWordmark(logo, 0, 'url(#g)', GOLD_GRAD), {
    files: { 'logo-spectrum.svg': hero },
  }));
}

// ---------------------------------------------------------------- M — GRAVITY (lens)
{
  const W = 26;
  const L = layout(W, { vs: 2, sm: 10 }, { v: 104, s: 84, m: 124 });
  const word = solid(L, W);
  const fx0 = -34;
  const fx1 = L.total + 34;
  const fy0 = -26;
  const fy1 = 129;
  const grid = blur(rasterize(word, fx0 - 20, fy0 - 20, fx1 - fx0 + 40, fy1 - fy0 + 40, 1), 3.2);
  const pitch = 4.6;
  const cols = Math.round((fx1 - fx0) / pitch);
  const lines = [];
  for (let i = 0; i <= cols; i++) {
    const x0 = fx0 + i * pitch;
    const left = [];
    const right = [];
    for (let y = fy0; y <= fy1 + 1e-9; y += 1) {
      const m = sample(grid, x0, y);
      const grad = (sample(grid, x0 + 1, y) - sample(grid, x0 - 1, y)) / 2;
      const x = x0 - grad * 16; // lines are pushed OUT of the letters (lensing around mass)
      const w = 0.75 + 2.9 * m; // and thicken inside them
      left.push([x - w / 2, y]);
      right.push([x + w / 2, y]);
    }
    lines.push([[...left, ...right.reverse()]]);
  }
  const logo = clean(union(...lines), 1);
  const vGrid = grid;
  const vLines = [];
  for (let i = 0; i <= 26; i++) {
    const x0 = -16 + i * pitch;
    const left = [];
    const right = [];
    for (let y = fy0; y <= fy1 + 1e-9; y += 1) {
      const m = sample(vGrid, x0, y);
      const grad = (sample(vGrid, x0 + 1, y) - sample(vGrid, x0 - 1, y)) / 2;
      const x = x0 - grad * 16;
      const w = 0.9 + 3.2 * m;
      left.push([x - w / 2, y]);
      right.push([x + w / 2, y]);
    }
    vLines.push([[...left, ...right.reverse()]]);
  }
  const mark = clean(union(...vLines), 1);
  out.push(emit('m-gravity', 'M · GRAVITY — the letters have mass: the line field thickens and bends around VSM', logo, mark, svgWordmark(logo, 0, 'url(#g)', GOLD_GRAD)));
}

// ---------------------------------------------------------------- N — RIBBON (one folded band)
{
  const W = 24;
  const gap = 1.7;
  const H = 100;
  const xV = 0;
  const vW = 106;
  const xS = vW + 4;
  const sW = 96;
  const xM = xS + sW + 10;
  const mW = 130;

  // V: left arm (front) folds at the bottom into the right arm (back) — crease is the flat bottom.
  const v = foldAngle(vW, W, H);
  const vLeft = [[[xV, 0], [xV + v.Wh, 0], [xV + v.c + v.Wh, H], [xV + v.c, H]]];
  const vRight = [[[xV + vW, 0], [xV + vW - v.Wh, 0], [xV + vW - v.c - v.Wh, H], [xV + vW - v.c, H]]];

  // M: stem up → fold → diagonal down → fold at the vertex → diagonal up → fold → stem down.
  const m = foldAngle(mW - 2 * 0, W, H);
  const stemL = rect(xM, 0, xM + W, H);
  const stemR = rect(xM + mW - W, 0, xM + mW, H);
  const d1 = [[[xM, 0], [xM + m.Wh, 0], [xM + m.c + m.Wh, H], [xM + m.c, H]]];
  const d2 = [[[xM + mW, 0], [xM + mW - m.Wh, 0], [xM + mW - m.c - m.Wh, H], [xM + mW - m.c, H]]];

  // S: stadium band split into front (top bar + left turn), a Möbius twist (middle bar), back (right turn + bottom bar).
  const sc = sCentreline(xS, sW, W);
  const { yM, cxL, cxR } = sc.params;
  const N = (sc.pts.length - 2) / 2 - 1; // samples per semicircle
  const slice = (a, b) => ({ pts: sc.pts.slice(a, b), normals: sc.normals.slice(a, b) });
  const sFront = sBand(slice(0, N + 2), 0, W);
  const sBack = sBand(slice(N + 2, sc.pts.length), 0, W);
  const xm = (cxL + cxR) / 2;
  const twistA = [[[cxL, yM - W / 2], [xm - 0.9, yM], [cxL, yM + W / 2]]];
  const twistB = [[[xm + 0.9, yM], [cxR, yM - W / 2], [cxR, yM + W / 2]]];

  // Layer order = fold order (each later segment lies on top of the one before it).
  const layers = [
    { g: vLeft, tone: 'front' },
    { g: vRight, tone: 'back' },
    { g: union(sFront, twistA), tone: 'front' },
    { g: union(twistB, sBack), tone: 'back' },
    { g: stemL, tone: 'front' },
    { g: d1, tone: 'back' },
    { g: d2, tone: 'front' },
    { g: stemR, tone: 'back' },
  ].map((l) => ({ ...l, g: asMulti(l.g) }));
  // Mono: every layer loses a thin sliver wherever a LATER layer sits on it → the folds stay legible in one colour.
  const mono = layers.map((l, i) => {
    let g = l.g;
    for (const later of layers.slice(i + 1)) g = minus(g, offset(inter(later.g, offset(g, gap + 0.5)), gap));
    return g;
  });
  const logo = clean(union(...mono), 2);
  const vOnly = clean(union(mono[0], mono[1]), 2);
  const twoTone = svgLayers(
    layers.map((l) => l.g),
    layers.map((l) => (l.tone === 'front' ? GOLD : DARK_GOLD)),
  );
  // Lit hero: satin gradients — front faces catch the light, back faces fall into bronze.
  const litDefs =
    '<defs>' +
    '<linearGradient id="rf" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#F6E3A8"/><stop offset=".55" stop-color="#D8B86A"/><stop offset="1" stop-color="#B8954A"/></linearGradient>' +
    '<linearGradient id="rb" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#A5823F"/><stop offset=".6" stop-color="#7A5C28"/><stop offset="1" stop-color="#5A4219"/></linearGradient>' +
    '</defs>';
  const lit = svgLayers(
    layers.map((l) => l.g),
    layers.map((l) => (l.tone === 'front' ? 'url(#rf)' : 'url(#rb)')),
  ).replace(/(<svg[^>]*>)/, `$1${litDefs}`);
  // Duo (for the site): front faces fixed gold, back faces = currentColor → CSS sets it to the division accent.
  const duo = svgLayers(
    layers.map((l) => l.g),
    layers.map((l) => (l.tone === 'front' ? GOLD : 'currentColor')),
  );
  out.push(
    emit('n-ribbon', 'N · RIBBON — one folded band; creases at the points, a Möbius twist through the S', logo, vOnly, lit, {
      files: { 'logo-two-tone.svg': twoTone, 'logo-duo.svg': duo },
    }),
  );
}

// ---------------------------------------------------------------- O — MONOGRAM (VSM in one glyph)
{
  const W = 21;
  const gap = 3;
  const H = 100;
  const mW = 136;
  const m = foldAngle(mW, W, H);
  const stemL = rect(0, 0, W, H);
  const stemR = rect(mW - W, 0, mW, H);
  const d1 = [[[0, 0], [m.Wh, 0], [m.c + m.Wh, H], [m.c, H]]];
  const d2 = [[[mW, 0], [mW - m.Wh, 0], [mW - m.c - m.Wh, H], [mW - m.c, H]]];
  const M = union(stemL, stemR, d1, d2);
  // The S is taller than the M so it reads as its own letter, and weaves: OVER the left diagonal, UNDER the right.
  const sW = 70;
  const sH = 128;
  const sScale = sH / 100;
  const sx = (mW - sW) / 2;
  const sc = sCentreline(0, sW / sScale, W / sScale);
  const Sraw = sBand(sc, 0, W / sScale);
  const S = asMulti(Sraw).map((poly) => poly.map((ring) => ring.map(([x, y]) => [sx + x * sScale, -14 + y * sScale])));
  // over/under: split the S by the vertical midline
  const leftHalf = rect(-50, -60, mW / 2, 200);
  const rightHalf = rect(mW / 2, -60, mW + 50, 200);
  const sLeft = inter(S, leftHalf);
  const sRight = inter(S, rightHalf);
  const d2Over = d2; // right diagonal passes over the S's right half
  const logo = clean(
    union(
      minus(union(stemL, stemR, d1), offset(sLeft, gap)), // S over left side of the M
      sLeft,
      minus(sRight, offset(d2Over, gap)), // S under the right diagonal
      minus(d2, offset(sLeft, gap)),
    ),
    3,
  );
  const hero = svgWordmark(logo, 0, 'url(#g)', GOLD_GRAD);
  out.push(emit('o-monogram', 'O · MONOGRAM — VSM in one glyph: the M’s valley is the V, the S weaves over/under', logo, logo, hero));
  void M;
}

// ---------------------------------------------------------------- P — TWIST (v3 — the chosen direction)
// ONE RULE, EVERY LETTER: each letter is a single ribbon with one 180° twist, so it is half FRONT (gold) and half
// BACK (the division accent). v3 applies the verifier's findings:
//   • S: square inner counters (no "ball hooks"); the twist is a PINCHED WAIST (7 % neck) with V-notches above and
//     below — one connected shape, the ✕ carried by the negative space, visible down to icon sizes
//   • V / M: counters taper in one straight line to a point above a SOLID tip (no kink, no hairline slivers)
//   • dedicated small-size S (wider neck, bigger notches) for ≤ 32 px
{
  const W = 24;
  const H = 100;
  const OV = 3; // optical overshoot of the points below the baseline
  const TIP_SOLID = 15; // solid tip height under the V/M counters (≥ 3 % everywhere — fabrication safe)
  const ARC_N = 64;

  /** V pair: outer edges run straight to the apex; inner edges run straight to a counter tip above a solid point. */
  const twistedV = (x0, width) => {
    const apex = [x0 + width / 2, H + OV];
    const tan = (H + OV) / (width / 2);
    const Wh = W / Math.sin(Math.atan(tan));
    const cTip = [x0 + width / 2, H + OV - TIP_SOLID];
    const left = [[[x0, 0], [x0 + Wh, 0], cTip, apex]];
    const right = [[[x0 + width, 0], apex, cTip, [x0 + width - Wh, 0]]];
    return { left, right };
  };

  /** Stadium half: rectangle with a full semicircle on the left (or right) end. Outline is a simple CCW-free loop:
   *  left:  (x1,y0) → (x1,y1) → arc bottom → left → top
   *  right: (x0,y1) → (x0,y0) → arc top → right → bottom                                                        */
  const stadiumHalf = (x0, y0, x1, y1, side) => {
    const R = (y1 - y0) / 2;
    const cy = y0 + R;
    const pts = [];
    if (side === 'left') {
      const cx = x0 + R;
      pts.push([x1, y0], [x1, y1]);
      for (let k = 0; k <= ARC_N; k++) {
        const a = Math.PI / 2 + (k / ARC_N) * Math.PI; // 90° (bottom) → 180° (left) → 270° (top)
        pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      }
    } else {
      const cx = x1 - R;
      pts.push([x0, y1], [x0, y0]);
      for (let k = 0; k <= ARC_N; k++) {
        const a = -Math.PI / 2 + (k / ARC_N) * Math.PI; // -90° (top) → 0° (right) → 90° (bottom)
        pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      }
    }
    return [pts];
  };

  /** The twisted S. neck = width of the pinch; notchHalf = notch half-angle (deg). Returns front/back halves. */
  const twistedS = (x0, sw, neck, notchHalfDeg) => {
    const yT = H / 2 - W / 2;
    const yB = H / 2 + W / 2;
    const R = yB / 2; // both turns are full semicircles of the same radius
    // Each half yields the middle band to the OTHER half's rounded turn, so neither squares off the other's curve.
    const upperC = minus(stadiumHalf(x0, 0, x0 + sw, yB, 'left'), union(rect(x0 + W, W, x0 + sw + 5, yT), rect(x0 + sw - R, yT, x0 + sw + 5, yB + 5)));
    const lowerC = minus(stadiumHalf(x0, yT, x0 + sw, H, 'right'), union(rect(x0 - 5, yB, x0 + sw - W, H - W), rect(x0 - 5, yT - 5, x0 + R, yB)));
    const xm = x0 + sw / 2;
    const depth = (W - neck) / 2;
    const T = depth * Math.tan((notchHalfDeg * Math.PI) / 180);
    const notches = union(
      [[[xm - T, yT - 0.5], [xm + T, yT - 0.5], [xm, H / 2 - neck / 2]]],
      [[[xm - T, yB + 0.5], [xm, H / 2 + neck / 2], [xm + T, yB + 0.5]]],
    );
    const whole = minus(union(upperC, lowerC), notches);
    const frontZone = union(rect(x0 - 10, -10, x0 + sw + 10, yT), rect(x0 - 10, yT - 0.001, xm, yB + 0.001));
    return { front: inter(whole, frontZone), back: minus(whole, frontZone), whole };
  };

  const xV = 0;
  const vW = 110;
  const xS = vW + 5;
  const sW = 100;
  const xM = xS + sW + 12;
  const mW = 136;

  const V = twistedV(xV, vW);
  const MV = twistedV(xM, mW);
  const mFront = union(rect(xM, 0, xM + W, H), MV.left);
  const mBack = union(MV.right, rect(xM + mW - W, 0, xM + mW, H));
  const S = twistedS(xS, sW, 7, 50);

  const halves = [
    { g: asMulti(V.left), tone: 'front' },
    { g: asMulti(V.right), tone: 'back' },
    { g: S.front, tone: 'front' },
    { g: S.back, tone: 'back' },
    { g: mFront, tone: 'front' },
    { g: mBack, tone: 'back' },
  ];
  const logo = clean(union(...halves.map((h) => h.g)), 2);

  const litDefs =
    '<defs>' +
    '<linearGradient id="rf" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#F6E3A8"/><stop offset=".55" stop-color="#D8B86A"/><stop offset="1" stop-color="#B8954A"/></linearGradient>' +
    '<linearGradient id="rb" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#A5823F"/><stop offset=".6" stop-color="#7A5C28"/><stop offset="1" stop-color="#5A4219"/></linearGradient>' +
    '</defs>';
  const tones = (front, back) => halves.map((h) => (h.tone === 'front' ? front : back));
  const lit = svgLayers(halves.map((h) => h.g), tones('url(#rf)', 'url(#rb)')).replace(/(<svg[^>]*>)/, `$1${litDefs}`);
  const duo = svgLayers(halves.map((h) => h.g), tones(GOLD, 'currentColor'));

  // Icon = the twisted S (the ownable part). Small cut: wider neck + wider notches so the pinch survives 16–32 px.
  const small = twistedS(0, sW, 11, 55);
  const sIconDuo = svgLayers([S.front, S.back], [GOLD, 'currentColor']);
  const sSmallDuo = svgLayers([small.front, small.back], [GOLD, 'currentColor']);

  out.push(
    emit('p-twist', 'P · TWIST v3 — one ribbon, one twist per letter: gold front, accent back', logo, S.whole, lit, {
      markSmall: small.whole,
      files: { 'logo-duo.svg': duo, 'mark-duo.svg': sIconDuo, 'mark-small-duo.svg': sSmallDuo },
    }),
  );
}

// ---------------------------------------------------------------- board
const board = join(ROOT, 'board-creative.png');
magick(
  '-background', BG,
  ...out.flatMap(({ dir }) => [join(dir, 'renders', 'logo-hero.png'), join(dir, 'renders', 'masthead.png'), join(dir, 'renders', 'mark-dark-256.png')]),
  '-gravity', 'north', '-splice', '0x40', '-gravity', 'center', '-append', '-resize', '1400x', board,
);
console.log('  ✓ board-creative.png');
void bbox;
void sBandArcD;
