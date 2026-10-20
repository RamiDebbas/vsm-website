/**
 * Polygon helpers shared by the concept scripts (creative.mjs, ringed.mjs). Thin, tolerant wrappers around
 * polygon-clipping: accept Polygon or MultiPolygon, return MultiPolygon, retry degenerate cases via `safe`.
 */
import pc from 'polygon-clipping';
import { safe } from './geometry.mjs';

const TAU = Math.PI * 2;
/** polygon-clipping accepts Polygon (ring[]) or MultiPolygon (Polygon[]); normalise to MultiPolygon. */
export const asMulti = (g) => (g.length && typeof g[0]?.[0]?.[0] === 'number' ? [g] : g);

/** Approximate Minkowski offset (outward by g) as the union of 16 translated copies. */
export function offset(geom, g, steps = 16) {
  const mp = asMulti(geom);
  if (!mp.length) return [];
  const copies = [mp];
  for (let i = 0; i < steps; i++) {
    // half-step phase: no translation is axis-aligned, so copies never create collinear overlapping edges
    const a = ((i + 0.5) / steps) * TAU;
    const dx = Math.cos(a) * g;
    const dy = Math.sin(a) * g;
    copies.push(mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + dx, y + dy]))));
  }
  return safe(pc.union, ...copies);
}
export const minus = (a, b) => (a.length && b.length ? safe(pc.difference, a, b) : a);
export const inter = (a, b) => (a.length && b.length ? safe(pc.intersection, a, b) : []);
export const union = (...xs) => {
  const ys = xs.filter((x) => x.length);
  return ys.length ? safe(pc.union, ...ys) : [];
};
export const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
export const translate = (g, dx, dy) => asMulti(g).map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + dx, y + dy])));

