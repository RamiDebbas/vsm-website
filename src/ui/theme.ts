import { SITE, THEME, getDivision } from '../config/site.ts';
import { enquirySubject, mailtoHref } from '../core/contact.ts';
import { divisionHash } from '../core/deeplink.ts';
import { focusedDivision, store } from '../core/state.ts';
import { pad2 } from './markup.ts';

/**
 * Store → DOM projection for everything that reflects the focused/active division:
 * page accent colour, hero readout, dial radios, index rows, URL hash, screen-reader announcement.
 */
export function bindTheme(root: HTMLElement = document.documentElement): () => void {
  const readoutIdx = document.querySelector<HTMLElement>('[data-readout-idx]');
  const readoutName = document.querySelector<HTMLElement>('[data-readout-name]');
  const readoutCta = document.querySelector<HTMLAnchorElement>('[data-readout-cta]');
  const readoutCtaSr = document.querySelector<HTMLElement>('[data-readout-cta-sr]');
  const announcer = document.querySelector<HTMLElement>('[data-announce]');
  const radios = [...document.querySelectorAll<HTMLElement>('.dial__item[data-division]')];
  const rows = [...document.querySelectorAll<HTMLElement>('.index__row[data-division]')];

  return store.subscribe((next, prev) => {
    const focused = focusedDivision(next);
    if (focused !== focusedDivision(prev)) {
      const d = focused ? getDivision(focused) : null;
      root.style.setProperty('--accent', d ? d.accent : THEME.gold);
      if (readoutIdx) readoutIdx.textContent = d ? pad2(SITE.divisions.indexOf(d) + 1) : '00';
      if (readoutName) readoutName.textContent = d ? d.name : 'All divisions';
      if (readoutCta) readoutCta.href = mailtoHref(SITE.contact.email, enquirySubject(d));
      // The link text stays "Enquire"; screen readers also hear which division it writes to (2.4.4).
      if (readoutCtaSr) readoutCtaSr.textContent = d ? ` about ${d.name}` : '';
    }

    if (next.active !== prev.active) {
      for (const r of radios) {
        const on = r.dataset.division === next.active;
        r.setAttribute('aria-checked', String(on));
      }
      // Keep exactly one radio in the tab order (roving tabindex).
      const tabStop = radios.find((r) => r.dataset.division === next.active) ?? radios[0];
      for (const r of radios) r.tabIndex = r === tabStop ? 0 : -1;
      for (const row of rows) {
        const on = row.dataset.division === next.active;
        // Row carries the visual state; the focusable link carries the semantics screen readers announce.
        const link = row.querySelector<HTMLElement>('.index__select');
        for (const el of link ? [row, link] : [row]) {
          if (on) el.setAttribute('aria-current', 'true');
          else el.removeAttribute('aria-current');
        }
      }
      // replaceState: shareable URL without adding history entries or triggering a scroll jump.
      const hash = divisionHash(next.active);
      if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
      // Inside the radiogroup the focused radio already announces its own checked state — a live-region
      // message on top would double every step and queue stale "X selected" while arrowing quickly.
      const fromRadiogroup = document.activeElement?.closest('[role="radiogroup"]');
      if (announcer && !fromRadiogroup) announcer.textContent = next.active ? `${getDivision(next.active).name} selected` : '';
    }
  });
}
