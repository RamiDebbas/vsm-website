import { DIVISION_IDS } from '../config/site.ts';
import { isStill, store } from '../core/state.ts';
import { nextTourStep, TOUR_TICK_MS } from '../core/tour.ts';

/**
 * Runs the idle-tour policy (src/core/tour.ts) on a timer. The policy decides *what*; this decides *when*.
 * Only ticks while the hero is the current section and the tab is visible.
 */
export function startTourDriver(): () => void {
  let stepsTaken = 0;
  let hasChosen = false;
  let lastAuto: string | null = null;

  const unsub = store.subscribe((next, prev) => {
    // Any active change that the tour itself did not make counts as a deliberate choice.
    if (next.active !== prev.active && next.active !== lastAuto) hasChosen = true;
  });

  const timer = window.setInterval(() => {
    const s = store.get();
    if (document.hidden || s.section !== 'top') return;
    const next = nextTourStep({
      current: s.active,
      order: DIVISION_IDS,
      idleMs: performance.now() - s.lastInteraction,
      hasChosen,
      stepsTaken,
      reducedMotion: isStill(s), // the on-page pause toggle counts as "no automatic motion" too
    });
    if (next && next !== s.active) {
      stepsTaken++;
      lastAuto = next;
      store.set({ active: next });
    }
  }, TOUR_TICK_MS);

  return () => {
    window.clearInterval(timer);
    unsub();
  };
}
