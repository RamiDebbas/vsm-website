/**
 * SECURITY POLICY — single definition, emitted to two places at build time (vite.config.ts):
 *   1. <meta http-equiv="Content-Security-Policy"> in dist/index.html
 *      → used on GitHub Pages, which cannot send custom response headers.
 *   2. dist/staticwebapp.config.json → real HTTP headers on Azure Static Web Apps
 *      (adds what a <meta> CSP cannot express: frame-ancestors, HSTS, nosniff, …).
 *
 * The site has no backend, no forms that submit, no third-party scripts, fonts or analytics,
 * so everything can be locked to 'self'. If you add a third party later, add its origin to the
 * narrowest directive here — never loosen default-src. See docs/SECURITY.md.
 */

export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'], // data: = CSS grain texture; nothing loads blob: images
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'media-src': ["'self'"],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
};

/** Directives that are ignored (or invalid) inside a <meta> CSP and must be sent as headers. */
const HEADER_ONLY: Readonly<Record<string, readonly string[]>> = {
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
};

function serialize(d: Readonly<Record<string, readonly string[]>>): string {
  return Object.entries(d)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

export const CSP_META = serialize(CSP_DIRECTIVES);
export const CSP_HEADER = serialize({ ...CSP_DIRECTIVES, ...HEADER_ONLY });

/**
 * Header CSP for hosts that send it on EVERY response (Azure globalHeaders apply to 404.html too).
 * `extraStyleHashes` pins the 404 page's single inline stylesheet by sha256 — nothing else inline is allowed.
 */
export function headerCsp(extraStyleHashes: readonly string[] = []): string {
  return serialize({
    ...CSP_DIRECTIVES,
    'style-src': [...(CSP_DIRECTIVES['style-src'] ?? []), ...extraStyleHashes.map((h) => `'sha256-${h}'`)],
    ...HEADER_ONLY,
  });
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CSP_HEADER,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** Azure Static Web Apps config (https://learn.microsoft.com/azure/static-web-apps/configuration). */
export function staticWebAppConfig(extraStyleHashes: readonly string[] = []): object {
  return {
    globalHeaders: { ...SECURITY_HEADERS, 'Content-Security-Policy': headerCsp(extraStyleHashes) },
    routes: [
      { route: '/assets/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
      { route: '/index.html', headers: { 'Cache-Control': 'no-cache' } },
    ],
    mimeTypes: { '.webmanifest': 'application/manifest+json', '.vcf': 'text/vcard' },
    responseOverrides: { '404': { rewrite: '/404.html' } },
  };
}
