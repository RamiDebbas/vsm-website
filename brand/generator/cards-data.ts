import { buildPersonVCard, streetLine, telHref, type PersonContact, type PostalAddress } from '../../src/core/contact.ts';

/**
 * Business-card data, validated. Source: brand/cards/people.json — git-ignored, because it holds personal
 * mobile numbers and this repository may be public (GitHub Pages). The shape is documented by the committed
 * brand/cards/people.example.json, which the tests also run through this parser.
 */
export interface CardsFile {
  company: { org: string; website?: string; office: PostalAddress };
  people: Array<Pick<PersonContact, 'givenName' | 'familyName' | 'title' | 'email' | 'phone'>>;
}

export interface Card {
  /** File-name-safe id: "alex-example". */
  slug: string;
  contact: PersonContact;
  /** Exactly what the QR code encodes. */
  vcard: string;
  /** Printed address, two lines. */
  address: [string, string];
  /** Printed website without the scheme ("vsmgrp.com"), or null when the company has none yet. */
  website: string | null;
}

type Obj = Record<string, unknown>;

function obj(v: unknown, at: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${at}: expected an object`);
  return v as Obj;
}

function text(o: Obj, key: string, at: string, max = 60): string {
  const v = o[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${at}.${key}: required text`);
  if (v.length > max) throw new Error(`${at}.${key}: longer than ${max} characters`);
  // Values end up in HTML and in vCard lines; control characters have no business in either.
  if (/[\u0000-\u001f\u007f]/.test(v)) throw new Error(`${at}.${key}: contains control characters`);
  return v.trim();
}

function optionalText(o: Obj, key: string, at: string): string | undefined {
  return o[key] === undefined || o[key] === null ? undefined : text(o, key, at);
}

export function slugify(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseCards(raw: unknown): Card[] {
  const root = obj(raw, 'people.json');
  const company = obj(root['company'], 'company');
  const org = text(company, 'org', 'company');

  const websiteRaw = optionalText(company, 'website', 'company');
  if (websiteRaw !== undefined && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/?$/i.test(websiteRaw)) {
    throw new Error('company.website: must be an https origin like "https://vsmgrp.com"');
  }

  const o = obj(company['office'], 'company.office');
  const unit = optionalText(o, 'unit', 'company.office');
  const office: PostalAddress = {
    street: text(o, 'street', 'company.office'),
    ...(unit ? { unit } : {}),
    locality: text(o, 'locality', 'company.office'),
    region: text(o, 'region', 'company.office'),
    postalCode: text(o, 'postalCode', 'company.office', 12),
    country: text(o, 'country', 'company.office'),
  };
  const address: [string, string] = [
    streetLine(office),
    `${office.locality}, ${office.region} ${office.postalCode}, ${office.country}`,
  ];

  if (!Array.isArray(root['people']) || root['people'].length === 0) throw new Error('people: expected a non-empty list');
  const seen = new Set<string>();
  return root['people'].map((entry, i) => {
    const at = `people[${i}]`;
    const p = obj(entry, at);
    const phone = obj(p['phone'], `${at}.phone`);
    const display = text(phone, 'display', `${at}.phone`, 24);
    if (!/^[+\d][\d ()+.-]*$/.test(display)) throw new Error(`${at}.phone.display: digits, spaces and + ( ) . - only`);
    const e164 = text(phone, 'e164', `${at}.phone`, 16);
    telHref(e164); // throws on anything that isn't E.164
    // The printed number and the scanned number must be the same number.
    if (display.replace(/\D/g, '') !== e164.slice(1)) throw new Error(`${at}.phone: display "${display}" ≠ e164 "${e164}"`);

    const contact: PersonContact = {
      givenName: text(p, 'givenName', at, 30),
      familyName: text(p, 'familyName', at, 30),
      title: text(p, 'title', at, 40),
      email: text(p, 'email', at, 60),
      phone: { display, e164 },
      org,
      address: office,
      ...(websiteRaw ? { url: websiteRaw.replace(/\/$/, '') } : {}),
    };
    const slug = slugify(`${contact.givenName} ${contact.familyName}`);
    if (!slug || seen.has(slug)) throw new Error(`${at}: empty or duplicate name`);
    seen.add(slug);
    return {
      slug,
      contact,
      vcard: buildPersonVCard(contact), // also validates the email
      address,
      website: websiteRaw ? websiteRaw.replace(/^https:\/\//, '').replace(/\/$/, '') : null,
    };
  });
}
