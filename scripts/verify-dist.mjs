#!/usr/bin/env node
/**
 * POST-BUILD INSPECTION — runs after every `npm run build` (locally and in CI) and fails the
 * build if the output violates a structural or security rule. Think of it as a building inspector
 * for dist/: it checks the finished artefact, not the source.
 *
 * Checks
 *   1. CSP <meta> present and locked to 'self' (no 'unsafe-inline' / 'unsafe-eval' / wildcards)
 *   2. No executable inline <script> and no style="" attributes (the CSP would block them anyway)
 *   3. No third-party origins loaded by index.html (scripts, styles, fonts, preloads)
 *   4. All asset URLs are relative (so the same build works on any host / sub-path)
 *   5. Every locally referenced file exists in dist/
 *   6. Required files present (404.html, robots.txt, staticwebapp.config.json, icons, manifest)
 *   7. JS / CSS gzip budgets
 * Also prints known placeholder content from src/config/site.ts as warnings.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const BUDGET_KB = { js: 260, css: 40 };

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('✗ dist/index.html missing — did the build run?');
  process.exit(1);
}
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// 1. CSP
const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
if (!csp) fail('CSP <meta> is missing from index.html');
else {
  if (/unsafe-inline|unsafe-eval|\*/.test(csp)) fail(`CSP is too permissive: ${csp}`);
  if (!/default-src 'self'/.test(csp)) fail("CSP must set default-src 'self'");
  if (!/object-src 'none'/.test(csp)) fail("CSP must set object-src 'none'");
  if (html.indexOf('Content-Security-Policy') > html.indexOf('<script')) fail('CSP <meta> must come before the first <script>');
}

// 2. Inline script / style
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = m[1] ?? '';
  const body = (m[2] ?? '').trim();
  if (body && !/type="application\/ld\+json"/.test(attrs)) fail(`Inline executable <script> found: ${attrs.trim()}`);
}
if (/\sstyle\s*=/.test(html)) fail('style="" attribute found in index.html (blocked by CSP)');
if (/<style\b/.test(html)) fail('<style> element found in index.html (blocked by CSP)');

// 3 + 4 + 5. Resource URLs (canonical is a link, not a loaded resource, so it may be absolute)
const tags = [...html.matchAll(/<(script|img|source|link)\b[^>]*>/g)].map((m) => m[0]);
const resourceUrls = [];
for (const tag of tags) {
  if (/rel="canonical"/.test(tag)) continue;
  const url = tag.match(/\s(?:src|href)="([^"]+)"/)?.[1];
  if (url) resourceUrls.push(url);
}
for (const url of resourceUrls) {
  if (/^https?:|^\/\//.test(url)) {
    fail(`Third-party / absolute resource: ${url}`);
    continue;
  }
  if (url.startsWith('/')) fail(`Root-absolute URL breaks on sub-path hosting: ${url} (use relative)`);
  const file = join(DIST, url.replace(/^\.\//, '').split(/[?#]/)[0]);
  if (!existsSync(file)) fail(`Referenced file missing from dist: ${url}`);
}

// 6. Required files
for (const f of ['404.html', 'robots.txt', 'staticwebapp.config.json', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'site.webmanifest', 'og-image.png']) {
  if (!existsSync(join(DIST, f))) fail(`Required file missing: dist/${f}`);
}
try {
  const swa = JSON.parse(readFileSync(join(DIST, 'staticwebapp.config.json'), 'utf8'));
  if (!swa.globalHeaders?.['Content-Security-Policy']?.includes("frame-ancestors 'none'")) fail('Azure config must send frame-ancestors via header');
} catch (e) {
  fail(`staticwebapp.config.json unreadable: ${e.message}`);
}

// 7. Budgets
const sizes = { js: 0, css: 0 };
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css)$/.test(name)) sizes[name.endsWith('.js') ? 'js' : 'css'] += gzipSync(readFileSync(p)).length;
  }
};
walk(join(DIST, 'assets'));
for (const kind of ['js', 'css']) {
  const kb = sizes[kind] / 1024;
  const line = `${kind.toUpperCase()} total ${kb.toFixed(1)} KB gzip (budget ${BUDGET_KB[kind]} KB)`;
  if (kb > BUDGET_KB[kind]) fail(line);
  else console.log(`  ✓ ${line}`);
}

// Placeholders (warn, never fail — they are known and tracked).
const siteSrc = readFileSync(join(ROOT, 'src/config/site.ts'), 'utf8');
for (const m of siteSrc.matchAll(/field:\s*'([^']+)',\s*\n\s*reason:\s*'([^']+)'/g)) warnings.push(`PLACEHOLDER ${m[1]}: ${m[2]}`);

for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\nverify-dist: ${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`  ✓ verify-dist: ${resourceUrls.length} resource URLs checked, CSP + structure OK`);
