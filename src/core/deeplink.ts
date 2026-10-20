import { isDivisionId, type DivisionId } from '../config/site.ts';

/**
 * Deep links are hash-based (#music, #contact) so they work on any static host with zero
 * server config: GitHub Pages project paths, custom domains, Azure Static Web Apps, a USB stick.
 */

export interface HashTarget {
  division: DivisionId | null;
  /** Non-division anchor (e.g. "contact"), passed through for native scrolling. */
  anchor: string | null;
}

export function parseHash(hash: string): HashTarget {
  const raw = hash.replace(/^#/, '').trim().toLowerCase();
  if (!raw) return { division: null, anchor: null };
  // Only accept simple slugs; anything else is ignored rather than reflected anywhere.
  if (!/^[a-z0-9-]{1,40}$/.test(raw)) return { division: null, anchor: null };
  return isDivisionId(raw) ? { division: raw, anchor: null } : { division: null, anchor: raw };
}

export function divisionHash(id: DivisionId | null): string {
  return id ? `#${id}` : '';
}
