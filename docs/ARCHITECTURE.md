# Architecture

## Principles

1. **One source of truth.** Every fact lives in `src/config/site.ts`; HTML, JSON-LD, mailto links,
   vCard and the 3D scene are all derived from it.
2. **HTML first, behaviour second.** Content is rendered to static HTML at build time. JavaScript only
   attaches behaviour. The site is complete with no JS and with no WebGL.
3. **Modules talk through the store, never to each other.** UI and scene are independent; both read
   and write `src/core/store.ts`.
4. **Portable output.** Relative asset URLs + hash deep links → the same `dist/` runs on GitHub Pages
   (root or sub-path), a custom domain, Azure Static Web Apps, or any static host.
5. **Locked down by default.** No backend, no third-party origins, CSP `'self'` only, inspected on
   every build.

## Map

```
index.html                 slots: <!--@csp--> <!--@head--> <!--@body-->
vite.config.ts             build pipeline: fills slots, emits Azure config, 404, robots/sitemap
build/
  notFoundPage.ts          self-contained 404 with hash-pinned CSP (Node, build time)
scripts/
  verify-dist.mjs          post-build inspector (CSP, URLs, required files, budgets, placeholders)
  brand-assets.mjs         favicon / og-image / manifest icons from src/brand/*.svg
src/
  config/
    site.ts                ★ content model: company, divisions, contact, placeholders
    security.ts            ★ CSP + security headers (meta for Pages, headers for Azure)
    rings.json             ★ the ring system — shared by the logo generator AND the 3D scene (logo rings = site rings)
  core/                    framework-free logic, fully unit-tested
    store.ts               tiny observable store
    state.ts               AppState: active / preview / section / scroll / reducedMotion
    deeplink.ts            #hash ↔ division
    contact.ts             mailto / tel / vCard builders (company 4.0 for the site, person 3.0 for QR codes)
    qr.ts                  QR encoder wrapper → module grid + one vector path (UTF-8)
    env.ts                 capability detection (WebGL2, reduced motion, data-saver)
    tour.ts                idle-tour policy (product decision — see file)
  ui/
    markup.ts              ★ build-time HTML (pure string functions, escaped)
    theme.ts               store → DOM (accent colour, readout, radios, URL hash, announcer)
    dial.ts                division controls (radiogroup keyboard pattern, previews)
    contactActions.ts      copy, vCard download, composer
    scrollspy.ts           current section, masthead state, reveal-on-scroll
    tourDriver.ts          runs the tour policy on a timer
  scene/                   three.js — lazy-loaded chunk
    Orrery.ts              the Ringed logo in 3D: word + 7 rings (rings.json) + division planets, picking, adaptive quality
    logoMesh.ts            brand SVG → extruded gold mesh
    poses.ts               camera pose per section + frame-rate-independent damping
    textures.ts            generated radial sprite texture
  styles/
    tokens.css             ★ design tokens (colour, type, space, motion)
    base.css / sections.css / scene.css
  brand/                   ★ the Ringed logo (generated — never hand-edit): logo-color.svg (header), logo-word.svg
                           (extruded 3D core), logo.svg (one colour), logo-hero.svg, mark*.svg (V-planet icon)
  main.ts                  boot sequence
tests/                     Vitest: content model, core logic, markup a11y/CSP, security policy
brand/
  generator/geometry.mjs   shared parametric skeleton (V / stadium S / M), polygon booleans, SVG writers, renderers
  generator/ops.mjs        offset / union / difference helpers
  generator/ringed.mjs     ★ the chosen logo (reads src/config/rings.json + division colours from site.ts)
  generator/cards.mjs      business cards → PDF/PNG via headless Chrome; layout + QR scan self-checks
  generator/cards-data.ts  validates brand/cards/people.json (git-ignored: personal numbers)
  cards/                   print guide, people.example.json, out/ (git-ignored)
  generator/vsm-logo.mjs, creative.mjs   earlier concept rounds (kept for history)
  concepts/                (local only, git-ignored) every concept + contact sheets; regenerate with npm run logo*
  references/              (local only, git-ignored) third-party reference images — never published
  README.md                brand guide: files, colours, minimum sizes, rules
```

## Data flow

```
          site.ts ─────────────┐
             │ (build)         │ (runtime)
             ▼                 ▼
   markup.ts → index.html   theme.ts / dial.ts / contactActions.ts
                               │  ▲
                   store.set() │  │ store.subscribe()
                               ▼  │
                         ┌──── store ────┐
                         │ active        │◄── Orrery (planet click / hover)
                         │ preview       │◄── dial, index rows, statement words
                         │ section       │◄── scrollspy
                         │ reducedMotion │◄── matchMedia
                         └───────────────┘
                                 │
                                 ▼
                    Orrery: camera pose, accent, planet focus
```

`active` is the committed choice (click / keyboard / deep link). `preview` is transient (hover /
focus). The page wears `preview ?? active`.

## Runtime boot (src/main.ts)

1. CSS + self-hosted fonts load with the entry chunk (≈5 KB gzip JS).
2. `no-js` → `js` on `<html>`; OS motion preference into the store.
3. UI modules bind to existing DOM; deep link applied.
4. On browser idle, if WebGL2 is available and data-saver is off, the `Orrery` chunk (three.js,
   ≈160 KB gzip) is imported. Failure at any point leaves the static emblem fallback in place.

## Performance & resilience

- Pixel ratio capped (1.75 desktop / 1.5 touch); star and dust counts halved on touch devices.
- First ~2 s of frames are measured; if slower than 40 fps, resolution and dust are dropped.
- Render loop pauses when the tab is hidden; reduced-motion renders on demand only.
- WebGL context loss → fallback emblem.

## Phones & tablets

- **Adaptive hero camera.** `main.ts → heroFrame()` measures the free box the layout leaves for the logo: above the
  headline in portrait, beside it in short landscape. `Orrery.ts` then picks the camera distance that fits the whole
  ring system inside it and centres it there. The complete logo shows at any width (verified at 320 / 375 / 812×375 / 768).
- **Text first.** Outside the hero, text spans the full width on phones, so the scene recedes to a faint backdrop
  (`html[data-section]`, scene.css) and renders at about 20 fps to save battery.
- Lighter metal material on touch devices (no clearcoat), DPR capped at 1.5, fewer particles.
- The headline is sized by width **and** height (`min(vw, svh)`). Notch and home-indicator safe areas are padded.
  Touch targets are at least 44 px. There is no horizontal overflow at any size (probed).

## Accessibility

- Real DOM controls for everything the canvas does; canvas is `aria-hidden`.
- Dial is a WAI-ARIA radiogroup (roving tabindex, arrows / Home / End).
- Selection announced via a polite live region (hover never announces).
- All text ≥ 12 px; accents tested for WCAG AA contrast (`tests/site.test.ts`).
- `prefers-reduced-motion` honoured in CSS and in the 3D scene.

## Extension points ("side bridges")

| Future need | Where it plugs in |
| --- | --- |
| Division descriptions | `Division.summary` — rendered automatically when set |
| Division sub-pages / partner links | `Division.links`; add pages as extra Vite inputs |
| New division | add id to `DIVISION_IDS` + entry in `SITE.divisions` (tests enforce consistency) |
| Locations / offices | extend `SiteContent` + a section in `markup.ts` + JSON-LD `address` (`PostalAddress` in `contact.ts` is ready) |
| Team pages, partner cards, staff onboarding | `PersonContact` + `buildPersonVCard` + `qr.ts`: the same contact model as the business cards |
| Contact form with a backend | Azure Static Web Apps managed Functions (`/api`); add origin to `connect-src` and change `form-action` in `security.ts` |
| Analytics | prefer a self-hosted / cookieless tool; add its origin to the narrowest CSP directive |
| i18n | `SITE` per locale + `<html lang>`; markup functions are already pure |
| CMS | replace the `SITE` constant with a build-time fetch; types stay the contract |
