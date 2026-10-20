import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { parseCards, slugify } from '../brand/generator/cards-data.ts';
import { buildPersonVCard, type PersonContact } from '../src/core/contact.ts';
import { qrMatrix, qrPath, type QrMatrix } from '../src/core/qr.ts';
import exampleJson from '../brand/cards/people.example.json?raw';

const EXAMPLE = JSON.parse(exampleJson) as unknown;

const person: PersonContact = {
  givenName: 'Zoë',
  familyName: "O'Brien-Núñez",
  title: 'Co-Founder',
  email: 'zoe@example.com',
  phone: { display: '+1 416 555 0100', e164: '+14165550100' },
  org: 'VSM GROUP INC',
  address: { street: '100 Example Street', unit: 'Suite 200', locality: 'Toronto', region: 'Ontario', postalCode: 'A1A 1A1', country: 'Canada' },
};

/** Rasterises a QR matrix (4 px per module, 4-module quiet zone) and decodes it with an independent reader. */
function scan(m: QrMatrix): string | null {
  const px = 4;
  const n = (m.size + 8) * px;
  const rgba = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const r = Math.floor(y / px) - 4;
      const c = Math.floor(x / px) - 4;
      if (r >= 0 && c >= 0 && r < m.size && c < m.size && m.dark(r, c)) rgba.fill(0, (y * n + x) * 4, (y * n + x) * 4 + 3);
    }
  }
  return jsQR(rgba, n, n)?.data ?? null;
}

describe('person vCard (business-card QR payload)', () => {
  it('is vCard 3.0 with CRLF endings and the fields a phone needs', () => {
    const v = buildPersonVCard(person);
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(v.endsWith('END:VCARD\r\n')).toBe(true);
    expect(v).toContain("N:O'Brien-Núñez;Zoë;;;\r\n");
    expect(v).toContain('TEL;TYPE=CELL:+14165550100\r\n');
    expect(v).toContain('EMAIL:zoe@example.com\r\n');
    // The street's comma is escaped so it isn't read as a component separator.
    expect(v).toContain('ADR;TYPE=WORK:;;100 Example Street\\, Suite 200;Toronto;Ontario;A1A 1A1;Canada\r\n');
    expect(v).not.toContain('URL:');
  });

  it('rejects numbers and emails that would produce a dead contact', () => {
    expect(() => buildPersonVCard({ ...person, phone: { display: 'x', e164: '416-555-0100' } })).toThrow(/E\.164/);
    expect(() => buildPersonVCard({ ...person, email: 'not-an-email' })).toThrow(/email/);
  });
});

describe('QR encoder', () => {
  it('round-trips a full vCard, including non-ASCII names (UTF-8), through an independent decoder', () => {
    const v = buildPersonVCard(person);
    expect(scan(qrMatrix(v))).toBe(v);
  });

  it('path covers exactly the dark modules', () => {
    const m = qrMatrix('VSM');
    const quiet = 4;
    const painted = new Set<string>();
    for (const [, x, y, w] of qrPath(m, quiet).matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
      for (let i = 0; i < Number(w); i += 1) painted.add(`${Number(y) - quiet},${Number(x) - quiet + i}`);
    }
    let dark = 0;
    for (let r = 0; r < m.size; r += 1) for (let c = 0; c < m.size; c += 1) {
      if (m.dark(r, c)) { dark += 1; expect(painted.has(`${r},${c}`)).toBe(true); }
    }
    expect(painted.size).toBe(dark);
    expect(m.size).toBe(17 + 4 * m.version);
  });
});

describe('business-card data (brand/cards/people.example.json)', () => {
  it('parses the committed template', () => {
    const [card] = parseCards(EXAMPLE);
    expect(card?.slug).toBe('alex-example');
    expect(card?.address).toEqual(['100 Example Street, Suite 200', 'Toronto, Ontario A1A 1A1, Canada']);
    expect(card?.website).toBeNull();
    // Small enough for a ≤ version-12 code: modules stay ≥ 0.33 mm on the 1.04 in printed tile.
    expect(qrMatrix(card!.vcard).version).toBeLessThanOrEqual(12);
  });

  it('refuses a printed number that differs from the number the QR dials', () => {
    const bad = structuredClone(EXAMPLE) as { people: Array<{ phone: { display: string } }> };
    bad.people[0]!.phone.display = '+1 416 555 0199';
    expect(() => parseCards(bad)).toThrow(/display/);
  });

  it('refuses control characters, missing fields and non-https websites', () => {
    const base = () => structuredClone(EXAMPLE) as { company: Record<string, unknown>; people: Array<Record<string, unknown>> };
    const ctl = base(); ctl.people[0]!['title'] = 'CEO\nEND:VCARD';
    expect(() => parseCards(ctl)).toThrow(/control/);
    const missing = base(); delete missing.people[0]!['email'];
    expect(() => parseCards(missing)).toThrow(/email/);
    const http = base(); http.company['website'] = 'http://example.com';
    expect(() => parseCards(http)).toThrow(/website/);
  });

  it('makes file-name-safe slugs', () => {
    expect(slugify("Zoë O'Brien-Núñez")).toBe('zoe-o-brien-nunez');
    expect(slugify('../../etc')).toBe('etc');
  });
});
