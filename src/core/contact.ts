import { SITE, type Division } from '../config/site.ts';

/**
 * Contact helpers. There is deliberately NO backend and NO form submission:
 * every enquiry goes through the visitor's own mail client via mailto:, so the site
 * never receives, stores or transmits personal data.
 */

export function enquirySubject(division: Pick<Division, 'name'> | null): string {
  return division ? `${division.name} enquiry — ${SITE.company.brand}` : `Enquiry — ${SITE.company.brand}`;
}

export function mailtoHref(email: string, subject?: string): string {
  // RFC 6068: hfields must be percent-encoded; encodeURIComponent covers "&", "=", "?", "#", spaces, unicode.
  return subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
}

export function telHref(e164: string): string {
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) throw new Error(`Not an E.164 number: ${e164}`);
  return `tel:${e164}`;
}

/** Escape a value for a vCard text property (RFC 6350 §3.4; identical rules in 3.0, RFC 2426 §4). */
function vcardEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** A postal address, split the way vCard ADR wants it (RFC 2426 §3.2.1). */
export interface PostalAddress {
  street: string;
  /** Suite / unit, printed after the street ("Suite 200"). */
  unit?: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
}

/** One person's contact card: business cards today, team pages / partner portals later. */
export interface PersonContact {
  givenName: string;
  familyName: string;
  title: string;
  email: string;
  phone: { display: string; e164: string };
  org: string;
  address?: PostalAddress;
  url?: string;
}

/** Street line as people write it: "100 Example Street, Suite 200". */
export function streetLine(a: PostalAddress): string {
  return a.unit ? `${a.street}, ${a.unit}` : a.street;
}

/**
 * vCard 3.0 for a person, sized for a QR code. 3.0 rather than 4.0 because it is what phone cameras
 * (iOS Camera, Google Lens, Samsung) import most reliably from a scanned code. Kept to the fields a
 * contact needs — every extra byte makes the QR denser and harder to scan from a small card.
 */
export function buildPersonVCard(p: PersonContact): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Error(`Not an email address: ${p.email}`);
  const tel = telHref(p.phone.e164).slice('tel:'.length); // validates E.164
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${vcardEscape(p.familyName)};${vcardEscape(p.givenName)};;;`,
    `FN:${vcardEscape(`${p.givenName} ${p.familyName}`)}`,
    `ORG:${vcardEscape(p.org)}`,
    `TITLE:${vcardEscape(p.title)}`,
    `TEL;TYPE=CELL:${tel}`,
    `EMAIL:${vcardEscape(p.email)}`,
  ];
  if (p.address) {
    const a = p.address;
    // ADR: PO box ; extended ; street ; locality ; region ; postal code ; country
    const parts = ['', '', streetLine(a), a.locality, a.region, a.postalCode, a.country];
    lines.push(`ADR;TYPE=WORK:${parts.map(vcardEscape).join(';')}`);
  }
  if (p.url) lines.push(`URL:${vcardEscape(p.url)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

/** Builds a vCard so visitors can save the company contact in one tap. CRLF line endings per RFC 6350. */
export function buildVCard(siteUrl?: string): string {
  const { company, contact } = SITE;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'KIND:org',
    `FN:${vcardEscape(company.legalName)}`,
    `ORG:${vcardEscape(company.legalName)}`,
    `EMAIL;TYPE=work:${vcardEscape(contact.email)}`,
  ];
  if (contact.phone) lines.push(`TEL;VALUE=uri;TYPE=work,voice:${telHref(contact.phone.e164)}`);
  if (siteUrl) lines.push(`URL:${vcardEscape(siteUrl)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}
