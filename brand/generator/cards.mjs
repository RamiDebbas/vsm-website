/**
 * VSM business cards → print-ready files, for everyone in brand/cards/people.json.
 *
 *   people.json ─ cards-data.ts (validate) ─ vCard 3.0 (src/core/contact.ts) ─ QR (src/core/qr.ts)
 *        └─ HTML/CSS card (brand fonts + logo SVGs inlined) ─ headless Chrome (DevTools protocol)
 *             ├─ PDF  vector; text converted to outlines with Ghostscript when installed (printers' #1 font issue)
 *             ├─ PNG  600 dpi, tagged as 600 dpi        → printers that want images
 *             └─ self-checks: layout inside the safe area, no overlaps, and the QR re-scanned from the
 *                rendered card pixels must read back the exact vCard. Any failure stops the run.
 *
 * Output → brand/cards/out/ (git-ignored, contains phone numbers):
 *   <slug>.pdf            2 pages: front, back. 3.75 × 2.25 in = 3.5 × 2 in card + 1/8 in bleed. Online printers.
 *   <slug>-marks.pdf      the same with crop marks on a slug, for local print shops.
 *   <slug>-front.png / <slug>-back.png   600 dpi incl. bleed.
 *   proof.png             every card trimmed, for review on screen.
 *
 * Usage: npm run cards        (CHROME=/path/to/chrome to override the browser)
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEME } from '../../src/config/site.ts';
import { qrMatrix, qrPath } from '../../src/core/qr.ts';
import { esc } from '../../src/ui/markup.ts';
import { parseCards } from './cards-data.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIR = join(ROOT, 'brand/cards');
const OUT = join(DIR, 'out');

// ── Print geometry (inches). North-American card; Canada uses the same 3.5 × 2 in. ──────────────────
const TRIM_W = 3.5;
const TRIM_H = 2;
const BLEED = 0.125; // background runs this far past the cut
const SAFE = 0.1875; // content inset from the cut; checked below against MIN_SAFE
const MIN_SAFE = 0.125; // printers' cutting tolerance is about ±1/16 in — nothing important closer than 1/8
const SLUG = 0.25; // crop-mark margin in the -marks.pdf
const PAGE_W = TRIM_W + BLEED * 2;
const PAGE_H = TRIM_H + BLEED * 2;
const PX = 96; // CSS px per inch
const QR_SIZE = 1.04; // tile incl. 4-module quiet zone; ≈0.34 mm modules at version 11–12
const TAGLINE = 'Seven divisions · One orbit';

// ── Colours: solid mixes, not opacity, so print RIPs never have to flatten transparency. ───────────────
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => `#${hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
const C = {
  bg: THEME.bg,
  ink: THEME.ink,
  gold: THEME.gold,
  body: mix(THEME.ink, THEME.bg, 0.8),
  soft: mix(THEME.ink, THEME.bg, 0.58),
  ringGold: mix(THEME.gold, THEME.bg, 0.3),
  ringInk: mix(THEME.ink, THEME.bg, 0.22),
};

// ── Assets ───────────────────────────────────────────────────────────────────────────────────────────
const svgData = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const read = (p) => readFile(join(ROOT, p), 'utf8');

/** Brand fonts from the same @fontsource packages the site uses, inlined (latin + latin-ext only). */
async function fontFaces() {
  let css = '';
  for (const pkg of ['@fontsource-variable/bodoni-moda', '@fontsource-variable/instrument-sans']) {
    const dir = join(ROOT, 'node_modules', pkg);
    const src = await readFile(join(dir, 'standard.css'), 'utf8');
    for (const block of src.split('/* ').slice(1)) {
      if (!/^[\w-]+-latin(-ext)?-standard-normal \*\//.test(block)) continue;
      const face = block.slice(block.indexOf('@font-face'));
      const file = face.match(/url\(\.\/files\/([\w.-]+\.woff2)\)/)?.[1];
      if (!file) throw new Error(`No woff2 in ${pkg}`);
      const b64 = (await readFile(join(dir, 'files', file))).toString('base64');
      css += face.replace(/url\([^)]+\)/, `url(data:font/woff2;base64,${b64})`);
    }
  }
  if (!css.includes('Bodoni Moda') || !css.includes('Instrument Sans')) throw new Error('Brand fonts not found — run npm ci');
  return css;
}

const ICONS = {
  mail: '<rect x="1" y="2.5" width="10" height="7" rx="1"/><path d="M1.6 3.3 6 6.6l4.4-3.3"/>',
  phone: '<rect x="3.2" y="1" width="5.6" height="10" rx="1.2"/><path d="M5.2 9.1h1.6"/>',
  pin: '<path d="M6 11.2S2.4 7.6 2.4 4.9a3.6 3.6 0 0 1 7.2 0c0 2.7-3.6 6.3-3.6 6.3z"/><circle cx="6" cy="4.9" r="1.3"/>',
};
const icon = (name) => `<svg class="ic" viewBox="0 0 12 12" aria-hidden="true">${ICONS[name]}</svg>`;

/**
 * The seven rings of rings.json seen from above — the logo's orbit, face-on — as a faint arc in the
 * top-right corner of the back. Units: 1/100 in, trim coordinates. Ring i keeps the logo's tone order.
 */
function orbitArcs(rings) {
  const cx = TRIM_W * 100 + 14;
  const cy = -34;
  const r0 = 96;
  const circles = Array.from({ length: rings.count }, (_, i) => {
    const r = (r0 * (rings.innerRadius + i * rings.spacing)) / rings.innerRadius;
    const tone = i % 2 === 0 ? C.ringGold : C.ringInk;
    return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" stroke="${tone}"/>`;
  }).join('');
  return `<svg class="orbit" viewBox="0 0 ${TRIM_W * 100} ${TRIM_H * 100}" aria-hidden="true"><g fill="none" stroke-width="0.6">${circles}</g></svg>`;
}

function qrTile(vcard) {
  const m = qrMatrix(vcard, 'M');
  const n = m.size + 8;
  const svg = `<svg class="qr" data-safe viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code: contact card">`
    + `<rect width="${n}" height="${n}" rx="1.4" fill="${C.ink}"/><path fill="${C.bg}" d="${qrPath(m, 4)}"/></svg>`;
  return { svg, version: m.version, moduleMm: ((QR_SIZE / n) * 25.4).toFixed(3) };
}

// ── Markup ───────────────────────────────────────────────────────────────────────────────────────────
function front(a) {
  return `<div class="page front"><div class="trim">
    <img class="logo" data-safe src="${a.logo}" alt="VSM">
    <p class="tagline" data-safe>${esc(TAGLINE)}</p>
    ${a.website ? `<p class="url" data-safe>${esc(a.website)}</p>` : ''}
  </div></div>`;
}

function back(card, a, qr) {
  const c = card.contact;
  return `<div class="page back"><div class="trim">
    ${a.orbit}
    <div class="col">
      <img class="word" data-safe src="${a.word}" alt="VSM">
      <div class="who">
        <p class="name" data-safe>${esc(`${c.givenName} ${c.familyName}`)}</p>
        <p class="title" data-safe>${esc(c.title)}</p>
        <hr class="rule">
        <ul class="lines">
          <li data-safe>${icon('mail')}<span>${esc(c.email)}</span></li>
          <li data-safe>${icon('phone')}<span>${esc(c.phone.display)}</span></li>
          <li data-safe>${icon('pin')}<span>${esc(card.address[0])}<br>${esc(card.address[1])}</span></li>
        </ul>
      </div>
    </div>
    <div class="qrbox">${qr.svg}<p class="qrcap" data-safe>Scan to save contact</p></div>
  </div></div>`;
}

function cropMarks(label) {
  const W = PAGE_W + SLUG * 2;
  const H = PAGE_H + SLUG * 2;
  const x = [SLUG + BLEED, SLUG + BLEED + TRIM_W];
  const y = [SLUG + BLEED, SLUG + BLEED + TRIM_H];
  const gap = 0.03; // marks stop short of the bleed so they never print on the card
  const lines = [
    ...x.flatMap((v) => [[v, gap, v, SLUG - gap], [v, H - SLUG + gap, v, H - gap]]),
    ...y.flatMap((v) => [[gap, v, SLUG - gap, v], [W - SLUG + gap, v, W - gap, v]]),
  ].map(([x1, y1, x2, y2]) => `<line x1="${x1}in" y1="${y1}in" x2="${x2}in" y2="${y2}in"/>`).join('');
  return `<svg class="marks" aria-hidden="true"><g stroke="#000" stroke-width="0.25pt">${lines}</g></svg><p class="slug">${esc(label)}</p>`;
}

function css(fonts, sheetW, sheetH, offset) {
  return `${fonts}
  @page { size: ${sheetW}in ${sheetH}in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { background: #fff; font-family: 'Instrument Sans Variable', sans-serif; }
  .sheet { position: relative; width: ${sheetW}in; height: ${sheetH}in; overflow: hidden; break-after: page; }
  .page { position: absolute; left: ${offset}in; top: ${offset}in; width: ${PAGE_W}in; height: ${PAGE_H}in; background: ${C.bg}; overflow: hidden; }
  .trim { position: absolute; left: ${BLEED}in; top: ${BLEED}in; width: ${TRIM_W}in; height: ${TRIM_H}in; padding: ${SAFE}in; }

  .front .trim { display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .logo { display: block; width: 2.35in; margin-top: -0.04in; }
  .tagline, .url, .title, .qrcap { font-weight: 600; text-transform: uppercase; white-space: nowrap; }
  .tagline { margin-top: 0.17in; font-size: 5.8pt; letter-spacing: 0.34em; margin-right: -0.34em; color: ${C.soft}; }
  .url { margin-top: 0.07in; font-size: 6pt; letter-spacing: 0.2em; margin-right: -0.2em; color: ${C.gold}; }

  .back .trim { display: flex; justify-content: space-between; }
  .orbit { position: absolute; inset: 0; width: ${TRIM_W}in; height: ${TRIM_H}in; }
  .col { position: relative; display: flex; flex-direction: column; justify-content: space-between; }
  .word { display: block; height: 0.15in; width: auto; align-self: flex-start; }
  .name { font: 500 14pt/1.05 'Bodoni Moda Variable', serif; color: ${C.ink}; white-space: nowrap; }
  .title { margin-top: 0.05in; font-size: 6.2pt; letter-spacing: 0.24em; color: ${C.gold}; }
  .rule { width: 0.36in; border: 0; border-top: 0.5pt solid ${C.gold}; margin: 0.1in 0 0.085in; }
  .lines { list-style: none; font-size: 6.6pt; line-height: 1.5; font-weight: 450; color: ${C.body}; }
  .lines li { display: flex; align-items: flex-start; gap: 0.06in; white-space: nowrap; width: max-content; }
  .lines li + li { margin-top: 0.03in; }
  .ic { flex: none; width: 7pt; height: 7pt; margin-top: 1.3pt; fill: none; stroke: ${C.gold}; stroke-width: 0.9; stroke-linejoin: round; }
  .qrbox { position: relative; align-self: flex-end; display: flex; flex-direction: column; align-items: center; gap: 0.065in; }
  .qr { display: block; width: ${QR_SIZE}in; height: ${QR_SIZE}in; }
  .qrcap { font-size: 5.4pt; letter-spacing: 0.13em; margin-right: -0.13em; color: ${C.soft}; }

  .marks { position: absolute; inset: 0; width: 100%; height: 100%; }
  .slug { position: absolute; left: ${SLUG + BLEED + 0.15}in; top: 0.09in; font-size: 5pt; color: #555; letter-spacing: 0.04em; }`;
}

function doc(title, style, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${style}</style></head><body>${body}</body></html>`;
}

// ── Print post-processing ────────────────────────────────────────────────────────────────────────────
/** Chrome embeds variable fonts as Type 3; some print RIPs reject those. Ghostscript turns all text into paths. */
function outlineFonts(pdf) {
  try {
    execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pdfwrite', '-dNoOutputFonts',
      '-dColorConversionStrategy=/LeaveColorUnchanged', '-dCompatibilityLevel=1.6', `-sOutputFile=${pdf}.tmp`, pdf]);
  } catch (err) {
    if (err.code === 'ENOENT') return false; // no Ghostscript: keep the embedded-font PDF
    throw err;
  }
  execFileSync('mv', [`${pdf}.tmp`, pdf]);
  return true;
}

/** Adds a pHYs chunk so print tools read the PNG as 600 dpi (Chrome writes none, which reads as 72 dpi). */
function withDpi(png, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0);
  data.writeUInt32BE(ppm, 4);
  data[8] = 1; // unit: metre
  const typeAndData = Buffer.concat([Buffer.from('pHYs'), data]);
  const chunk = Buffer.alloc(4 + typeAndData.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), 4 + typeAndData.length);
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // signature + IHDR(length, type, 13 bytes, crc)
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

// ── Chrome over the DevTools protocol (no extra dependency: Node's built-in WebSocket) ─────────────────
function findChrome() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error('Google Chrome not found. Install it, or set CHROME=/path/to/chrome');
  return hit;
}

async function launchChrome() {
  const profile = await mkdtemp(join(tmpdir(), 'vsm-cards-'));
  const proc = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start within 60 s')), 60_000);
    proc.stderr.on('data', (d) => {
      log += d;
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code})\n${log}`)); });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p?.resolve(msg.result);
      return;
    }
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].method === msg.method) waiters.splice(i, 1)[0].resolve(msg.params);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (method, params) => send(method, params, sessionId);
  const nextEvent = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
  await cmd('Page.enable');

  async function evaluate(expression) {
    const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`In page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  return {
    evaluate,
    async open(file) {
      const loaded = nextEvent('Page.loadEventFired');
      await cmd('Page.navigate', { url: pathToFileURL(file).href });
      await loaded;
      const ok = await evaluate(`(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((i) => i.decode()));
        return document.fonts.check('14pt "Bodoni Moda Variable"') && document.fonts.check('7pt "Instrument Sans Variable"');
      })()`);
      if (!ok) throw new Error(`${file}: brand fonts did not load`);
    },
    async pdf() {
      const r = await cmd('Page.printToPDF', {
        printBackground: true, preferCSSPageSize: true, scale: 1,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      });
      return Buffer.from(r.data, 'base64');
    },
    /** PNG of one element at the given dots-per-inch. */
    async shot(selector, dpi) {
      const box = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
      // Viewport = just the document, so a 600 dpi capture doesn't allocate a huge empty surface.
      const [width, height] = await evaluate('[document.documentElement.scrollWidth, document.documentElement.scrollHeight]');
      await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpi / PX, mobile: false });
      const r = await cmd('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: true });
      return Buffer.from(r.data, 'base64');
    },
    async close() {
      // Wait for Chrome to really exit: it keeps writing to the profile for a moment after Browser.close.
      const exited = proc.exitCode !== null ? Promise.resolve() : new Promise((resolve) => proc.once('exit', resolve));
      try { await send('Browser.close'); } catch { proc.kill(); }
      ws.close();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (proc.exitCode === null) proc.kill('SIGKILL');
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

// ── Self-checks run inside the rendered page ─────────────────────────────────────────────────────────
/** Every [data-safe] element must sit inside the safe area of its card, and none may overlap another. */
const LAYOUT_CHECK = `(() => {
  const problems = [];
  const PX = ${PX}, MIN = ${MIN_SAFE} * PX;
  for (const [pi, trim] of [...document.querySelectorAll('.trim')].entries()) {
    const t = trim.getBoundingClientRect();
    const items = [...trim.querySelectorAll('[data-safe]')].map((el) => ({ el, r: el.getBoundingClientRect() }));
    const name = (el) => el.className.baseVal ?? el.className;
    for (const { el, r } of items) {
      const gaps = [r.left - t.left, r.top - t.top, t.right - r.right, t.bottom - r.bottom];
      if (Math.min(...gaps) < MIN - 0.01) problems.push('card ' + pi + ': .' + name(el) + ' is ' + (Math.min(...gaps) / PX).toFixed(3) + ' in from the cut (min ${MIN_SAFE})');
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i].r, b = items[j].r;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) problems.push('card ' + pi + ': .' + name(items[i].el) + ' overlaps .' + name(items[j].el));
    }
  }
  return problems;
})()`;

/** Decodes a PNG (data URL) with jsQR inside the page — the same pixels a phone camera would see. */
const decodeExpr = (png) => `(async () => {
  const img = new Image(); img.src = 'data:image/png;base64,${png.toString('base64')}'; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const found = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
  return found ? found.data : null;
})()`;

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const dataFile = join(DIR, 'people.json');
  if (!existsSync(dataFile)) {
    throw new Error('brand/cards/people.json not found. Copy brand/cards/people.example.json to people.json and fill it in.');
  }
  const cards = parseCards(JSON.parse(await readFile(dataFile, 'utf8')));
  const rings = JSON.parse(await read('src/config/rings.json'));
  const fonts = await fontFaces();
  const assets = {
    logo: svgData(await read('src/brand/logo-color.svg')),
    word: svgData((await read('src/brand/logo-word.svg')).replace(/currentColor/g, THEME.gold)),
    orbit: orbitArcs(rings),
  };
  const jsqr = await read('node_modules/jsqr/dist/jsQR.js');
  await mkdir(OUT, { recursive: true });
  // The HTML holds personal data and is only an intermediate: keep it out of the repo tree, delete it after.
  const work = await mkdtemp(join(tmpdir(), 'vsm-cards-html-'));
  let outlined = true;

  const chrome = await launchChrome();
  try {
    const proofRows = [];
    for (const card of cards) {
      const name = `${card.contact.givenName} ${card.contact.familyName}`;
      const a = { ...assets, website: card.website };
      const qr = qrTile(card.vcard);

      // 1. Bleed PDF (front, back) + layout check
      const bleedHtml = join(work, `${card.slug}.html`);
      await writeFile(bleedHtml, doc(`${name} — business card`, css(fonts, PAGE_W, PAGE_H, 0),
        `<div class="sheet">${front(a)}</div><div class="sheet">${back(card, a, qr)}</div>`));
      await chrome.open(bleedHtml);
      const problems = await chrome.evaluate(LAYOUT_CHECK);
      if (problems.length) throw new Error(`Layout check failed for ${name}:\n  ${problems.join('\n  ')}`);
      await writeFile(join(OUT, `${card.slug}.pdf`), await chrome.pdf());
      outlined = outlineFonts(join(OUT, `${card.slug}.pdf`)) && outlined;

      // 2. 600 dpi PNGs
      await writeFile(join(OUT, `${card.slug}-front.png`), withDpi(await chrome.shot('.sheet:nth-child(1) .page', 600), 600));
      await writeFile(join(OUT, `${card.slug}-back.png`), withDpi(await chrome.shot('.sheet:nth-child(2) .page', 600), 600));

      // 3. Scan test: render the back at a modest 200 dpi and read the QR back from the pixels.
      await chrome.evaluate(jsqr);
      const scanned = await chrome.evaluate(decodeExpr(await chrome.shot('.sheet:nth-child(2) .page', 200)));
      if (scanned !== card.vcard) throw new Error(`QR scan test failed for ${name}: read ${JSON.stringify(scanned)}`);

      // 4. Crop-marks PDF
      const marksHtml = join(work, `${card.slug}-marks.html`);
      const label = (side) => `VSM · ${name} · ${side} · trim ${TRIM_W} × ${TRIM_H} in · bleed ${BLEED} in`;
      await writeFile(marksHtml, doc(`${name} — business card (crop marks)`, css(fonts, PAGE_W + SLUG * 2, PAGE_H + SLUG * 2, SLUG),
        `<div class="sheet">${front(a)}${cropMarks(label('front'))}</div><div class="sheet">${back(card, a, qr)}${cropMarks(label('back'))}</div>`));
      await chrome.open(marksHtml);
      await writeFile(join(OUT, `${card.slug}-marks.pdf`), await chrome.pdf());
      outlined = outlineFonts(join(OUT, `${card.slug}-marks.pdf`)) && outlined;

      proofRows.push({ name, a, card, qr });
      console.log(`✓ ${name}: QR version ${qr.version} (${qr.moduleMm} mm modules), scan test passed → out/${card.slug}.pdf`);
    }

    // 5. Proof sheet: every card trimmed, as it will look in the hand.
    const proofCss = `${css(fonts, PAGE_W, PAGE_H, 0)}
      body { background: #E9E6E0; padding: 0.35in; width: max-content; }
      .row { display: flex; gap: 0.3in; align-items: flex-end; margin-bottom: 0.3in; }
      .cut { position: relative; width: ${TRIM_W}in; height: ${TRIM_H}in; overflow: hidden; box-shadow: 0 0.06in 0.2in rgb(0 0 0 / 0.28); }
      .cut .page { left: -${BLEED}in; top: -${BLEED}in; }
      .label { font-size: 8pt; color: #6B655C; letter-spacing: 0.08em; margin: 0 0 0.08in; }`;
    const proofBody = proofRows.map(({ name, a, card, qr }) => `<p class="label">${esc(name.toUpperCase())} — FRONT · BACK</p>
      <div class="row"><div class="cut">${front(a)}</div><div class="cut">${back(card, a, qr)}</div></div>`).join('');
    const proofHtml = join(work, 'proof.html');
    await writeFile(proofHtml, doc('VSM business cards — proof', proofCss, `<main class="proof">${proofBody}</main>`));
    await chrome.open(proofHtml);
    await writeFile(join(OUT, 'proof.png'), await chrome.shot('body', 220));
    console.log(`✓ proof → out/proof.png (${cards.length} people)`);
    console.log(outlined
      ? '✓ PDFs: text converted to outlines (Ghostscript)'
      : '! Ghostscript not found: PDFs keep embedded fonts. Most printers accept them; install gs to outline text.');
  } finally {
    await chrome.close();
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
