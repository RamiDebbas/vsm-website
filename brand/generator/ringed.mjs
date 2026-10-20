#!/usr/bin/env node
/**
 * VSM LOGO — FINAL: "RINGED" (the VSM planet). Owner's choice, 2026-09-30.
 *
 *   npm run logo:final   → brand/concepts/ringed-final/ (+ renders, sheet)  — then `npm run brand` installs assets
 *
 * Bold VSM with SEVEN rings (one per division) orbiting it: rings pass BEHIND the word at the top and IN FRONT of
 * it at the bottom (real over/under depth, with clearance gaps). Rings alternate gold / white; each ring carries
 * its division's planet in the division colour.
 *
 * Single sources of truth:
 *   src/config/rings.json   ring geometry (also drives the interactive 3D rings in src/scene/Orrery.ts)
 *   src/config/site.ts      division order + accent colours (parsed here, so the palette is never duplicated)
 *
 * Outputs (brand/concepts/ringed-final/):
 *   logo.svg         one colour (currentColor) — print, embroidery, single-colour use
 *   logo-color.svg   full colour: gold word, gold/white rings, coloured planets — header, documents
 *   logo-hero.svg    as logo-color with a lit gold word — hero fallback, social card
 *   logo-word.svg    the word only — extruded into the 3D core (the scene builds real 3D rings around it)
 *   mark.svg / mark-color.svg / mark-small.svg   the "V planet" icon (+ a 1-ring cut for ≤ 32 px)
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GOLD, GOLD_GRAD, clean, emit, layout, solid, svgLayers, svgWordmark } from './geometry.mjs';
import { inter, minus, offset, rect, union } from './ops.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const RINGS = JSON.parse(readFileSync(join(ROOT, 'src/config/rings.json'), 'utf8'));
const ACCENTS = [...readFileSync(join(ROOT, 'src/config/site.ts'), 'utf8').matchAll(/accent: '(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1]);
if (ACCENTS.length !== RINGS.count) throw new Error(`Expected ${RINGS.count} division accents in site.ts, found ${ACCENTS.length}`);

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const GAP = 3; // clearance where one element passes over another (3 % of cap height — survives small sizes)

/**
 * A ring system around centre (cx, cy) for a body of half-width `hw`.
 * Ring i is a circle of radius hw·(inner + i·spacing) whose plane tilts by baseTilt + i·tiltStep — seen from the
 * front it is an ellipse with ry = rx·sin(tilt); the whole system is rolled by rollDeg. Identical maths in 3D.
 */
function ringSystem({ cx, cy, hw, indices = [...Array(RINGS.count).keys()], radii = null, tilts = null, stroke = RINGS.stroke }) {
  const roll = RINGS.rollDeg * DEG;
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const st = hw * stroke;
  const place = (x, y) => [cx + x * cosR - y * sinR, cy + x * sinR + y * cosR];
  const ellipse = (rx, ry, n = 360) =>
    Array.from({ length: n }, (_, k) => {
      const t = ((k + 0.5) / n) * TAU; // half-step phase: no vertex lands on the far/near cut line
      return place(Math.cos(t) * rx, Math.sin(t) * ry);
    });
  const rings = indices.map((i, k) => {
    const rx = radii ? radii[k] : hw * (RINGS.innerRadius + i * RINGS.spacing);
    const tilt = (tilts ? tilts[k] : RINGS.baseTiltDeg + i * RINGS.tiltStepDeg) * DEG;
    const ry = rx * Math.sin(tilt);
    const band = [[ellipse(rx + st / 2, ry + st / 2), ellipse(rx - st / 2, ry - st / 2).reverse()]];
    return { i, rx, ry, band, pointAt: (deg) => place(Math.cos(deg * DEG) * rx, Math.sin(deg * DEG) * ry), front: (deg) => Math.sin(deg * DEG) > 0 };
  });
  // Far half = above the rolled major axis (y < 0 in ring space).
  const far = [[place(-1e4, -1e4), place(1e4, -1e4), place(1e4, 0), place(-1e4, 0)]];
  return { rings, far };
}

const circle = ([x, y], r, n = 72) => [[Array.from({ length: n }, (_, k) => [x + Math.cos((k / n) * TAU) * r, y + Math.sin((k / n) * TAU) * r])]];

/**
 * Compose body + rings + planets with correct occlusion. Returns colour groups in paint order plus the
 * one-colour union. `body` is the word (or the V for the icon).
 */
function compose(body, system, planets) {
  const haloBody = offset(body, GAP);
  const pBack = planets.filter((p) => !p.front);
  const pFront = planets.filter((p) => p.front);
  const haloPlanets = offset(union(...planets.map((p) => p.g)), GAP);
  const haloPFront = offset(union(...pFront.map((p) => p.g)), GAP);
  const backOf = (r) => inter(r.band, system.far);
  const frontOf = (r) => minus(r.band, system.far);
  const frontAll = union(...system.rings.map(frontOf));
  // Back rings: hidden behind the body; tiny leftovers between letters are dropped (they read as "stubs").
  const ringsBack = system.rings.map((r) => ({ tone: r.i % 2, g: clean(minus(minus(backOf(r), haloBody), haloPlanets), 40) }));
  const planetsBack = pBack.map((p) => ({ color: p.color, g: clean(minus(p.g, haloBody), 6) }));
  const bodyVisible = clean(minus(minus(body, offset(frontAll, GAP)), haloPFront), 6);
  const ringsFront = system.rings.map((r) => ({ tone: r.i % 2, g: clean(minus(frontOf(r), haloPlanets), 6) }));
  const planetsFront = pFront.map((p) => ({ color: p.color, g: p.g }));

  const tone = (t) => RINGS.tones[t];
  const layers = [
    ...ringsBack.map((r) => ({ g: r.g, color: tone(r.tone) })),
    ...planetsBack.map((p) => ({ g: p.g, color: p.color })),
    { g: bodyVisible, color: GOLD, body: true },
    ...ringsFront.map((r) => ({ g: r.g, color: tone(r.tone) })),
    ...planetsFront.map((p) => ({ g: p.g, color: p.color })),
  ].filter((l) => l.g.length);
  return { layers, mono: union(...layers.map((l) => l.g)) };
}

console.log('VSM final logo (Ringed):');

// ---------------------------------------------------------------- full logo
const W = 26;
const L = layout(W, { vs: 2, sm: 10 }, { v: 104, s: 84, m: 124 });
const word = solid(L, W);
const hw = L.total / 2;
const sys = ringSystem({ cx: hw, cy: 52, hw });
const planetR = hw * RINGS.planetRadius;
const planets = sys.rings.map((r) => {
  const deg = RINGS.planetAnglesDeg[r.i];
  return { g: circle(r.pointAt(deg), planetR), front: r.front(deg), color: ACCENTS[r.i] };
});
const full = compose(word, sys, planets);
const colorSvg = svgLayers(full.layers.map((l) => l.g), full.layers.map((l) => l.color));
const heroSvg = svgLayers(full.layers.map((l) => l.g), full.layers.map((l) => (l.body ? 'url(#g)' : l.color))).replace(/(<svg[^>]*>)/, `$1${GOLD_GRAD}`);

// ---------------------------------------------------------------- icon: the "V planet"
const vBody = inter(word, rect(-5, -5, 105, 110));
const vSys = ringSystem({ cx: 52, cy: 56, hw: 52, indices: [0, 1, 2], radii: [74, 80, 86], tilts: [15, 17, 19], stroke: 0.055 });
const vPlanet = [{ g: circle(vSys.rings[1].pointAt(28), 9.5), front: true, color: ACCENTS[0] }];
const icon = compose(vBody, vSys, vPlanet);
const iconColor = svgLayers(icon.layers.map((l) => l.g), icon.layers.map((l) => l.color));
const smallSys = ringSystem({ cx: 52, cy: 56, hw: 52, indices: [0], radii: [80], tilts: [18], stroke: 0.13 });
const small = compose(vBody, smallSys, []);

emit('ringed-final', 'RINGED — the VSM planet: 7 division rings (gold/white) + division planets', full.mono, icon.mono, heroSvg, {
  markSmall: small.mono,
  files: {
    'logo-color.svg': colorSvg,
    'logo-word.svg': svgWordmark(word),
    'mark-color.svg': iconColor,
  },
});
