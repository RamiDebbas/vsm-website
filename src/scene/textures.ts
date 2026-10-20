import { CanvasTexture, SRGBColorSpace } from 'three';

/** Soft radial falloff used for star points, planet halos and the core glow. Generated, so no image requests. */
export function radialTexture(size = 128, stops: [number, string][] = [
  [0, 'rgba(255,255,255,1)'],
  [0.22, 'rgba(255,255,255,0.55)'],
  [0.5, 'rgba(255,255,255,0.12)'],
  [1, 'rgba(255,255,255,0)'],
]): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
