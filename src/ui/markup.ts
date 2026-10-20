/**
 * BUILD-TIME MARKUP — pure functions that turn SITE (src/config/site.ts) into HTML strings.
 *
 * Called by the Vite plugin in vite.config.ts (dev + build) to fill the <!--@…--> slots in index.html.
 * Why static HTML instead of rendering in the browser:
 *   - Search engines and link previews see real content.
 *   - No-JS / WebGL-less visitors still get every fact and every contact action.
 *   - Nothing shifts on load; JS only *attaches behaviour* to elements that already exist.
 *
 * Security: every interpolated value goes through `esc()` / `attr()`, even though content is ours.
 * No inline <style> or style="" attributes are emitted (the CSP forbids them) — colours come from
 * the generated `virtual:divisions.css` module instead (see `divisionCss`).
 */
import { SITE, type Division } from '../config/site.ts';
import { enquirySubject, mailtoHref, telHref } from '../core/contact.ts';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}
const attr = esc;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface MarkupOptions {
  /** Absolute site origin (e.g. https://vsmgrp.com), or '' when unknown. */
  siteUrl: string;
  /** Four-digit year stamped into the footer at build time (JS refreshes it at runtime). */
  year: number;
}

export function divisionCss(): string {
  return SITE.divisions.map((d) => `[data-division="${d.id}"]{--c:${d.accent}}`).join('\n');
}

function enquiryLink(d: Division | null, className: string, label: string): string {
  const href = mailtoHref(SITE.contact.email, enquirySubject(d));
  const sr = d ? `<span class="sr-only"> about ${esc(d.name)}</span>` : '';
  return `<a class="${attr(className)}" href="${attr(href)}">${esc(label)}${sr}<span class="arrow" aria-hidden="true">↗</span></a>`;
}

export function renderHead(opts: MarkupOptions): string {
  const { company, divisions, contact } = SITE;
  const list = divisions.map((d) => d.name).join(' · ');
  const title = `${company.brand} — ${list}`;
  const description = `${company.brand}: ${divisions.length} divisions — ${divisions
    .map((d) => d.name)
    .join(', ')}. Contact ${contact.email}.`;
  const url = opts.siteUrl ? `${opts.siteUrl}/` : '';
  const ogImage = opts.siteUrl ? `${opts.siteUrl}/og-image.png` : 'og-image.png';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.legalName,
    alternateName: company.brand,
    email: contact.email,
    ...(contact.phone ? { telephone: contact.phone.e164 } : {}),
    ...(url ? { url, logo: `${opts.siteUrl}/brand/mark-512.png` } : {}),
    department: divisions.map((d) => ({ '@type': 'Organization', name: `${company.brand} ${d.name}` })),
  };
  // JSON-LD is a data block (never executed), so the CSP's script-src does not apply to it.
  // "<" is escaped so no value can ever close the script element early.
  const ld = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${attr(description)}">`,
    url ? `<link rel="canonical" href="${attr(url)}">` : '',
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${attr(company.brand)}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    url ? `<meta property="og:url" content="${attr(url)}">` : '',
    `<meta property="og:image" content="${attr(ogImage)}">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${ld}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

function masthead(): string {
  // No logo in the header (owner decision 2026-09-30): the hero IS the logo, live in 3D.
  return `
  <header class="masthead" data-reveal>
    <nav class="masthead__nav" aria-label="Primary">
      <a href="#group">The Group</a>
      <a href="#divisions">Divisions</a>
      <a href="#contact">Contact</a>
    </nav>
    <button class="motion-toggle js-only" type="button" aria-pressed="false" data-motion-toggle title="Pause motion">
      <span class="motion-toggle__icon" aria-hidden="true"></span><span class="sr-only">Pause motion</span>
    </button>
  </header>`;
}

function hero(opts: MarkupOptions): string {
  const { divisions } = SITE;
  const dial = divisions
    .map(
      (d, i) => `
        <button class="dial__item" type="button" role="radio" aria-checked="false" tabindex="${i === 0 ? '0' : '-1'}" data-division="${attr(d.id)}">
          <span class="dial__num" aria-hidden="true">${pad2(i + 1)}</span>
          <span class="dial__name">${esc(d.name)}</span>
        </button>`,
    )
    .join('');

  return `
  <section class="hero" id="top" aria-labelledby="hero-title">
    <div class="hero__fallback" aria-hidden="true"><img class="hero__emblem" src="./brand/logo-hero.svg" alt="" width="313" height="103" decoding="async"></div>
    <div class="hero__copy">
      <p class="eyebrow" data-reveal><span class="eyebrow__dot" aria-hidden="true"></span>${esc(SITE.company.brand)}</p>
      <h1 id="hero-title" class="display hero__title" data-reveal>
        <span class="line">Seven divisions.</span>
        <span class="line"><em>One orbit.</em></span>
      </h1>
    </div>

    <div class="readout" data-reveal>
      <p class="readout__meta" aria-hidden="true"><span data-readout-idx>00</span> / ${pad2(divisions.length)}</p>
      <p class="readout__name" data-readout-name>All divisions</p>
      <a class="readout__cta" data-readout-cta href="${attr(mailtoHref(SITE.contact.email, enquirySubject(null)))}">Enquire<span class="sr-only" data-readout-cta-sr></span><span class="arrow" aria-hidden="true">↗</span></a>
    </div>

    <div class="dial js-only" role="radiogroup" aria-label="Choose a division" data-reveal>${dial}
    </div>
    <p class="sr-only" aria-live="polite" data-announce></p>

    <a class="scroll-cue" href="#group" data-reveal><span>Explore</span><span class="scroll-cue__line" aria-hidden="true"></span></a>
  </section>`;
}

function group(): string {
  const names = SITE.divisions.map(
    (d) => `<a class="word" href="#${attr(d.id)}" data-division="${attr(d.id)}">${esc(d.name)}</a>`,
  );
  const last = names.pop();
  return `
  <section class="group" id="group" aria-labelledby="group-title">
    <p class="kicker" data-reveal><span class="kicker__rule" aria-hidden="true"></span>The Group</p>
    <h2 id="group-title" class="sr-only">About ${esc(SITE.company.brand)}</h2>
    <p class="statement" data-reveal>
      ${esc(SITE.company.brand)} brings ${names.join(', ')} and ${last} into one orbit.
    </p>
  </section>`;
}

function divisionsIndex(): string {
  const rows = SITE.divisions
    .map(
      (d, i) => `
      <li class="index__row" id="${attr(d.id)}" data-division="${attr(d.id)}" data-reveal>
        <span class="index__num" aria-hidden="true">${pad2(i + 1)}</span>
        <h3 class="index__name"><a class="index__select" href="#${attr(d.id)}" data-select="${attr(d.id)}">${esc(d.name)}</a></h3>
        ${d.summary ? `<p class="index__summary">${esc(d.summary)}</p>` : ''}
        <span class="index__rule" aria-hidden="true"></span>
        ${enquiryLink(d, 'index__cta', 'Enquire')}
      </li>`,
    )
    .join('');
  return `
  <section class="divisions" id="divisions" aria-labelledby="divisions-title">
    <header class="section-head" data-reveal>
      <p class="kicker"><span class="kicker__rule" aria-hidden="true"></span>Index</p>
      <h2 id="divisions-title" class="display section-head__title">Divisions</h2>
      <p class="section-head__count" aria-hidden="true">${pad2(SITE.divisions.length)}</p>
    </header>
    <ol class="index">${rows}
    </ol>
  </section>`;
}

function contact(): string {
  const { contact: c, divisions } = SITE;
  const chips = [
    `<label class="chip"><input type="radio" name="topic" value="" checked><span>General</span></label>`,
    ...divisions.map(
      (d) =>
        `<label class="chip" data-division="${attr(d.id)}"><input type="radio" name="topic" value="${attr(d.id)}"><span>${esc(d.name)}</span></label>`,
    ),
  ].join('\n          ');

  return `
  <section class="contact" id="contact" aria-labelledby="contact-title">
    <p class="kicker" data-reveal><span class="kicker__rule" aria-hidden="true"></span>Contact</p>
    <h2 id="contact-title" class="display contact__title" data-reveal>
      <span class="line">Begin a</span>
      <span class="line"><em>conversation.</em></span>
    </h2>

    <div class="contact__grid${c.phone ? '' : ' contact__grid--single'}">
      <div class="contact__item" data-reveal>
        <p class="label">Email</p>
        <a class="contact__big" href="${attr(mailtoHref(c.email))}">${esc(c.email)}</a>
        <div class="contact__actions">
          <button class="btn btn--ghost js-only" type="button" data-copy="${attr(c.email)}">Copy address</button>
          <button class="btn btn--ghost js-only" type="button" data-vcard>Save to contacts (.vcf)</button>
        </div>
        <span class="sr-only" role="status" data-copy-status></span>
      </div>${c.phone ? `
      <div class="contact__item" data-reveal>
        <p class="label">Telephone</p>
        <a class="contact__big" href="${attr(telHref(c.phone.e164))}">${esc(c.phone.display)}</a>
      </div>` : ''}
    </div>

    <form class="composer js-only" data-composer aria-labelledby="composer-title" data-reveal>
      <p class="label" id="composer-title">Write to a division</p>
      <fieldset class="chips">
        <legend class="sr-only">Topic</legend>
          ${chips}
      </fieldset>
      <button class="btn btn--solid" type="submit" data-composer-submit>Compose email<span class="arrow" aria-hidden="true">↗</span></button>
    </form>
  </section>`;
}

function footer(opts: MarkupOptions): string {
  return `
  <footer class="footer">
    <p class="footer__legal">© <span data-year>${opts.year}</span> ${esc(SITE.company.legalName)}</p>
    <nav class="footer__nav" aria-label="Footer">
      <a href="#divisions">Divisions</a>
      <a href="#contact">Contact</a>
      <a href="#top">Back to top <span aria-hidden="true">↑</span></a>
    </nav>
  </footer>`;
}

export function renderBody(opts: MarkupOptions): string {
  return `${masthead()}
  <main id="main">${hero(opts)}${group()}${divisionsIndex()}${contact()}
  </main>${footer(opts)}`;
}
