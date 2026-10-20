#!/usr/bin/env node
/**
 * Regenerates every raster/derived brand asset from the vector sources in src/brand/.
 *
 *   npm run brand
 *
 * Inputs (produced by brand/generator/ringed.mjs — the owner's chosen "Ringed" VSM planet; see brand/README.md):
 *   src/brand/logo.svg         one colour (currentColor)
 *   src/brand/logo-color.svg   full colour: gold word, gold/white division rings, division planets
 *   src/brand/logo-hero.svg    full colour with a lit gold word
 *   src/brand/mark.svg / mark-color.svg   the "V planet" icon;  mark-small.svg  1-ring cut for ≤ 32 px
 * Outputs:
 *   public/favicon.svg, favicon-32.png         ← mark-small (gold, legible at tab size)
 *   public/apple-touch-icon.png, icon-*.png    ← mark-color
 *   public/og-image.png                        ← logo-hero (1200×630 social card)
 *   public/brand/*                             ← downloadable brand files (press / partners)
 *   public/site.webmanifest
 *
 * Needs `rsvg-convert` (brew install librsvg). Outputs are committed, so CI never needs it.
 * The converter is invoked with execFileSync + an argument array (no shell), so paths cannot inject commands.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BRAND = join(ROOT, 'src/brand');
const PUBLIC = join(ROOT, 'public');
const GOLD = '#D8B86A';
const BG = '#0A0806';

mkdirSync(join(PUBLIC, 'brand'), { recursive: true });
const tmp = join(tmpdir(), `vsm-brand-${process.pid}`);
mkdirSync(tmp, { recursive: true });

/** Inner markup of an SVG file (everything between <svg …> and </svg>) + its viewBox size. */
function parts(file) {
  const src = readFileSync(join(BRAND, file), 'utf8');
  const viewBox = src.match(/viewBox="([^"]+)"/)?.[1];
  const inner = src.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
  if (!viewBox || !inner) throw new Error(`Cannot parse ${file}`);
  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  return { viewBox, w, h, src, inner: inner.replace(/currentColor/g, GOLD) };
}

function render(svg, out, width, height = width) {
  const input = join(tmp, 'in.svg');
  writeFileSync(input, svg);
  execFileSync('rsvg-convert', ['-w', String(width), '-h', String(height), input, '-o', out]);
  console.log('  ✓', out.replace(ROOT + '/', ''));
}

const place = (art, boxW, boxH, x, y, maxW, maxH) => {
  const s = Math.min(maxW / art.w, maxH / art.h);
  return `<g transform="translate(${x + (boxW - art.w * s) / 2} ${y + (boxH - art.h * s) / 2}) scale(${s})">${art.inner}</g>`;
};

/** Artwork on a dark tile: legible on light AND dark browser chrome. */
const tile = (art, pad, radius) => {
  const S = 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${S * radius}" fill="${BG}"/>
  ${place(art, S, S, 0, 0, S * (1 - pad * 2), S * (1 - pad * 2))}
</svg>`;
};

const hero = parts('logo-hero.svg');
const markColor = parts('mark-color.svg');
const markSmall = parts('mark-small.svg'); // currentColor → gold via parts()

console.log('Brand assets:');
writeFileSync(join(PUBLIC, 'favicon.svg'), tile(markSmall, 0.06, 0.2) + '\n');
console.log('  ✓ public/favicon.svg');
render(tile(markSmall, 0.04, 0.2), join(PUBLIC, 'favicon-32.png'), 32);
render(tile(markColor, 0.1, 0), join(PUBLIC, 'apple-touch-icon.png'), 180); // iOS applies its own corner mask
render(tile(markColor, 0.14, 0), join(PUBLIC, 'icon-192.png'), 192);
render(tile(markColor, 0.14, 0), join(PUBLIC, 'icon-512.png'), 512);

// Downloadable brand files: one-colour files in gold; colour files as-is.
for (const f of ['logo.svg', 'mark.svg', 'mark-small.svg']) writeFileSync(join(PUBLIC, 'brand', f), parts(f).src.replace(/currentColor/g, GOLD));
for (const f of ['logo-color.svg', 'logo-hero.svg', 'mark-color.svg']) copyFileSync(join(BRAND, f), join(PUBLIC, 'brand', f));
console.log('  ✓ public/brand/{logo,logo-color,logo-hero,mark,mark-color,mark-small}.svg');
render(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markColor.viewBox}">${markColor.inner}</svg>`, join(PUBLIC, 'brand/mark-512.png'), 512);

// Social share card 1200×630: the wordmark, centred, on the site's dark ground.
render(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs><radialGradient id="glow" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${GOLD}" stop-opacity=".2"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1200" height="630" fill="${BG}"/><rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="24" y="24" width="1152" height="582" fill="none" stroke="${GOLD}" stroke-opacity=".22"/>
  ${place(hero, 1200, 630, 0, 0, 980, 330)}
</svg>`,
  join(PUBLIC, 'og-image.png'),
  1200,
  630,
);

writeFileSync(
  join(PUBLIC, 'site.webmanifest'),
  JSON.stringify(
    {
      name: 'VSM',
      short_name: 'VSM',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: BG,
      theme_color: BG,
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log('  ✓ public/site.webmanifest');
rmSync(tmp, { recursive: true, force: true });
