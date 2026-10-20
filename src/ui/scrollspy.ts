import { store, type SectionId } from '../core/state.ts';

const SECTIONS: SectionId[] = ['top', 'group', 'divisions', 'contact'];

/**
 * Tracks which section is current (drives the camera pose + nav highlight), the masthead's scrolled
 * state, and reveal-on-scroll animations.
 *
 * "Current" = the section crossing the viewport's horizontal MIDLINE. A zero-height root margin band at
 * 50% fires exactly once per crossing, independent of section heights — ranking by "fraction of the
 * section visible" made short sections win against a tall one that filled most of the screen.
 */
export function bindScroll(): void {
  const masthead = document.querySelector<HTMLElement>('.masthead');
  const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.masthead__nav a')];

  const select = (id: SectionId): void => {
    store.set({ section: id });
    // Exposed to CSS: on phones the 3D scene recedes behind full-width text outside the hero (scene.css).
    document.documentElement.dataset.section = id;
    for (const a of navLinks) {
      if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };

  const midline = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) select(e.target.id as SectionId);
    },
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
  );
  for (const id of SECTIONS) {
    const el = document.getElementById(id);
    if (el) midline.observe(el);
  }

  let ticking = false;
  const onScroll = (): void => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      masthead?.classList.toggle('is-scrolled', scrollY > 24);
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Reveal on scroll, staggered by sibling order. Any visible pixel counts: elements flush with the
  // viewport's bottom edge (e.g. the hero dial) must still reveal on first paint.
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-revealed');
        revealObserver.unobserve(e.target);
      }
    },
    { threshold: 0 },
  );
  const groups = new Map<Element | null, number>();
  for (const el of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
    const i = groups.get(el.parentElement) ?? 0;
    groups.set(el.parentElement, i + 1);
    el.style.setProperty('--reveal-i', String(Math.min(i, 8)));
    revealObserver.observe(el);
  }
}
