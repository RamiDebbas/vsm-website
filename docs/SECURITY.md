# Security

## Threat model (current)

A static marketing site with **no backend, no database, no accounts, no form submissions and no
third-party scripts**. The realistic risks are:

| Risk | Mitigation |
| --- | --- |
| Injected script (XSS) via content or a compromised dependency | CSP `script-src 'self'`, no inline scripts, all build-time interpolation escaped (`esc()`), no SVG is inlined into pages (brand files ship as images/3D input; tests check they contain no script, styles, foreign content or external references) |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` (Azure headers; not possible on GitHub Pages) |
| Supply chain | exact version pins, `npm ci`, `npm audit` in CI, GitHub Actions pinned to commit SHAs, Dependabot |
| Domain takeover on GitHub Pages | verify the custom domain before pointing DNS (see DEPLOYMENT.md) |
| Personal data exposure | none collected; enquiries go through the visitor's own mail client (`mailto:`) |
| Hostile deep links (`#<script>`) | hashes accepted only if they match `^[a-z0-9-]{1,40}$`; never reflected into HTML |

## Content Security Policy

Defined once in `src/config/security.ts`:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; media-src 'self'; manifest-src 'self';
worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
```

- Injected as `<meta>` at **build time only**, because the dev server needs inline HMR scripts.
- The Azure header version adds `frame-ancestors 'none'` and `upgrade-insecure-requests`.
- `404.html` uses its own CSP with a sha256 hash for its inline stylesheet (no `'unsafe-inline'`). The same hash
  is added to the Azure header CSP, because hosts that send the CSP header on every response apply it to 404.html too.
- `scripts/verify-dist.mjs` fails the build if the CSP disappears, gets weaker, or if any inline
  script, `style=""` attribute or third-party resource shows up in `dist/index.html`.

Runtime styling uses the CSSOM (`el.style.setProperty`), which CSP allows. Never use
`setAttribute('style', …)`, `innerHTML` with data, or inline `<style>`.

## Adding a third party later

1. Prefer self-hosting (fonts are already self-hosted via Fontsource).
2. Otherwise add the exact origin to the **narrowest** directive in `CSP_DIRECTIVES`, never to `default-src`.
3. Update `tests/security.test.ts` expectations deliberately.

## Secrets

There are none, and the site needs none. Future deployment tokens, such as Azure's, belong in
GitHub repository **secrets**, never in files. `.env*` files are git-ignored.

## Reporting

Please email security issues to the contact address in `src/config/site.ts`.
