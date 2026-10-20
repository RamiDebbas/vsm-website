import { isDivisionId, type DivisionId } from '../config/site.ts';
import { store } from '../core/state.ts';

/**
 * Division controls:
 *  - Hero dial: WAI-ARIA radiogroup. Arrow keys move + select, Home/End jump, Space/Enter select.
 *  - Index rows + statement words: hover/focus previews a division; row button selects it.
 * Pointer "preview" is temporary (accent + planet emphasis); "active" is the committed choice.
 */
export function bindDivisionControls(): () => void {
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void): void => {
    el.addEventListener(type, fn);
    cleanups.push(() => el.removeEventListener(type, fn));
  };
  const touch = (): number => performance.now();
  const idOf = (el: HTMLElement): DivisionId | null => {
    const v = el.dataset.division ?? el.dataset.select ?? '';
    return isDivisionId(v) ? v : null;
  };

  // --- Hero dial (radiogroup) ---
  const radios = [...document.querySelectorAll<HTMLElement>('.dial__item[data-division]')];
  const select = (el: HTMLElement): void => {
    const id = idOf(el);
    if (id) store.set({ active: id, preview: null, lastInteraction: touch() });
  };
  radios.forEach((radio, i) => {
    on(radio, 'click', () => select(radio));
    on(radio, 'keydown', (e) => {
      const last = radios.length - 1;
      const moves: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: last };
      const target = moves[e.key];
      if (target === undefined) return;
      e.preventDefault();
      const next = radios[(target + radios.length) % radios.length]!;
      next.focus();
      select(next);
    });
  });

  // --- Preview on hover / focus (dial, index rows, statement words, contact chips) ---
  const previewables = document.querySelectorAll<HTMLElement>('.dial__item, .index__row, .statement .word');
  for (const el of previewables) {
    const id = idOf(el);
    if (!id) continue;
    on(el, 'pointerenter', (e) => {
      if (e.pointerType === 'mouse') store.set({ preview: id, lastInteraction: touch() });
    });
    on(el, 'pointerleave', () => {
      if (store.get().preview === id) store.set({ preview: null });
    });
    on(el, 'focusin', () => store.set({ preview: id, lastInteraction: touch() }));
    on(el, 'focusout', () => {
      if (store.get().preview === id) store.set({ preview: null });
    });
  }

  // --- Index names: real links to #division (work without JS, shareable). With JS, select in place
  //     instead of jump-scrolling the clicked row to the top; theme.ts still writes the #hash. ---
  for (const link of document.querySelectorAll<HTMLElement>('.index__select[data-select]')) {
    on(link, 'click', (e) => {
      e.preventDefault();
      select(link);
    });
  }

  return () => cleanups.forEach((fn) => fn());
}
