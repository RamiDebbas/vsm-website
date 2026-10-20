# VSM brand

## The logo — "Ringed" (the VSM planet)

Owner's choice (2026-09-30). A bold **VSM** orbited by **seven rings**, one per division. The rings pass **behind**
the letters at the top and **in front** of them at the bottom, with clearance gaps, so the depth is real. Rings
alternate **gold and white**. Each ring carries its division's **planet** in the division colour.

**The website hero is this logo, live.** The interactive 3D scene in `src/scene/Orrery.ts` builds the same rings
from the same file (`src/config/rings.json`). Seen from the front it *is* the logo. The planets ride their rings,
and hovering or clicking a planet selects its division.

It is **"VSM" only**. "Group Inc" is never part of the logo. The legal name `VSM GROUP INC` appears only in legal
contexts: the copyright line, contracts, and the vCard organisation field.

## Files

| File | Use |
| --- | --- |
| `src/brand/logo-color.svg` | **Primary.** Gold word, gold/white rings, division planets. Documents, partners, social. (The site header carries no logo: the hero *is* the logo.) |
| `src/brand/logo-hero.svg` | As primary, with a lit gold word, for dark heroes, signage and the social card. |
| `src/brand/logo.svg` | One colour (`currentColor`) for print, embroidery, foil and single-colour use. |
| `src/brand/logo-word.svg` | The word alone. It is extruded in 3D, and the scene adds real rings around it. |
| `src/brand/mark-color.svg` | Icon "V planet": the V with three rings and a planet. App icons and avatars at 48 px and up. |
| `src/brand/mark.svg` | Icon, one colour. |
| `src/brand/mark-small.svg` | Icon cut for **32 px and below** (favicons): the V with a single heavier ring. |
| `public/brand/*` | The same files with colours baked in, for `<img>`, email signatures and partners. |
| `brand/cards/` | **Business cards**: logo front, details + contact QR back, print-ready PDFs. See `brand/cards/README.md`. |

## Ring system: single source of truth

`src/config/rings.json` is read by **both** `brand/generator/ringed.mjs` (the logo) and `src/scene/Orrery.ts` (3D):

- Ring *i* belongs to division *i* (the order in `src/config/site.ts`).
- Radius = word half-width × (`innerRadius` + *i* × `spacing`).
- Each ring's plane tilts toward the viewer by `baseTiltDeg` + *i* × `tiltStepDeg`. This fan is what separates the
  rings at the front and back. Perfectly flat rings would merge seen almost edge-on.
- The whole system is rolled by `rollDeg`. Tones alternate `tones[0]` (gold) and `tones[1]` (white).
- Planets sit at `planetAnglesDeg` (0° = right end, 90° = nearest the viewer). Back-side planets are placed only at
  the ring ends, outside the word, so none is hidden. Front-side planets sit below the letters, so none cuts a letter.

Change a number there and the logo **and** the website change together.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| Gold | `#D8B86A` | Word, gold rings |
| White | `#F3EEE3` | White rings |
| Obsidian | `#0A0806` | Background |
| Division planets | Music `#E6BFC1` blush · Events `#E1C4AE` sand · Talent `#CFC4E4` lilac · Growth `#B7D3BB` sage · Consulting `#B1CFE5` mist · Investments `#A9D4D3` seafoam · Development `#CCCEAC` stone | One planet each |

The division colours are **neutral, even and minimal** (owner direction, 2026-09-30) and set **by rule**, enforced by
`tests/site.test.ts`:

- even lightness (CIELAB L* 78–86)
- low chroma (C* ≤ 20; the gold is about 44)
- readable on the dark background
- never mistakable for the gold (ΔE ≥ 25)
- still distinguishable from each other (ΔE ≥ 10)

## Rules

- **Minimum size:** full logo at least 28 px tall on screen and at least 15 mm in print. Below that, use the icon.
  Below 32 px, use `mark-small.svg`.
- **Clear space:** keep at least the height of one planet clear around the outermost ring.
- Use only the files above. Never recolour individual rings or planets, re-space the rings, or remove the
  over/under gaps (they are what makes the rings read as *around* the word).
- Put it on dark backgrounds. For light backgrounds use the one-colour version in ink.

## Regenerating

```bash
npm run logo:final   # brand/generator/ringed.mjs → brand/concepts/ringed-final/ (+ renders, contact sheet)
#   then copy the outputs into src/brand/ (see brand/generator/ringed.mjs header for the file list)
npm run brand        # src/brand/*.svg → favicons, app icons, share image, public/brand/*
```

## History

The concept folders below live on the owner's machine only (`brand/concepts/` is git-ignored: about 1,500
renders). The generators in `brand/generator/` recreate them.


- `concepts/_round1`: first round (all with "GROUP INC"), archived.
- `concepts/f-seven-lines`: the line-built wordmark (installed briefly, then the owner asked for more creative work).
- `concepts/k-laser`, `l-ringed`, `m-gravity`, `n-ribbon`, `o-monogram`, `p-twist`: round 3 creative concepts.
  "Twist" was the judges' pick. The owner chose **Ringed** and asked for white/gold rings with coloured planets.
- `concepts/ringed-final` **(chosen)**. Archived installs: `archive/seven-lines`, `archive/twist`.
