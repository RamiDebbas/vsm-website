/**
 * Build-time markup: parses the real generated HTML (DOMParser → inert document) and checks
 * structure, accessibility wiring and CSP safety.
 */
import { describe, expect, it } from 'vitest';
import logoSvg from '../src/brand/logo-color.svg?raw';
import monoLogoSvg from '../src/brand/logo.svg?raw';
import wordSvg from '../src/brand/logo-word.svg?raw';
import { SITE } from '../src/config/site.ts';
import { esc, renderBody, renderHead } from '../src/ui/markup.ts';

const opts = { siteUrl: 'https://example.com', year: 2026 };
const doc = new DOMParser().parseFromString(
  `<!doctype html><html><head>${renderHead(opts)}</head><body>${renderBody(opts)}</body></html>`,
  'text/html',
);
const $$ = <T extends Element = HTMLElement>(sel: string): T[] => [...doc.querySelectorAll<T>(sel)];

describe('markup', () => {
  it('escapes HTML special characters', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('has one h1 and landmark structure', () => {
    expect($$('h1')).toHaveLength(1);
    expect(doc.querySelector('header.masthead')).not.toBeNull();
    expect(doc.querySelector('main#main')).not.toBeNull();
    expect(doc.querySelector('footer')).not.toBeNull();
  });

  it('renders every division in the dial and the index with matching ids', () => {
    const ids = SITE.divisions.map((d) => d.id);
    expect($$('.dial__item').map((e) => e.dataset.division)).toEqual(ids);
    expect($$('.index__row').map((e) => e.id)).toEqual(ids);
  });

  it('wires the dial as a proper radiogroup with a single tab stop', () => {
    const radios = $$('[role="radiogroup"] [role="radio"]');
    expect(radios).toHaveLength(SITE.divisions.length);
    expect(radios.filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('gives every enquiry link a division-specific accessible name and subject', () => {
    const links = $$<HTMLAnchorElement>('.index__cta');
    SITE.divisions.forEach((d, i) => {
      const a = links[i]!;
      expect(a.textContent).toContain(`about ${d.name}`);
      expect(decodeURIComponent(a.getAttribute('href')!)).toContain(`subject=${d.name} enquiry`);
    });
  });

  it('never emits inline style attributes or executable inline scripts (CSP)', () => {
    expect($$('[style]')).toHaveLength(0);
    expect($$('style')).toHaveLength(0);
    for (const s of $$('script')) expect(s.getAttribute('type')).toBe('application/ld+json');
  });

  it('shows "Group Inc" only in legal contexts (footer copyright), never in branding', () => {
    const outsideFooter = [...doc.body.children].filter((el) => el.tagName !== 'FOOTER').map((el) => el.textContent ?? '').join(' ');
    // \b…\b so an email domain such as "vsmgroupinc.com" (contact data, not branding) would not match.
    expect(outsideFooter).not.toMatch(/\bgroup\s*inc\b/i);
    expect(doc.querySelector('.footer__legal')!.textContent).toContain('VSM GROUP INC');
    expect(doc.title).not.toMatch(/\bgroup\s*inc\b/i);
  });

  it('emits valid Organization JSON-LD with all departments', () => {
    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld['@type']).toBe('Organization');
    expect(ld.name).toBe('VSM GROUP INC');
    expect(ld.department).toHaveLength(SITE.divisions.length);
    expect(ld.url).toBe('https://example.com/');
  });

  it('omits canonical/og:url when the site URL is unknown', () => {
    expect(renderHead({ ...opts, siteUrl: '' })).not.toMatch(/canonical|og:url/);
  });

  it('decorative SVGs are hidden from assistive tech', () => {
    for (const svg of $$('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
    }
  });

  it('index division names are real links to their own anchors (work without JS)', () => {
    for (const d of SITE.divisions) {
      const a = doc.querySelector<HTMLAnchorElement>(`#${d.id} .index__select`)!;
      expect(a.tagName).toBe('A');
      expect(a.getAttribute('href')).toBe(`#${d.id}`);
    }
  });

  it('JS-only controls are marked so they are hidden without JavaScript', () => {
    expect(doc.querySelector('.dial')!.classList.contains('js-only')).toBe(true);
    expect(doc.querySelector('[data-motion-toggle]')!.classList.contains('js-only')).toBe(true);
    expect(doc.querySelector('[data-composer]')!.classList.contains('js-only')).toBe(true);
  });

  it('pause-motion toggle is a labelled toggle button (WCAG 2.2.2)', () => {
    const b = doc.querySelector('[data-motion-toggle]')!;
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.textContent).toContain('Pause motion');
  });

  it('every button has an explicit type', () => {
    for (const b of $$('button')) expect(b.getAttribute('type')).toMatch(/^(button|submit)$/);
  });

  it('all in-page links point at elements that exist', () => {
    for (const a of $$<HTMLAnchorElement>('a[href^="#"]')) {
      const id = a.getAttribute('href')!.slice(1);
      expect(doc.getElementById(id), `#${id}`).not.toBeNull();
    }
  });
});

describe('brand files', () => {
  it('logo files are plain generated vector art (no script, styles, foreign content or external refs)', () => {
    for (const svg of [logoSvg, monoLogoSvg, wordSvg]) {
      expect(svg).toMatch(/^<svg /);
      expect(svg).not.toMatch(/<script|<style|<foreignObject|\son[a-z]+=|href=|url\(http/i);
    }
  });

  it('colour logo uses the brand gold/white rings and every division colour (one planet each)', () => {
    expect(logoSvg).toContain('fill="#D8B86A"');
    expect(logoSvg).toContain('fill="#F3EEE3"');
    for (const d of SITE.divisions) expect(logoSvg, d.name).toContain(`fill="${d.accent}"`);
  });

  it('the header carries no logo (owner decision) — navigation only', () => {
    const header = doc.querySelector('header.masthead')!;
    expect(header.querySelector('svg, img')).toBeNull();
    expect(header.querySelectorAll('nav a').length).toBeGreaterThanOrEqual(3);
  });
});
