import { createHash } from 'node:crypto';
import { CSP_DIRECTIVES } from '../src/config/security.ts';
import { esc } from '../src/ui/markup.ts';

/**
 * Generates dist/404.html at build time (Node only — imported by vite.config.ts).
 *
 * Why generated and self-contained: static hosts serve 404.html at *any* missing path
 * (e.g. /a/b/c), so relative asset URLs like ./assets/x.css would resolve to the wrong place.
 * The page therefore ships its styles inline and pins them in its own CSP with a sha256 hash
 * (no 'unsafe-inline'), and links home with an absolute URL when SITE_URL is known.
 */
const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0A0806;color:#F3EEE3}
body{display:grid;place-items:center;font:400 1rem/1.6 "Iowan Old Style","Bodoni 72",Didot,Georgia,serif;padding:24px;
background:radial-gradient(60vmax 60vmax at 50% 45%,rgba(216,184,106,.12),transparent 60%),#0A0806}
main{text-align:center;max-width:36rem}
.k{font:500 .75rem/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;text-transform:uppercase;color:#D8B86A}
h1{font-weight:400;font-size:clamp(2.6rem,9vw,5.5rem);line-height:1;margin:.5em 0 .3em;letter-spacing:-.02em}
em{color:#D8B86A}
p{color:#A79F8E;margin:0 0 2rem}
a{display:inline-block;color:#0A0806;background:#D8B86A;padding:.9rem 1.6rem;text-decoration:none;
font:500 .8rem/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;text-transform:uppercase}
a:focus-visible{outline:2px solid #F3EEE3;outline-offset:4px}
`.trim();

/** sha256 (base64) of the inline stylesheet — also pinned in the Azure header CSP (see security.ts headerCsp). */
export const NOT_FOUND_STYLE_HASH = createHash('sha256').update(STYLE).digest('base64');

export function notFoundHtml(siteUrl: string, company: string): string {
  const hash = NOT_FOUND_STYLE_HASH;
  const csp = Object.entries({ ...CSP_DIRECTIVES, 'style-src': [`'sha256-${hash}'`], 'script-src': ["'none'"] })
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
  const home = siteUrl ? `${siteUrl}/` : '/';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found — ${esc(company)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="k">404</p>
<h1>Lost in <em>orbit.</em></h1>
<p>This page does not exist.</p>
<a href="${esc(home)}">Return to ${esc(company)}</a>
</main>
</body>
</html>
`;
}
