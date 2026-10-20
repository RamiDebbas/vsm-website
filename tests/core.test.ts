import { describe, expect, it, vi } from 'vitest';
import { SITE } from '../src/config/site.ts';
import { buildVCard, enquirySubject, mailtoHref, telHref } from '../src/core/contact.ts';
import { divisionHash, parseHash } from '../src/core/deeplink.ts';
import { createStore } from '../src/core/store.ts';
import { focusedDivision, isStill, type AppState } from '../src/core/state.ts';
import { damp, poseFor } from '../src/scene/poses.ts';

describe('store', () => {
  it('notifies subscribers with next and previous state', () => {
    const s = createStore({ a: 1, b: 'x' });
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ a: 2 });
    expect(fn).toHaveBeenCalledWith({ a: 2, b: 'x' }, { a: 1, b: 'x' });
  });

  it('skips notifications when nothing changed', () => {
    const s = createStore({ a: 1 });
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ a: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribes', () => {
    const s = createStore({ a: 1 });
    const fn = vi.fn();
    const off = s.subscribe(fn);
    off();
    s.set({ a: 2 });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('focusedDivision', () => {
  const base = { active: null, preview: null, section: 'top', reducedMotion: false, motionPaused: false, lastInteraction: 0 } satisfies AppState;
  it('prefers preview over active', () => {
    expect(focusedDivision({ ...base, active: 'music', preview: 'talent' })).toBe('talent');
    expect(focusedDivision({ ...base, active: 'music' })).toBe('music');
    expect(focusedDivision(base)).toBeNull();
  });
});

describe('isStill', () => {
  it('is true for the OS preference OR the on-page pause toggle', () => {
    expect(isStill({ reducedMotion: false, motionPaused: false })).toBe(false);
    expect(isStill({ reducedMotion: true, motionPaused: false })).toBe(true);
    expect(isStill({ reducedMotion: false, motionPaused: true })).toBe(true);
  });
});

describe('deep links', () => {
  it('parses division hashes case-insensitively', () => {
    expect(parseHash('#music')).toEqual({ division: 'music', anchor: null });
    expect(parseHash('#Talent')).toEqual({ division: 'talent', anchor: null });
  });

  it('passes other simple anchors through', () => {
    expect(parseHash('#contact')).toEqual({ division: null, anchor: 'contact' });
  });

  it('ignores empty and hostile hashes', () => {
    expect(parseHash('')).toEqual({ division: null, anchor: null });
    expect(parseHash('#')).toEqual({ division: null, anchor: null });
    expect(parseHash('#<img src=x onerror=alert(1)>')).toEqual({ division: null, anchor: null });
    expect(parseHash('#' + 'a'.repeat(200))).toEqual({ division: null, anchor: null });
  });

  it('round-trips', () => {
    expect(parseHash(divisionHash('growth')).division).toBe('growth');
    expect(divisionHash(null)).toBe('');
  });
});

describe('contact helpers', () => {
  it('builds per-division subjects', () => {
    expect(enquirySubject({ name: 'Music' })).toBe('Music enquiry — VSM');
    expect(enquirySubject(null)).toBe('Enquiry — VSM');
  });

  it('percent-encodes mailto subjects (RFC 6068)', () => {
    const href = mailtoHref('a@b.co', 'R&D? yes=no #1 — ü');
    expect(href.startsWith('mailto:a@b.co?subject=')).toBe(true);
    const encoded = href.slice('mailto:a@b.co?subject='.length);
    expect(encoded).not.toMatch(/[ &#?=]/); // raw delimiters would split or truncate the header
    expect(decodeURIComponent(encoded)).toBe('R&D? yes=no #1 — ü');
    expect(mailtoHref('a@b.co')).toBe('mailto:a@b.co');
  });

  it('validates E.164 for tel: links', () => {
    expect(telHref('+13055550199')).toBe('tel:+13055550199');
    expect(() => telHref('305-555-0199')).toThrow();
    expect(() => telHref('javascript:alert(1)')).toThrow();
  });

  it('produces an RFC 6350 vCard with CRLF line endings', () => {
    const v = buildVCard('https://example.com');
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:4.0\r\n')).toBe(true);
    expect(v.endsWith('END:VCARD\r\n')).toBe(true);
    expect(v).toContain(`EMAIL;TYPE=work:${SITE.contact.email}`);
    if (SITE.contact.phone) expect(v).toContain(`TEL;VALUE=uri;TYPE=work,voice:tel:${SITE.contact.phone.e164}`);
    else expect(v).not.toContain('TEL');
    expect(v).toContain('URL:https://example.com');
    expect(v.split('\r\n').every((line) => !line.includes('\n'))).toBe(true);
  });
});

describe('camera poses', () => {
  it('has a pose for every section on both breakpoints', () => {
    for (const s of ['top', 'group', 'divisions', 'contact'] as const) {
      for (const w of [375, 1440]) {
        const p = poseFor(s, w);
        expect(p.exposure).toBeGreaterThan(0);
        expect(Math.abs(p.shiftX)).toBeLessThan(0.5);
      }
    }
  });

  it('dims the scene in reading sections', () => {
    expect(poseFor('divisions', 1440).exposure).toBeLessThan(poseFor('top', 1440).exposure);
  });

  it('damp is frame-rate independent', () => {
    // Two 1/120s steps must land where one 1/60s step lands.
    const a = damp(damp(0, 10, 4, 1 / 120), 10, 4, 1 / 120);
    const b = damp(0, 10, 4, 1 / 60);
    expect(a).toBeCloseTo(b, 10);
    expect(damp(0, 10, 4, 0)).toBe(0);
  });
});
