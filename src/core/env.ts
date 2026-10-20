/**
 * Capability detection. Everything here degrades gracefully: the site is fully usable
 * (all content, all contact actions) with no WebGL and no JavaScript at all.
 */

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isCoarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Data-saver / very slow connections: skip the 3D scene entirely. */
export function wantsLiteMode(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  const c = nav.connection;
  return Boolean(c?.saveData) || c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g';
}

export function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/** Pixel-ratio budget: crisp on retina, but never render 3x on phones (battery + heat). */
export function pixelRatioBudget(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, isCoarsePointer() ? 1.5 : 1.75);
}
