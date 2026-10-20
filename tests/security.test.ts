import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { NOT_FOUND_STYLE_HASH, notFoundHtml } from '../build/notFoundPage.ts';
import { CSP_HEADER, CSP_META, SECURITY_HEADERS, headerCsp, staticWebAppConfig } from '../src/config/security.ts';

describe('security policy', () => {
  it('meta CSP is locked to self with no unsafe keywords', () => {
    expect(CSP_META).toContain("default-src 'self'");
    expect(CSP_META).toContain("script-src 'self'");
    expect(CSP_META).toContain("object-src 'none'");
    expect(CSP_META).toContain("form-action 'none'");
    expect(CSP_META).not.toMatch(/unsafe-|\*|http:/);
  });

  it('meta CSP omits header-only directives (browsers ignore them in <meta>)', () => {
    expect(CSP_META).not.toContain('frame-ancestors');
  });

  it('header CSP adds clickjacking protection', () => {
    expect(CSP_HEADER).toContain("frame-ancestors 'none'");
    expect(CSP_HEADER).toContain('upgrade-insecure-requests');
  });

  it('Azure config sends the full hardening header set', () => {
    const cfg = staticWebAppConfig() as { globalHeaders: Record<string, string> };
    for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
      expect(cfg.globalHeaders[h]).toBe(SECURITY_HEADERS[h]);
    }
    expect(cfg.globalHeaders['Content-Security-Policy']).toBe(headerCsp());
  });

  it('allows no unused schemes (blob: is not needed by anything)', () => {
    expect(CSP_META).not.toContain('blob:');
  });

  it("pins the 404 page's inline stylesheet in the Azure header CSP (header CSP applies to 404.html too)", () => {
    const html = notFoundHtml('', 'X');
    const style = html.match(/<style>([\s\S]*?)<\/style>/)![1]!;
    const actual = createHash('sha256').update(style).digest('base64');
    expect(actual).toBe(NOT_FOUND_STYLE_HASH);
    const cfg = staticWebAppConfig([NOT_FOUND_STYLE_HASH]) as { globalHeaders: Record<string, string> };
    const styleSrc = cfg.globalHeaders['Content-Security-Policy']!.split(';').find((d) => d.trim().startsWith('style-src'))!;
    expect(styleSrc).toContain(`'sha256-${actual}'`);
    expect(styleSrc).not.toContain('unsafe-inline');
    // …and the page's own <meta> CSP pins the same hash (read it the way a browser does: parsed + attribute-decoded)
    const metaCsp = new DOMParser().parseFromString(html, 'text/html').querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')!;
    expect(metaCsp).toContain(`style-src 'sha256-${actual}'`);
    expect(metaCsp).toContain("script-src 'none'");
  });
});
