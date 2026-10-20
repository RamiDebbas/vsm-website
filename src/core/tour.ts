import type { DivisionId } from '../config/site.ts';

/**
 * IDLE TOUR POLICY
 *
 * When a visitor leaves the page idle, the orrery can "present" the divisions by itself —
 * rotating focus from one division to the next (accent colour, planet, readout all follow).
 *
 * src/ui/tourDriver.ts calls `nextTourStep` every TOUR_TICK_MS while the hero is on screen,
 * and applies whatever it returns via store.set({ active }).
 *
 * This is a product decision with real trade-offs:
 *  - Showcasing: a first-time visitor sees all seven divisions without doing anything.
 *  - Control: content that moves on its own for more than 5s must be pausable (WCAG 2.2.2).
 *    Any interaction already updates `idleMs` back to 0, which acts as that pause.
 *  - Respect: people who chose a division, or asked their OS for reduced motion, may not
 *    want the page to change under them.
 */

export const TOUR_TICK_MS = 4000;

export interface TourContext {
  /** Currently selected division, or null if nothing is selected. */
  readonly current: DivisionId | null;
  /** All division ids in display order. */
  readonly order: readonly DivisionId[];
  /** Milliseconds since the visitor last clicked, typed, hovered a division or scrolled. */
  readonly idleMs: number;
  /** True once the visitor has deliberately picked a division at least once this visit. */
  readonly hasChosen: boolean;
  /** How many automatic steps the tour has already taken this visit. */
  readonly stepsTaken: number;
  /** OS-level "reduce motion" preference. */
  readonly reducedMotion: boolean;
}

/**
 * Decide the tour's next move.
 * @returns the division to focus next, or `null` to leave the page exactly as it is.
 */
export function nextTourStep(ctx: TourContext): DivisionId | null {
  // TODO(you): implement the tour policy (≈5–10 lines). The safe default below never moves anything.
  void ctx;
  return null;
}
