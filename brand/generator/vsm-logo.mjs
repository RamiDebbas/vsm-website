#!/usr/bin/env node
/**
 * VSM LOGO — ROUND 2 CONCEPTS (reference-driven: line-built letters, a line field, slanted slices).
 *   npm run logo   → brand/concepts/{f-seven-lines,g-slice,h-field,i-equalizer}/ + board.png
 * Geometry lives in ./geometry.mjs.
 */
import pc from 'polygon-clipping';
import { join } from 'node:path';
import { ACCENTS, BG, EPS, GOLD, GOLD_GRAD, LABEL_FONT, LIGHT, ROOT, add, area, band, bbox, clean, emit, equalizer, f, field, layout, lineOffsets, lines, mGeometry, magick, mul, norm, pathD, polyArea, render, sBand, sBandArcD, sCentreline, safe, sevenLines, shapeOf, sheetFor, simplifyRing, slice, solid, svgLayers, svgSpectrum, svgSquare, svgWordmark, vGeometry } from './geometry.mjs';

// ---------------------------------------------------------------- concepts
console.log('VSM logo concepts:');
const out = [];

{ // F — SEVEN LINES (line-built letters)
  const W = 23;
  const L = layout(W, { vs: 2, sm: 11 }, { v: 100, s: 80, m: 120 });
  const F = lines(L, W);
  const logo = { polys: F.all, arcsD: F.arcsD };
  const vBox = [[[-10, -10], [101, -10], [101, 120], [-10, 120]]];
  // Mark = the seven-line V alone (its apex lattice is the most distinctive detail).
  const mark = pc.intersection(F.all, vBox);
  // Small-size cut: same V, three heavier lines — survives 16–32px.
  const markSmall = pc.intersection(lines(L, W, { count: 3, ratio: 2.2 }).all, vBox);
  out.push(
    emit('f-seven-lines', 'F · SEVEN LINES — every stroke = 7 lines (one per division)', logo, mark, svgWordmark(logo, 0, 'url(#g)', GOLD_GRAD), {
      markSmall,
      // Spectrum: line i wears division i's accent (outer line = Music … inner = Development).
      files: { 'logo-spectrum.svg': svgLayers(F.byLine, ACCENTS, F.arcsByLine) },
    }),
  );
}

{ // G — SLICE (slanted-cut DNA)
  const W = 27;
  const L = layout(W, { vs: 1, sm: 10 }, { v: 104, s: 86, m: 124 });
  const logo = slice(L, W, { count: 7, angle: 66, width: 3.2, start: 24 });
  const vMark = slice({ ...L, total: 104 }, W, { count: 3, angle: 66, width: 5, start: 26, spacing: 26 });
  const vOnly = pc.intersection(vMark, [[[-10, -10], [105, -10], [105, 120], [-10, 120]]]);
  out.push(emit('g-slice', 'G · SLICE — heavy VSM cut by 7 parallel slanted slices', logo, vOnly, svgWordmark(logo, 0, 'url(#g)', GOLD_GRAD)));
}

{ // H — FIELD (line field)
  const W = 25;
  const L = layout(W, { vs: 2, sm: 10 }, { v: 102, s: 82, m: 120 });
  const logo = field(L, W, { pitch: 5.4 });
  const solidV = pc.intersection(solid(L, W), [[[-10, -10], [103, -10], [103, 120], [-10, 120]]]);
  const markV = pc.intersection(solidV, pc.union(...Array.from({ length: 12 }, (_, i) => [[[i * 9 - 3, -10], [i * 9 + 3, -10], [i * 9 + 3, 120], [i * 9 - 3, 120]]])));
  out.push(emit('h-field', 'H · FIELD — vertical hairline field; lines thicken inside the letters', logo, markV, svgWordmark(logo, 0, 'url(#g)', GOLD_GRAD)));
}

{ // I — EQUALIZER (kept for comparison; resembles IBM's striped logo)
  const W = 26;
  const L = layout(W, { vs: 2, sm: 10 }, { v: 102, s: 82, m: 120 });
  const logo = equalizer(L, W);
  const b = bbox(logo);
  const bandOf = (poly) => {
    const ys = poly[0].map((p) => p[1]);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    return Math.min(6, Math.max(0, Math.floor(((mid - b.y0) / b.h) * 7)));
  };
  const vOnly = pc.intersection(logo, [[[-10, -10], [118, -10], [118, 120], [-10, 120]]]);
  out.push(emit('i-equalizer', 'I · EQUALIZER — 7 italic bands, one per division (caution: IBM-like)', logo, vOnly, svgSpectrum(logo, bandOf)));
}

// Comparison board: every concept's hero + masthead size side by side.
const board = join(ROOT, 'board.png');
magick(
  '-background', BG,
  ...out.flatMap(({ dir }) => [join(dir, 'renders', 'logo-hero.png'), join(dir, 'renders', 'masthead.png')]),
  '-gravity', 'north', '-splice', '0x40', '-gravity', 'center', '-append', '-resize', '1400x', board,
);
console.log('  ✓ board.png');
