import type { SectionId } from '../core/state.ts';

/**
 * Camera choreography: one pose per page section. The scene eases between them as the visitor scrolls.
 * Pure data + pure functions → unit-tested in tests/poses.test.ts.
 */
export interface CameraPose {
  /** Camera position (world units). */
  readonly position: readonly [number, number, number];
  /** Point the camera looks at. */
  readonly target: readonly [number, number, number];
  /** Shift of the rendered image as a fraction of viewport width (+ = content moves right). */
  readonly shiftX: number;
  /** Shift as a fraction of viewport height (+ = content moves up). */
  readonly shiftY: number;
  /** Scene brightness multiplier — reading sections dim the orrery so text stays dominant. */
  readonly exposure: number;
}

// Hero = straight-on, exactly the logo. Scrolling lifts the camera so the rings open into circles and the
// planets can be watched orbiting, then pulls back for the closing shot.
const DESKTOP: Record<SectionId, CameraPose> = {
  top: { position: [0, 0.15, 8.6], target: [0, 0, 0], shiftX: 0, shiftY: 0.13, exposure: 1.05 },
  group: { position: [0, 6.6, 9.8], target: [0, 0, 0], shiftX: 0.34, shiftY: 0.02, exposure: 0.6 },
  divisions: { position: [-2.2, 10.4, 3.6], target: [0, -0.3, 0], shiftX: 0.28, shiftY: 0, exposure: 0.45 },
  // Closing shot: pull far back so the whole system sits small and low, clear of the contact details.
  contact: { position: [0, 1.2, 16], target: [0, 0, 0], shiftX: 0.3, shiftY: -0.2, exposure: 0.55 },
};

const MOBILE: Record<SectionId, CameraPose> = {
  top: { position: [0, 0.2, 13.5], target: [0, 0, 0], shiftX: 0, shiftY: 0.2, exposure: 1.05 },
  group: { position: [0, 6.2, 10.5], target: [0, 0, 0], shiftX: 0, shiftY: 0.24, exposure: 0.6 },
  divisions: { position: [-1, 9.5, 4], target: [0, 0, 0], shiftX: 0, shiftY: 0.05, exposure: 0.35 },
  contact: { position: [0, 1.5, 21], target: [0, 0, 0], shiftX: 0, shiftY: -0.28, exposure: 0.45 },
};

export function poseFor(section: SectionId, viewportWidth: number): CameraPose {
  return (viewportWidth < 960 ? MOBILE : DESKTOP)[section];
}

/**
 * Frame-rate independent exponential smoothing: moves `current` toward `target` so that a fraction
 * (1 - e^(-lambda·dt)) of the gap is closed each frame, regardless of 30/60/120 Hz displays.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}
