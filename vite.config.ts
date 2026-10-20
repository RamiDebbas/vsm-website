/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { SITE } from './src/config/site.ts';
import { CSP_META, staticWebAppConfig } from './src/config/security.ts';
import { divisionCss, renderBody, renderHead, type MarkupOptions } from './src/ui/markup.ts';
import { NOT_FOUND_STYLE_HASH, notFoundHtml } from './build/notFoundPage.ts';

/**
 * Build pipeline map (docs/ARCHITECTURE.md → "Build"):
 *   index.html slots  <!--@csp--> <!--@head--> <!--@body-->  ← filled by `siteContent()` from src/config/site.ts
 *   virtual:divisions.css                                     ← per-division accent colours, bundled as a normal CSS file
 *   dist/staticwebapp.config.json                             ← Azure headers, generated from src/config/security.ts
 *   dist/404.html                                             ← self-contained, hash-pinned CSP (build/notFoundPage.ts)
 *   dist/robots.txt (+ sitemap.xml when SITE_URL is known)
 *
 * Env:
 *   SITE_URL  absolute origin of the deployed site, e.g. https://vsmgrp.com (no trailing slash).
 *             Optional. Enables canonical/og:url/sitemap. Set in .github/workflows/deploy.yml.
 */
const SITE_URL = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
if (SITE_URL && !/^https:\/\/[a-z0-9.-]+(\/[\w./-]*)?$/i.test(SITE_URL)) {
  throw new Error(`SITE_URL must be an https URL without a trailing slash, got "${SITE_URL}"`);
}

const VIRTUAL_CSS = 'virtual:divisions.css';
const RESOLVED_CSS = '/__vsm_divisions.css';

function markupOptions(): MarkupOptions {
  return { siteUrl: SITE_URL, year: new Date().getFullYear() };
}

function siteContent(): Plugin {
  return {
    name: 'vsm:site-content',
    resolveId(id) {
      return id === VIRTUAL_CSS ? RESOLVED_CSS : null;
    },
    load(id) {
      return id === RESOLVED_CSS ? divisionCss() : null;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const opts = markupOptions();
        return html.replace('<!--@head-->', renderHead(opts)).replace('<!--@body-->', renderBody(opts));
      },
    },
  };
}

/** Production-only: dev server needs inline scripts for HMR, so the CSP is injected at build. */
function securityPolicy(): Plugin {
  return {
    name: 'vsm:security-policy',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const isBuild = !ctx.server;
        return html.replace(
          '<!--@csp-->',
          isBuild ? `<meta http-equiv="Content-Security-Policy" content="${CSP_META}">` : '',
        );
      },
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'staticwebapp.config.json',
        source: JSON.stringify(staticWebAppConfig([NOT_FOUND_STYLE_HASH]), null, 2) + '\n',
      });
      const robots = ['User-agent: *', 'Allow: /', SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml` : '']
        .filter(Boolean)
        .join('\n');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots + '\n' });
      this.emitFile({ type: 'asset', fileName: '404.html', source: notFoundHtml(SITE_URL, SITE.company.legalName) });
      if (SITE_URL) {
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}/</loc></url>\n</urlset>\n`,
        });
      }
    },
  };
}

export default defineConfig({
  // Relative base: the same build works at https://<user>.github.io/<repo>/, at a custom domain root,
  // on Azure Static Web Apps, or opened from any sub-path — no rebuild per host.
  base: './',
  plugins: [siteContent(), securityPolicy()],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0, // keep fonts/images as files: cacheable, and no data: URIs needed in script contexts
    chunkSizeWarningLimit: 800,
  },
  define: {
    __SITE_URL__: JSON.stringify(SITE_URL),
    __COMPANY__: JSON.stringify(SITE.company.legalName),
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
