/**
 * Structural tests for the content model (src/config/site.ts).
 * These guard the "foundation": if someone edits content in a way that would break
 * deep links, accessibility or the 3D layout, the build goes red before it ships.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import RINGS from '../src/config/rings.json';
import { DIVISION_IDS, SITE, THEME, getDivision, isDivisionId } from '../src/config/site.ts';

/** WCAG 2.x relative luminance + contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** CIE76 ΔE in CIELAB (D65) — perceptual distance between two sRGB colours. */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a: string, b: string): number => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]!));

describe('company', () => {
  it('has the confirmed legal name', () => {
    expect(SITE.company.legalName).toBe('VSM GROUP INC');
  });

  it('brands as "VSM" alone (owner decision 2026-09-29)', () => {
    expect(SITE.company.brand).toBe('VSM');
    expect(SITE.company.brand).not.toMatch(/group|inc/i);
  });
});

describe('divisions', () => {
  it('lists exactly the seven confirmed divisions in order', () => {
    expect(SITE.divisions.map((d) => d.name)).toEqual([
      'Music',
      'Events',
      'Talent',
      'Growth',
      'Consulting',
      'Investments',
      'Development',
    ]);
  });

  it('keeps ids in sync with DIVISION_IDS and unique', () => {
    expect(SITE.divisions.map((d) => d.id)).toEqual([...DIVISION_IDS]);
    expect(new Set(DIVISION_IDS).size).toBe(DIVISION_IDS.length);
  });

  it('uses URL-safe slugs (they become #deep-links and element ids)', () => {
    for (const id of DIVISION_IDS) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it.each(SITE.divisions.map((d) => [d.name, d.accent] as const))('%s accent %s is a valid hex colour with AA contrast on the background', (_, accent) => {
    expect(accent).toMatch(/^#[0-9A-F]{6}$/i);
    expect(contrast(accent, THEME.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('accents stay distinguishable from each other (pairwise ΔE ≥ 10)', () => {
    const accents = SITE.divisions.map((d) => d.accent);
    for (let i = 0; i < accents.length; i++)
      for (let j = i + 1; j < accents.length; j++) expect(deltaE(accents[i]!, accents[j]!), `${accents[i]} vs ${accents[j]}`).toBeGreaterThanOrEqual(10);
  });

  it.each(SITE.divisions.map((d) => [d.name, d.accent] as const))(
    '%s accent %s is neutral, even and minimal (owner direction): L* 78–86, C* ≤ 20, never mistaken for the gold',
    (_, accent) => {
      const [L, a, b] = lab(accent);
      expect(L).toBeGreaterThanOrEqual(78);
      expect(L).toBeLessThanOrEqual(86);
      expect(Math.hypot(a, b)).toBeLessThanOrEqual(20);
      expect(deltaE(accent, THEME.gold)).toBeGreaterThanOrEqual(25);
    },
  );

  it('has one ring per division in the shared ring config (logo rings = site rings)', () => {
    expect(RINGS.count).toBe(SITE.divisions.length);
    expect(RINGS.planetAnglesDeg).toHaveLength(SITE.divisions.length);
    // innermost ring clears the word (half-width = 1), rings fan out (tilt grows) so they separate at front/back
    expect(RINGS.innerRadius).toBeGreaterThan(1.1);
    expect(RINGS.spacing).toBeGreaterThan(0);
    expect(RINGS.tiltStepDeg).toBeGreaterThan(0);
    for (const tone of RINGS.tones) expect(tone).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('every planet moves (non-zero speed)', () => {
    for (const d of SITE.divisions) expect(Math.abs(d.orbit.speed)).toBeGreaterThan(0);
  });

  it('only renders optional slots when filled', () => {
    for (const d of SITE.divisions) {
      if (d.summary !== undefined) expect(d.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it('getDivision / isDivisionId behave', () => {
    expect(getDivision('music').name).toBe('Music');
    expect(isDivisionId('talent')).toBe(true);
    expect(isDivisionId('TALENT')).toBe(false);
    expect(isDivisionId('<script>')).toBe(false);
    expect(() => getDivision('nope' as never)).toThrow();
  });
});

describe('theme', () => {
  it('ink colour passes AAA on the background', () => {
    expect(contrast(THEME.ink, THEME.bg)).toBeGreaterThanOrEqual(7);
  });
});

describe('contact', () => {
  it('has a syntactically valid email', () => {
    expect(SITE.contact.email).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i);
  });

  it('uses the company domain, and a phone only when its display and E.164 agree', () => {
    expect(SITE.contact.email.endsWith('@vsmgrp.com')).toBe(true);
    const { phone } = SITE.contact;
    if (phone) expect(`+${phone.display.replace(/\D/g, '')}`).toBe(phone.e164);
  });

  it('never publishes a business-card mobile number (checked when the local card data exists)', () => {
    // brand/cards/people.json is git-ignored, so this check runs on the owner's machine and is skipped in CI.
    const file = join(process.cwd(), 'brand/cards/people.json');
    if (!existsSync(file)) return;
    const people = (JSON.parse(readFileSync(file, 'utf8')) as { people: Array<{ phone: { e164: string } }> }).people;
    const published = JSON.stringify(SITE).replace(/\D/g, '');
    for (const p of people) expect(published).not.toContain(p.phone.e164.replace(/\D/g, ''));
  });

  it('tracks known placeholders explicitly', () => {
    for (const p of SITE.placeholders) {
      expect(p.field).toMatch(/^[a-z]+(\.[a-z]+)*$/);
      expect(p.reason.length).toBeGreaterThan(10);
    }
  });
});
