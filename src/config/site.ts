/**
 * SINGLE SOURCE OF TRUTH for every fact shown on the site.
 *
 * Rules (see docs/ARCHITECTURE.md → "Content model"):
 *  - Only real, confirmed company information lives here. Do not invent claims.
 *  - Markup (build-time, src/ui/markup.ts) and behaviour (runtime, src/ui/*.ts) both read from here,
 *    so changing a value here changes it everywhere — HTML, JSON-LD, mailto links, the 3D scene.
 *  - Optional fields (`summary`, `links`) are deliberate empty slots for data we do not have yet.
 *    They render only when filled in, so they are safe to leave undefined.
 */

export const DIVISION_IDS = [
  'music',
  'events',
  'talent',
  'growth',
  'consulting',
  'investments',
  'development',
] as const;

export type DivisionId = (typeof DIVISION_IDS)[number];

/**
 * How a division's planet moves on its ring. Ring geometry itself (radius, tilt, colour, start angle) lives in
 * src/config/rings.json — shared with the logo generator, so the site rings ARE the logo rings. Ring i = division i.
 */
export interface OrbitSpec {
  /** Angular speed in radians/second along its ring (negative = retrograde). */
  readonly speed: number;
}

export interface Division {
  /** URL-safe slug. Also the deep-link hash, e.g. https://…/#music */
  readonly id: DivisionId;
  /** Display name (proper case). */
  readonly name: string;
  /** Accent colour (#RRGGBB). Must pass WCAG AA (4.5:1) on THEME.bg — enforced by tests/site.test.ts. */
  readonly accent: string;
  readonly orbit: OrbitSpec;
  /** SLOT: one-line description. Leave undefined until confirmed copy exists. */
  readonly summary?: string;
  /** SLOT: future per-division pages / partner sites. */
  readonly links?: readonly { readonly label: string; readonly href: string }[];
}

export interface Placeholder {
  readonly field: string;
  readonly reason: string;
}

export interface SiteContent {
  readonly company: {
    /** Registered entity name — ONLY for legal contexts: copyright line, vCard ORG, JSON-LD `name`. */
    readonly legalName: string;
    /** The brand as displayed everywhere else (logo, titles, copy, email subjects). */
    readonly brand: string;
  };
  readonly divisions: readonly Division[];
  readonly contact: {
    readonly email: string;
    /** Optional: no number is shown until there is a business line (personal mobiles stay off the public site). */
    readonly phone?: { readonly display: string; readonly e164: string };
  };
  /**
   * Values we know are not final. Surfaced as warnings by scripts/verify-dist.mjs on every build,
   * so they cannot be forgotten silently.
   */
  readonly placeholders: readonly Placeholder[];
}

export const THEME = {
  bg: '#0A0806',
  ink: '#F3EEE3',
  gold: '#D8B86A',
} as const;

export const SITE: SiteContent = {
  company: {
    legalName: 'VSM GROUP INC',
    brand: 'VSM', // owner decision 2026-09-29: the brand is "VSM" alone — no "Group Inc" in branding
  },
  // Division palette — NEUTRAL, EVEN, MINIMAL (owner direction 2026-09-30): soft tints that colour the planets and the
  // page accent without shouting. Set by rule, enforced by tests/site.test.ts:
  //   even lightness (CIELAB L* 78–86), low chroma (C* ≤ 20 — the gold is ~44), readable on the background,
  //   never mistakable for the gold (ΔE ≥ 25), still distinguishable from each other (ΔE ≥ 10).
  //   Blush, sand, lilac, sage, mist, seafoam, stone (OKLCH L 0.84 / C 0.045).
  divisions: [
    { id: 'music', name: 'Music', accent: '#E6BFC1', orbit: { speed: 0.21 } },
    { id: 'events', name: 'Events', accent: '#E1C4AE', orbit: { speed: 0.17 } },
    { id: 'talent', name: 'Talent', accent: '#CFC4E4', orbit: { speed: 0.14 } },
    { id: 'growth', name: 'Growth', accent: '#B7D3BB', orbit: { speed: 0.115 } },
    { id: 'consulting', name: 'Consulting', accent: '#B1CFE5', orbit: { speed: 0.095 } },
    { id: 'investments', name: 'Investments', accent: '#A9D4D3', orbit: { speed: 0.08 } },
    { id: 'development', name: 'Development', accent: '#CCCEAC', orbit: { speed: 0.068 } },
  ],
  // Owner decision 2026-10-20: company address on the company domain (vsmgrp.com, Microsoft 365 mail); no phone on the
  // public site. To add a business line later: phone: { display: '+1 416 555 0100', e164: '+14165550100' }.
  contact: {
    email: 'info@vsmgrp.com',
  },
  placeholders: [
    {
      field: 'contact.email',
      reason: 'info@vsmgrp.com must exist in Microsoft 365 (shared mailbox or alias). Send a test email, then delete this entry.',
    },
  ],
};

/** Lookup helper that keeps call-sites free of `undefined` checks for known ids. */
export function getDivision(id: DivisionId): Division {
  const found = SITE.divisions.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown division: ${id}`);
  return found;
}

export function isDivisionId(value: string): value is DivisionId {
  return (DIVISION_IDS as readonly string[]).includes(value);
}
