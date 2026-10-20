import { store } from '../core/state.ts';

/**
 * "Pause motion" toggle — WCAG 2.2.2 (Pause, Stop, Hide, Level A): anything that moves automatically for more
 * than 5 s alongside content needs an on-page way to stop it. The OS reduced-motion setting is not enough on
 * its own (shared/kiosk machines, people who never found that setting).
 *
 * Pressing it sets store.motionPaused → the orrery switches to render-on-demand (src/scene/Orrery.ts) and
 * html.motion-paused stops CSS loops. The choice is remembered per browser (a convenience, so storage
 * failures in private mode are ignored).
 */
const KEY = 'vsm:motion-paused';

function readSaved(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function save(paused: boolean): void {
  try {
    if (paused) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — the toggle still works for this visit */
  }
}

export function bindMotionToggle(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]')];
  const apply = (paused: boolean): void => {
    document.documentElement.classList.toggle('motion-paused', paused);
    for (const b of buttons) b.setAttribute('aria-pressed', String(paused));
  };

  store.set({ motionPaused: readSaved() });
  apply(store.get().motionPaused);

  for (const b of buttons) {
    b.addEventListener('click', () => {
      const paused = !store.get().motionPaused;
      store.set({ motionPaused: paused, lastInteraction: performance.now() });
      save(paused);
      apply(paused);
    });
  }
}
