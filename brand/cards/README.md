# Business cards

Print-ready VSM business cards. The front carries the Ringed logo. The back carries the person's details and a
QR code that saves the full contact on a phone. It works with the iPhone Camera, Android cameras and Google Lens,
with no app and no internet.

```bash
npm run cards      # brand/cards/people.json → brand/cards/out/
```

The generator needs Google Chrome. Ghostscript (`gs`) is optional: when it is installed, all text is turned into
outlines, which is what print shops prefer.

## Files (`out/`)

| File | Use |
| --- | --- |
| `<name>.pdf` | **Upload this to online printers** (Vistaprint, Moo, Staples…). Page 1 = front, page 2 = back. 3.75 × 2.25 in = the 3.5 × 2 in card + 1/8 in bleed. Vector. |
| `<name>-marks.pdf` | The same with crop marks, for a local print shop. |
| `<name>-front.png`, `<name>-back.png` | 600 dpi images with bleed, for printers that only take images. |
| `proof.png` | All cards trimmed, for checking on screen. |

## Spec

- **Size:** 3.5 × 2 in (88.9 × 50.8 mm), the North American and Canadian standard.
- **Bleed:** 0.125 in. **Safe area:** content sits ≥ 0.1875 in inside the cut.
- **No borders at the edges.** Cutting varies by about ±1/16 in, so an edge line would print uneven.
- **Colour:** sRGB. Printers convert it to CMYK, and gold prints slightly softer than on screen. Ask for a
  **rich black** background and order a printed proof first.
- **Suggested stock:** 16 pt or heavier (about 350 gsm) with a **matte or soft-touch** finish, which hides
  fingerprints on black. For a premium version, ask for **gold foil** on the VSM word. The one-colour master is
  `src/brand/logo.svg`.

## Built-in checks (every run fails loudly if one breaks)

- The data is validated. The printed phone number must be the same number the QR dials. Every email and number
  is checked for format. Control characters are rejected.
- **Layout:** every text block and the QR sit inside the safe area, and nothing overlaps. A name that is too long
  stops the run instead of printing off the card.
- **Scan test:** each back is rendered at a modest 200 dpi and the QR is read back from those pixels. The result
  must equal the exact contact card.
- The QR uses level M error correction (it survives scuffs), with about 0.38 mm modules and a full 4-module quiet
  zone. It is dark on a light tile, because many phones can't read light-on-dark codes.

## Before you order

1. Open `proof.png` and check every letter.
2. Print one page at home at 100 % scale (no "fit to page"). Scan it with an iPhone **and** an Android phone. Both
   should offer "Add contact" with the name, title, company, phone, email and office address filled in.
3. Confirm the postal code with Canada Post's postal code finder.

## Privacy

`people.json` (names and mobile numbers) and `out/` are **git-ignored**. Personal numbers never go into the
repository, which may be public. `people.example.json` documents the format. To add someone, add an entry to
`people.json` and run `npm run cards`. To put the website on the cards, add `"website": "https://…"` under
`company`. Leave it out until the site is live, so no card prints a dead link.
