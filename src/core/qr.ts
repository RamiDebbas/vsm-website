import qrcode from 'qrcode-generator';

/**
 * QR codes as plain data: a boolean module grid plus a vector path, no canvas or DOM, so the same code
 * serves the print pipeline (brand/generator/cards.mjs) and, later, the website.
 *
 * The library's default text encoder keeps only the low byte of each character (Latin-1), which would
 * corrupt names like "Zoë" or "Núñez". Readers expect UTF-8, so swap it in. This is the library's documented hook,
 * and it is read on every `addData()` call.
 */
qrcode.stringToBytes = (s: string): number[] => Array.from(new TextEncoder().encode(s));

export type QrLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  /** Modules per side, without quiet zone. */
  size: number;
  /** QR version 1–40 (size = 17 + 4 × version). */
  version: number;
  dark: (row: number, col: number) => boolean;
}

/**
 * Encodes text (byte mode, UTF-8) at the smallest version that fits. Level M (~15% recovery) is the
 * default: a business card gets scuffed and bent, and L would only save a version or two.
 */
export function qrMatrix(text: string, level: QrLevel = 'M'): QrMatrix {
  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return { size, version: (size - 17) / 4, dark: (r, c) => qr.isDark(r, c) };
}

/**
 * One SVG path for all dark modules, in module units, offset by the quiet zone. Horizontal runs are
 * merged into single rectangles, so there are no hairline seams between neighbours when printed.
 */
export function qrPath(m: QrMatrix, quiet = 4): string {
  let d = '';
  for (let r = 0; r < m.size; r += 1) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) { c += 1; continue; }
      const start = c;
      while (c < m.size && m.dark(r, c)) c += 1;
      d += `M${start + quiet} ${r + quiet}h${c - start}v1h-${c - start}z`;
    }
  }
  return d;
}

/** A complete standalone SVG (dark modules on a light square incl. quiet zone). */
export function qrSvg(m: QrMatrix, opts: { dark?: string; light?: string; quiet?: number } = {}): string {
  const { dark = '#0A0806', light = '#F3EEE3', quiet = 4 } = opts;
  const n = m.size + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
    + `<rect width="${n}" height="${n}" fill="${light}"/><path fill="${dark}" d="${qrPath(m, quiet)}"/></svg>`;
}
