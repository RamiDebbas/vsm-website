# Progress log

A running record of what was built, decided and verified, so anyone can see where things stand.
Newest first.

## 2026-10-20 — v1.6 going live: GitHub Pages + vsmgrp.com

### Owner decisions
- Host on **GitHub Pages** in a **public** repository (`RamiDebbas/vsm-website`) on the company domain **vsmgrp.com**.
- Site contact: **info@vsmgrp.com**, with **no phone** on the public site. `contact.phone` became optional and a
  business line can be added later in one line.

### Pre-publish audit (workflow: 3 lenses + adversarial verifiers + completeness critic, read-only)
13 confirmed, 6 rejected. Fixed before the first commit:

| Finding | Fix |
| --- | --- |
| First deploy would fail: `configure-pages` needs `pages: read`, the build job had only `contents: read` | Job-level permissions on `build` |
| First push rejected: gh token lacks the `workflow` scope | `gh auth refresh -s workflow` (owner, one time) |
| Pages must be enabled before the first push, or the first run fails | Order documented and followed |
| Personal Gmail would be the public commit author | Repo-local noreply identity |
| Other brands' logos (design references) would be republished | `brand/references/` git-ignored; brand names removed from docs and comments |
| 1,526 logo-iteration renders (43.6 MB) in the first commit | `brand/concepts/` git-ignored (regenerable); first commit is 96 files, ≈1 MB |
| Co-founder names, office address and unit in docs/comments | Replaced with generic examples; real data only in the git-ignored card file |
| A new test hard-coded the co-founders' mobile numbers | Test now reads the git-ignored card data and is skipped in CI |
| Docs targeted the unregistered vsmgroupinc.com and suggested Cloudflare mail (would break Microsoft 365) | DEPLOYMENT.md rewritten: GoDaddy record-by-record plan, M365 records marked "do not touch" |

### Open (owner)
- [ ] Create `info@vsmgrp.com` in Microsoft 365 and test it, then remove the placeholder.
- [ ] Verify vsmgrp.com on GitHub and change the GoDaddy DNS records (docs/DEPLOYMENT.md §2).

## 2026-10-20 — v1.5 business cards

### Owner direction
- Front and back cards for the two co-founders, ready to print, with the logos, a QR code that saves the contact
  to a phone, and the office address. (Names, numbers and address live only in the git-ignored brand/cards/people.json.)

### Built
- `npm run cards` → `brand/cards/out/`: a 2-page PDF with bleed (online printers), a PDF with crop marks (local
  shops), 600 dpi PNGs (tagged 600 dpi) and a proof sheet. Text is outlined with Ghostscript, so printers get no
  font issues.
- Front: the Ringed logo plus "Seven divisions · One orbit". Back: the VSM word, name, title, email, mobile,
  office, the face-on ring system as a faint corner arc, and a contact QR (vCard 3.0, level M, about 0.38 mm modules).
- New foundation: `PersonContact` / `PostalAddress` / `buildPersonVCard` in `src/core/contact.ts`, and
  `src/core/qr.ts` (UTF-8 fix for the encoder). Ready for team pages, partner cards or a site QR later.
- Self-checks on every run: data validation (the printed number must equal the dialled number), safe-area and
  overlap layout check, and a QR scan test from the rendered pixels.

### Security / privacy
- `brand/cards/people.json` (personal mobile numbers) and `out/` are git-ignored. `people.example.json` is the
  template. The HTML intermediates live in a temp folder and are deleted after each run.
- Dependencies: `qrcode-generator@2.0.4` (no dependencies) and `jsqr@1.4.0` (test/scan only), dev-only and
  pinned. `npm audit fix` resolved a dev-only advisory (source-map-js) and `npm audit` is clean.

### Found
- `vsmgrp.com` is registered (GoDaddy, 2026-09-29). Its mail runs on Microsoft 365, and the web address is a
  parked page. The cards use it for email only, with no URL until the site is live.
- The office postal code was inferred from a typo in the request. Confirm it with Canada Post before ordering.

## 2026-09-30 — v1.4 no header logo, neutral palette, phone-friendly

### Owner direction
- Remove the logo from the top-left header → done (the hero is the logo; header = navigation + pause).
- Planet and division colours "more even, neutral, clean and minimal" → soft tints at even lightness:
  blush, sand, lilac, sage, mist, seafoam, stone. Rule enforced by tests (L* 78–86, C* ≤ 20, ΔE ≥ 25 vs gold,
  pairwise ΔE ≥ 10). Logo regenerated with the new planets.
- Make sure the site is phone friendly → audited with real-time headless Chrome at 320, 375, 812×375 and 768.

### Found & fixed
- Phones: the bright 3D logo sat behind full-width text in The Group / Divisions / Contact → faint backdrop outside
  the hero + 20 fps throttle.
- Phones: the ring system was wider than the portrait viewport (cropped) and collided with the headline on short
  screens → adaptive hero camera (fit-to-free-box, centred). Short landscape → headline left, logo right.
- Landscape: the headline was sized by width only (taller than the screen) → `min(vw, svh)`.
- Notch/home-indicator safe areas; index division links raised to 44 px targets; lighter material on touch devices.
- Removed the now-unused inline-SVG path (`inlineMark`, `logoSvg` option, config watcher) — no dead code left.

### Tooling note
- Headless Chrome's "mobile" emulation flag stops continuous frames (transitions freeze at t=0) and the first load
  in a fresh profile compiles shaders slowly on the software GPU; audits use desktop-mode emulation at phone sizes
  with a warm profile. Not a site issue.

## 2026-09-30 — v1.3 the owner's logo: "Ringed" VSM planet, and the site becomes the logo

### Owner direction
- Asked for a more creative, unique logo → round 3 produced 5 idea-led concepts (laser, ringed, gravity, ribbon,
  monogram); a 3-lens judge panel + verifier iterated the ribbon into "Twist" (scored 71).
- The owner chose **Ringed** instead: rings **white and gold**, **coloured planets** on them, and the website's
  rings must be **the same rings, interactive**. (Twist install was stopped mid-way at the owner's request.)

### Built
- `src/config/rings.json` — single source of truth for the ring system, read by the logo generator and the 3D scene.
- `brand/generator/ringed.mjs` — final logo: correct over/under depth with clearance gaps, back-ring stubs removed,
  planet placement rule (none hidden, none cutting a letter); colour / one-colour / lit / word / icon files.
- 3D scene rebuilt as the logo: extruded word + 7 thin tori with the logo's fanned tilts and roll + planets that ride
  their rings (hover/click = select division). Camera choreography retuned (straight-on hero = the logo).
- Division palette set by rule (OKLCH L 0.62): readable on dark, distinct from gold, distinct from each other —
  enforced by tests. Content model simplified: ring geometry left site.ts (only orbit speed remains).
- Generator refactor: geometry.mjs (+ ops.mjs) shared by all concept scripts; refactor verified byte-identical.

### Verified
- `npm run check` green (69 tests). Real-time headless-Chrome captures (DevTools protocol) of hero, The Group and a
  selected division; layout fix for The Group (scene no longer behind the statement text).

## 2026-09-30 — v1.2 independent review: 24 findings fixed

Lean review workflow (3 lenses: accessibility/UX, security/deployment, correctness/performance; each finding
re-checked by an adversarial verifier). 24 confirmed (5 medium, 19 low), 1 rejected, **0 critical/high**. All fixed:

| Area | Fix |
| --- | --- |
| WCAG 2.2.2 (Level A) | On-page **Pause motion** toggle (aria-pressed, remembered per browser) stops the orrery + CSS loops |
| Reduced motion | Negative frame delta caused a one-frame planet flash → dt clamped ≥ 0; still mode snaps (no damping) |
| Resilience | WebGL context loss now shows the static wordmark and recovers automatically on restore |
| Accessibility | Copy result announced (role=status) + selection fallback; 320 px reflow; visible dial focus on touch widths; no double announcements; aria-current on focusable index links; "Enquire about X" for screen readers; dial hidden without JS; index names are real links; Windows High Contrast styles |
| Behaviour | Section tracking uses the viewport midline; planet hover no longer clears other controls' previews or lingers after scroll / leaving the window; composer label restored after reload |
| Performance | No redraws for irrelevant state changes (every keydown/wheel used to redraw in still mode); O(1) lookups in the render loop; DPR re-evaluated on zoom/monitor change; canvas sized without the scrollbar; RoomEnvironment disposed |
| Security | SVG inliner now an **allowlist** (svg/g/path + presentation attributes); CSP drops unused `blob:`; Azure header CSP pins the 404 stylesheet hash (was blocked on Azure) |
| Docs | Azure deploy job corrected (artifact is a tarball; skip PRs); set `SITE_URL` before adding the custom domain |

Verified: 60 tests; build + dist inspection; production preview under the tightened CSP with zero console
messages; vCard download, in-place index selection, toggle state wiring checked live.

## 2026-09-30 — v1.1 new logo, "VSM" branding

### Owner direction
- Brand is **"VSM" only**: "Group Inc" removed from all branding (logo, header, titles, copy, email subjects).
  `VSM GROUP INC` kept only in legal contexts (copyright, vCard ORG, JSON-LD `name`). Enforced by tests.
- Logo direction from three owner-supplied reference images (line-built letters, a line field, a slanted-slice
  wordmark). They are other brands' artwork, so they stay on the owner's machine (`brand/references/`, git-ignored).

### Built
- Parametric logo generator `brand/generator/vsm-logo.mjs`: one VSM skeleton (V, stadium S, M) + treatments
  via polygon booleans; S bands emitted as exact SVG arcs. Four concepts generated with contact sheets.
- **Chosen: "Seven Lines"** — 7 lines per stroke = 7 divisions; lattices at the V apex and M vertex.
  Variants: gold gradient, 7-colour spectrum (line *i* = division *i*), 3-line small cut for favicons.
- Installed everywhere: inline header wordmark, extruded 3D core (extrusion re-tuned for 2-unit lines),
  favicons, app icons, 1200×630 share card, downloadable `public/brand/*`. Brand guide: `brand/README.md`.
- Logo SVG optimised 73 KB → 7.4 KB (exact arcs, dedupe + safe collinear removal).

### Found & fixed along the way
- Contact-sheet compositing split images (ImageMagick `-splice` honours gravity) → anchored to top edge.
- Vertex simplifier removed collinear *reversal* corners, filling counters → keep reversals, drop pass-throughs.
- Mobile hero showed two wordmarks during the fallback→3D crossfade → fallback now only for no-JS / no-WebGL.
- Brand guard test initially matched the email domain `vsmgroupinc.com` → word-boundary regex.

### Process note
- Parallel agent workflows (5 logo designers + 6 site reviewers) stalled on 2026-09-29: load average hit 356 with
  the MacPaw Moonlock antivirus engine at ~240 % CPU scanning every file agents wrote. Logo work was completed
  directly instead. Future multi-agent runs should use fewer concurrent agents, or exclude the project folder
  from real-time scanning.

### Verified
- `npm run check` green: 53 tests, build, dist inspection. Production build: zero console messages under CSP.
- Visual QA desktop 1440×900 + mobile 375×812: hero, deep link, divisions view, fallback path.

## 2026-09-29 — v1.0 foundation

### Source material
- Reference site `r675eus63kwwg.kimi.page` (a Kimi-generated React + three.js page) was used for
  **information only**: company name, the seven divisions, email, phone. The design and logo are new.
- Checks performed on that information:
  - `vsmgroupinc.com` → RDAP 404, no DNS / MX → domain unregistered, email cannot work yet.
  - `+1 (305) 555-0199` → inside the 555-0100…0199 range reserved for fictional use.
  - Both are tracked in `SITE.placeholders` and printed as warnings on every build.

### Built
- Static site: Vite 8 + TypeScript 7 + three.js r186, no UI framework.
- Content model with typed slots for future data (`summary`, `links`).
- Build-time HTML generation (SEO, no-JS, zero layout shift) + JSON-LD Organization.
- "Orrery" 3D hero: extruded brand mark, 7 orbits/planets, dust disc, starfield, per-section
  camera choreography, planet picking, adaptive quality, reduced-motion + no-WebGL fallbacks.
- Division system: dial (ARIA radiogroup), index, statement words, planet clicks, `#hash` deep links,
  per-division pre-addressed enquiry emails, contact composer, vCard download, copy-to-clipboard.
- Security: CSP `'self'` only (meta for Pages, full headers for Azure), hash-pinned 404,
  sanitised SVG inlining, SHA-pinned CI actions, Dependabot, `npm audit` in CI.
- Inspection: `scripts/verify-dist.mjs` gates every build (CSP, inline code, third parties,
  relative URLs, missing files, gzip budgets).
- Tests: 51 (content model, WCAG contrast, deep-link hardening, mailto/vCard RFCs, markup a11y/CSP,
  security policy, camera maths).
- Docs: README, ARCHITECTURE, DEPLOYMENT (Pages, custom domain, Azure), SECURITY.

### Verified
- `npm run check` green. Entry JS ≈ 5 KB gzip; 3D chunk ≈ 160 KB gzip (lazy).
- Visual QA at 1440×900 and 375×812: hero, selection flow, divisions, contact; no horizontal overflow.

### Decisions
- **No framework**: one page, with a store and pure functions, is smaller and easier to audit than React.
- **Relative `base`** + hash links: one build runs on any host or sub-path.
- **Fonts self-hosted** (Bodoni Moda, Instrument Sans, Geist Mono) → no Google Fonts, stricter CSP.
- **mailto instead of a form backend**: no personal data ever touches our infrastructure.

### Open
- [x] Logo: "Seven Lines" chosen and installed (2026-09-30)
- [x] Independent multi-lens review — 24 findings fixed (2026-09-30)
- [ ] Idle-tour policy in `src/core/tour.ts` (owner decision)
- [x] Domain: vsmgrp.com (owner's, Microsoft 365 mail); site shows info@vsmgrp.com, no phone (2026-10-20)
- [ ] GitHub repository + Pages enablement; custom domain DNS (see v1.6)
