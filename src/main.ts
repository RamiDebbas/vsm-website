/**
 * ENTRY POINT — boots behaviour on top of the static HTML generated at build time.
 *
 * Boot order (docs/ARCHITECTURE.md → "Runtime"):
 *   1. styles + self-hosted fonts
 *   2. mark <html> as js, read OS motion preference into the store
 *   3. bind UI modules (theme projection, division controls, contact, scroll)
 *   4. apply deep link (#music …)
 *   5. lazy-load the 3D orrery when the browser is idle — only if WebGL2 and not in data-saver mode
 */
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/bodoni-moda/opsz-italic.css';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/scene.css';
import 'virtual:divisions.css';

import logoSvg from './brand/logo-word.svg?raw'; // the word only — the scene builds the real 3D rings around it
import { SITE } from './config/site.ts';
import { parseHash } from './core/deeplink.ts';
import { prefersReducedMotion, supportsWebGL2, wantsLiteMode } from './core/env.ts';
import { store } from './core/state.ts';
import { bindContactActions } from './ui/contactActions.ts';
import { bindDivisionControls } from './ui/dial.ts';
import { bindMotionToggle } from './ui/motion.ts';
import { bindScroll } from './ui/scrollspy.ts';
import { bindTheme } from './ui/theme.ts';
import { startTourDriver } from './ui/tourDriver.ts';
import type { HeroFrame } from './scene/Orrery.ts';

const html = document.documentElement;
html.classList.replace('no-js', 'js');

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
store.set({ reducedMotion: prefersReducedMotion() });
motionQuery.addEventListener('change', (e) => store.set({ reducedMotion: e.matches }));

bindTheme();
bindMotionToggle();
bindDivisionControls();
bindContactActions(__SITE_URL__);
bindScroll();
startTourDriver();

for (const el of document.querySelectorAll<HTMLElement>('[data-year]')) el.textContent = String(new Date().getFullYear());

// Deep links: #music selects Music (the browser already scrolled to its index row).
function applyHash(): void {
  const { division } = parseHash(location.hash);
  if (division) store.set({ active: division, lastInteraction: performance.now() });
}
addEventListener('hashchange', applyHash);
applyHash();

// Any deliberate input resets the idle clock used by the tour policy.
for (const type of ['keydown', 'wheel', 'touchstart'] as const) {
  addEventListener(type, () => store.set({ lastInteraction: performance.now() }), { passive: true });
}

if (import.meta.env.DEV && SITE.placeholders.length) {
  console.warn('[VSM] Placeholder content still in use:', SITE.placeholders);
}

/**
 * Where the hero leaves room for the 3D logo on phones/tablets (desktop uses hand-tuned poses → null).
 * Portrait: the band between the masthead and the headline. Short landscape: the right side, beside the headline.
 * Measured at the top of the page (document coordinates), so scrolling never changes it.
 */
function heroFrame(): HeroFrame | null {
  const w = innerWidth;
  const h = innerHeight;
  if (w >= 960) return null;
  const masthead = document.querySelector('.masthead')?.getBoundingClientRect();
  const copy = document.querySelector('.hero__copy')?.getBoundingClientRect();
  if (!masthead || !copy) return null;
  const pad = 16;
  if (w > h && h < 520) {
    const left = copy.right + pad;
    return { x: (left + w - pad) / 2, y: (masthead.bottom + h) / 2, w: w - pad - left, h: h - masthead.bottom - pad };
  }
  const top = masthead.bottom + pad;
  const bottom = copy.top + scrollY - pad;
  return { x: w / 2, y: (top + bottom) / 2, w: w - pad * 2, h: bottom - top };
}

async function bootScene(): Promise<void> {
  if (wantsLiteMode() || !supportsWebGL2()) {
    html.classList.add('no-webgl');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.id = 'orrery';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  try {
    const { createOrrery } = await import('./scene/Orrery.ts');
    createOrrery({ canvas, logoSvg, reducedMotion: store.get().reducedMotion, heroFrame });
  } catch (err) {
    canvas.remove();
    html.classList.add('no-webgl');
    console.error('[VSM] 3D scene failed; static fallback shown.', err);
  }
}

const idle = (cb: () => void): void => {
  if ('requestIdleCallback' in window) requestIdleCallback(cb, { timeout: 1200 });
  else setTimeout(cb, 200);
};
idle(() => void bootScene());
