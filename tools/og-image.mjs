#!/usr/bin/env node
/* ==========================================================================
   og-image.mjs — generate a raster social-share image (og:image)

   Why this exists: a link preview is the hook in DM and email outreach, and
   every social scraper rejects SVG. The repository ships only SVGs, so without
   this tool a site has no og:image at all and every shared link renders as a
   bare text card.

   Zero dependencies, like everything else here. PNG is written by hand with
   Node's built-in zlib, and the type is a 5x7 bitmap font compiled into this
   file — no headless browser, no canvas, no package manager. Build-time only:
   nothing it produces needs this tool to run.

   Usage:
     node tools/og-image.mjs <siteDir> [--out <file>] [--title "..."] [--subtitle "..."] [--width N] [--height N]

   Reads <siteDir>/content.json for the site name, theme colours and SEO copy.
   Writes 1200x630 by default (the size every scraper expects) and prints the
   seo.image line to add to the content file.
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve, basename, sep } from 'node:path';

/* ------------------------------------------------------------------- font */
/* 5x7 uppercase + digits + punctuation, one 7-row bitmask per glyph (bit 4 is
   the leftmost column). Small enough to inline, legible when scaled up. */
const GLYPHS = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01110','10001','10000','10000','10000','10001','01110'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01110','10001','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  J: ['00111','00010','00010','00010','00010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  0: ['01110','10001','10011','10101','11001','10001','01110'],
  1: ['00100','01100','00100','00100','00100','00100','01110'],
  2: ['01110','10001','00001','00010','00100','01000','11111'],
  3: ['11111','00010','00100','00010','00001','10001','01110'],
  4: ['00010','00110','01010','10010','11111','00010','00010'],
  5: ['11111','10000','11110','00001','00001','10001','01110'],
  6: ['00110','01000','10000','11110','10001','10001','01110'],
  7: ['11111','00001','00010','00100','01000','01000','01000'],
  8: ['01110','10001','10001','01110','10001','10001','01110'],
  9: ['01110','10001','10001','01111','00001','00010','01100'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ',': ['00000','00000','00000','00000','01100','00100','01000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '&': ['01100','10010','10100','01000','10101','10010','01101'],
  "'": ['00100','00100','00000','00000','00000','00000','00000'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00110','00100','00000','00100'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '=': ['00000','00000','11111','00000','11111','00000','00000'],
  '*': ['00000','10101','01110','11111','01110','10101','00000'],
  '#': ['01010','01010','11111','01010','11111','01010','01010'],
  '"': ['01010','01010','00000','00000','00000','00000','00000'],
  '%': ['11001','11010','00010','00100','01000','01011','10011'],
  '—': ['00000','00000','00000','11111','00000','00000','00000'],
  '–': ['00000','00000','00000','01110','00000','00000','00000'],
  '…': ['00000','00000','00000','00000','00000','10101','00000'],
};
const GLYPH_W = 5, GLYPH_H = 7;

/** Typographic characters with no glyph of their own, mapped to one that exists.
 *  A link preview is not the place for a literal '?' where an em dash belongs.
 *  Keys are code points so this file stays plain ASCII. */
const SUBSTITUTIONS = new Map([
  [0x2018, "'"], [0x2019, "'"], [0x201c, '"'], [0x201d, '"'],
  [0x2013, '–'], [0x2014, '—'], [0x2026, '…'], [0x00b7, '.'], [0x2022, '*'],
  [0x00a0, ' '], [0x2009, ' '], [0x200a, ' '], [0x202f, ' '], [0x200b, ' '],
]);

function glyphFor(ch) {
  if (GLYPHS[ch]) return ch;
  const sub = SUBSTITUTIONS.get(ch.codePointAt(0));
  if (sub && GLYPHS[sub]) return sub;
  const upper = ch.toUpperCase();
  if (GLYPHS[upper]) return upper;
  return '?';
}
/* ----------------------------------------------------------------- colour */
/** '#rgb' | '#rrggbb' | 'rgb(r,g,b)' | 'rgba(r,g,b,a)' -> {r,g,b,a} (0-255, a 0-1). */
function parseColor(input, fallback) {
  const s = String(input == null ? '' : input).trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const fn = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (fn) return { r: +fn[1], g: +fn[2], b: +fn[3], a: fn[4] === undefined ? 1 : +fn[4] };
  return fallback;
}

/** Perceived luminance (sRGB, 0-1). */
const luminance = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

const mix = (a, b, t) => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
  a: 1,
});

/* ------------------------------------------------------------------ canvas */
function createCanvas(w, h, bg) {
  const px = new Float64Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { px[i * 3] = bg.r; px[i * 3 + 1] = bg.g; px[i * 3 + 2] = bg.b; }
  return { w, h, px };
}

/** Source-over blend of one pixel, coverage 0-1. */
function blend(cv, x, y, color, cov) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h || cov <= 0) return;
  const k = Math.min(1, cov) * (color.a === undefined ? 1 : color.a);
  if (k <= 0) return;
  const i = (y * cv.w + x) * 3;
  cv.px[i] += (color.r - cv.px[i]) * k;
  cv.px[i + 1] += (color.g - cv.px[i + 1]) * k;
  cv.px[i + 2] += (color.b - cv.px[i + 2]) * k;
}

function fillRect(cv, x, y, w, h, color, cov) {
  const c = cov === undefined ? 1 : cov;
  const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(cv.w, Math.ceil(x + w));
  const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(cv.h, Math.ceil(y + h));
  for (let py = y0; py < y1; py++) for (let pxi = x0; pxi < x1; pxi++) blend(cv, pxi, py, color, c);
}

/**
 * Anti-aliased rounded rectangle. Coverage comes from the signed distance to the
 * boundary, so edges are smooth without supersampling the whole canvas.
 */
function fillRoundRect(cv, x, y, w, h, radius, color, cov) {
  const c = cov === undefined ? 1 : cov;
  if (w <= 0 || h <= 0) return;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const x0 = Math.max(0, Math.floor(x - 1)), x1 = Math.min(cv.w, Math.ceil(x + w + 1));
  const y0 = Math.max(0, Math.floor(y - 1)), y1 = Math.min(cv.h, Math.ceil(y + h + 1));
  const cx0 = x + r, cx1 = x + w - r, cy0 = y + r, cy1 = y + h - r;
  for (let py = y0; py < y1; py++) {
    for (let pxi = x0; pxi < x1; pxi++) {
      const sx = pxi + 0.5, sy = py + 0.5;
      const dx = sx < cx0 ? cx0 - sx : (sx > cx1 ? sx - cx1 : 0);
      const dy = sy < cy0 ? cy0 - sy : (sy > cy1 ? sy - cy1 : 0);
      const dist = Math.hypot(dx, dy) - r;
      const a = Math.max(0, Math.min(1, 0.5 - dist));
      if (a > 0) blend(cv, pxi, py, color, a * c);
    }
  }
}

/* ------------------------------------------------------------------- text */
const textWidth = (text, scale, tracking) => {
  const t = tracking === undefined ? 1 : tracking;
  if (!text.length) return 0;
  return text.length * (GLYPH_W + t) * scale - t * scale;
};

/** Draw one line of text, glyph by glyph. Returns the advance width. */
function drawText(cv, text, x, y, scale, color, tracking) {
  const t = tracking === undefined ? 1 : tracking;
  let cursor = x;
  for (const raw of String(text)) {
    const rows = GLYPHS[glyphFor(raw)];
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (rows[gy][gx] !== '1') continue;
        fillRect(cv, cursor + gx * scale, y + gy * scale, scale, scale, color);
      }
    }
    cursor += (GLYPH_W + t) * scale;
  }
  return cursor - x;
}

/** Greedy word wrap to a pixel width. */
function wrap(text, scale, maxWidth, tracking) {
  const t = tracking === undefined ? 1 : tracking;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (textWidth(next, scale, t) > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/* --------------------------------------------------------------- PNG file */
const CRC_TABLE = (function () {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode the canvas as a truecolour PNG. */
function encodePng(cv) {
  const raw = Buffer.alloc(cv.h * (cv.w * 3 + 1));
  let o = 0;
  for (let y = 0; y < cv.h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < cv.w; x++) {
      const i = (y * cv.w + x) * 3;
      raw[o++] = Math.max(0, Math.min(255, Math.round(cv.px[i])));
      raw[o++] = Math.max(0, Math.min(255, Math.round(cv.px[i + 1])));
      raw[o++] = Math.max(0, Math.min(255, Math.round(cv.px[i + 2])));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
/* -------------------------------------------------------------------- cli */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const siteDir = resolve(argv.find((a) => !a.startsWith('--')) || 'site/public');

const contentFile = join(siteDir, 'content.json');
if (!existsSync(contentFile)) {
  console.error('og-image: no content.json in ' + siteDir);
  process.exit(2);
}
const doc = JSON.parse(readFileSync(contentFile, 'utf8'));
const site = doc.site || {};
const seo = site.seo || {};
const colors = (doc.theme && doc.theme.colors) || {};

// 1200x630 is what every scraper expects; the flags exist for tests and variants.
const W = Number(flag('--width', 1200));
const H = Number(flag('--height', 630));

const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const bg = parseColor(colors.background, { r: 250, g: 246, b: 240, a: 1 });
const surface = parseColor(colors.surface, WHITE);
const primary = parseColor(colors.primary, { r: 30, g: 77, b: 79, a: 1 });
const accent = parseColor(colors.accent, { r: 217, g: 119, b: 6, a: 1 });
const ink = parseColor(colors.text, { r: 17, g: 24, b: 39, a: 1 });
const muted = parseColor(colors['text-muted'], mix(ink, bg, 0.45));

const name = String(site.name || 'Your site').trim();
const defaultTitle = String(seo.title || site.description || name).trim();
const title = String(flag('--title', defaultTitle)).trim();
const subtitle = String(flag('--subtitle', seo.description || site.description || '')).trim();
const domain = String(site.baseUrl || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');

/* --------------------------------------------------------------- compose */
const cv = createCanvas(W, H, bg);
const MARGIN = Math.round(W * 0.058);
const CONTENT_W = W - MARGIN * 2;

// 1. Plate atmosphere — the same two soft tints the site's .plate-ambient uses.
(function ambient() {
  const spots = [
    { cx: W * 0.16, cy: H * 0.10, r: W * 0.40, c: accent, alpha: 0.11 },
    { cx: W * 0.88, cy: H * 0.26, r: W * 0.44, c: primary, alpha: 0.10 },
  ];
  for (const s of spots) {
    const x0 = Math.max(0, Math.floor(s.cx - s.r)), x1 = Math.min(W, Math.ceil(s.cx + s.r));
    const y0 = Math.max(0, Math.floor(s.cy - s.r)), y1 = Math.min(H, Math.ceil(s.cy + s.r));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const d = Math.hypot(x - s.cx, y - s.cy) / s.r;
        if (d >= 1) continue;
        blend(cv, x, y, s.c, (1 - d) * (1 - d) * s.alpha);
      }
    }
  }
})();

// 2. Brand row: name on the left, tile motif on the right. The motif is laid out
//    first so the name can be scaled down to fit beside it — a long business name
//    running under the motif is the one collision this layout can produce.
const MOTIF_SIZE = Math.round(W * 0.038);
const MOTIF_GAP = Math.round(MOTIF_SIZE * 0.32);
const MOTIF_COLS = 4, MOTIF_ROWS = 2;
const MOTIF_W = MOTIF_COLS * MOTIF_SIZE + (MOTIF_COLS - 1) * MOTIF_GAP;
const nameMaxW = CONTENT_W - MOTIF_W - Math.round(W * 0.035);

let NAME_SCALE = 7;
while (NAME_SCALE > 3 && textWidth(name, NAME_SCALE, 2) > nameMaxW) NAME_SCALE -= 1;
const nameH = GLYPH_H * NAME_SCALE;
const brandY = MARGIN;
drawText(cv, name.toUpperCase(), MARGIN, brandY, NAME_SCALE, accent, 2);

(function motif() {
  const mh = MOTIF_ROWS * MOTIF_SIZE + (MOTIF_ROWS - 1) * MOTIF_GAP;
  const x0 = W - MARGIN - MOTIF_W;
  const y0 = brandY + Math.round((nameH - mh) / 2);
  for (let r = 0; r < MOTIF_ROWS; r++) {
    for (let c = 0; c < MOTIF_COLS; c++) {
      const t = (r * MOTIF_COLS + c) / (MOTIF_ROWS * MOTIF_COLS - 1);
      const tint = (c === 0 && r === 0) ? accent : primary;
      fillRoundRect(cv, x0 + c * (MOTIF_SIZE + MOTIF_GAP), y0 + r * (MOTIF_SIZE + MOTIF_GAP),
        MOTIF_SIZE, MOTIF_SIZE, MOTIF_SIZE * 0.28, tint, 0.08 + 0.14 * (1 - t));
    }
  }
})();

// 3. Card geometry. The title scale is chosen so the wrapped headline always fits
//    the card — a link preview that clips its own headline is worse than none.
const CARD_X = MARGIN;
const CARD_Y = brandY + nameH + Math.round(H * 0.052);
const CARD_W = CONTENT_W;
const CARD_PAD = Math.round(W * 0.042);
const INNER_W = CARD_W - CARD_PAD * 2;
const CARD_BOTTOM_LIMIT = H - MARGIN - Math.round(H * 0.03);
const SUB_SCALE = 3;
const SUB_LINE_H = GLYPH_H * SUB_SCALE + 9;

let titleScale = 6, titleLines = wrap(title, titleScale, INNER_W, 1);
while (titleLines.length > 3 && titleScale > 3) {
  titleScale -= 1;
  titleLines = wrap(title, titleScale, INNER_W, 1);
}
const TITLE_LINE_H = GLYPH_H * titleScale + 14;
const subLines = subtitle ? wrap(subtitle, SUB_SCALE, INNER_W, 1).slice(0, 3) : [];
const DOMAIN_SCALE = 3;
const domainH = domain ? GLYPH_H * DOMAIN_SCALE + 18 : 0;

const bodyH =
  titleLines.length * TITLE_LINE_H +
  (subLines.length ? 16 + subLines.length * SUB_LINE_H : 0) +
  (domainH ? 20 + domainH : 0);
const CARD_H = Math.min(CARD_BOTTOM_LIMIT - CARD_Y, bodyH + CARD_PAD * 2);

// The card is the site's surface colour, tinted a touch so it reads as a plate
// even when the theme's background and surface are close.
fillRoundRect(cv, CARD_X, CARD_Y, CARD_W, CARD_H, Math.round(W * 0.018), surface, 0.94);
fillRoundRect(cv, CARD_X, CARD_Y, CARD_W, CARD_H, Math.round(W * 0.018), bg, 0.34);
// A hairline in the primary colour keeps the edge visible on a light theme.
fillRoundRect(cv, CARD_X + 0.5, CARD_Y + 0.5, CARD_W - 1, CARD_H - 1, Math.round(W * 0.018), mix(surface, primary, 0.35), 0.30);

let y = CARD_Y + CARD_PAD;

// Headline: the page's SEO title, which is what the link is actually about.
const titleColor = luminance(surface) > 0.55 ? ink : WHITE;
for (const line of titleLines) {
  drawText(cv, line, CARD_X + CARD_PAD, y, titleScale, titleColor, 1);
  y += TITLE_LINE_H;
}

if (subLines.length) {
  y += 16;
  for (const line of subLines) {
    drawText(cv, line, CARD_X + CARD_PAD, y, SUB_SCALE, muted, 1);
    y += SUB_LINE_H;
  }
}

if (domain) {
  y += 20;
  const pw = textWidth(domain, DOMAIN_SCALE, 1) + 28;
  fillRoundRect(cv, CARD_X + CARD_PAD, y, pw, domainH, domainH / 2, mix(surface, primary, 0.12), 1);
  drawText(cv, domain, CARD_X + CARD_PAD + 14, y + 9, DOMAIN_SCALE, primary, 1);
}

// 4. Accent rule along the bottom edge — the same accent the site's CTAs use.
fillRect(cv, 0, H - Math.max(6, Math.round(H * 0.016)), W, Math.max(6, Math.round(H * 0.016)), accent);

/* ------------------------------------------------------------------ write */
const outFlag = flag('--out', null);
const outPath = outFlag ? resolve(outFlag) : join(siteDir, 'assets', 'og-image.png');
if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
const png = encodePng(cv);
writeFileSync(outPath, png);

// Site-relative, POSIX-separated: this is the string that goes in content.json.
const siteRoot = resolve(siteDir).split(sep).join('/');
const rel = outPath.split(sep).join('/').replace(siteRoot + '/', '');

console.log('[og-image] ' + basename(siteDir) + ' — ' + W + 'x' + H + ', ' + (png.length / 1024).toFixed(1) + ' KB');
console.log('  wrote ' + rel);
console.log('  metrics: title ' + titleLines.length + ' line(s) at scale ' + titleScale +
  ', subtitle ' + subLines.length + ' line(s), card ' + Math.round(CARD_H) + 'px');
if (outFlag === null) {
  console.log('  next: set content.json -> site.seo.image = "/' + rel + '", then run node tools/seo.mjs ' + siteDir);
}