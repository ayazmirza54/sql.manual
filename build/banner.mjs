/**
 * 5-row block font for the hero wordmark.
 *
 * Each glyph is 5 columns wide and 5 rows tall, drawn on a '#' / '.' grid.
 * `asciiBanner()` renders text into an array of row strings using a solid
 * block character, which is what gives the chunky pixel look.
 */

const G = (...rows) => rows;

const FONT = {
  A: G('.###.', '#...#', '#####', '#...#', '#...#'),
  B: G('####.', '#...#', '####.', '#...#', '####.'),
  C: G('.####', '#....', '#....', '#....', '.####'),
  D: G('####.', '#...#', '#...#', '#...#', '####.'),
  E: G('#####', '#....', '####.', '#....', '#####'),
  F: G('#####', '#....', '####.', '#....', '#....'),
  G: G('.####', '#....', '#..##', '#...#', '.####'),
  H: G('#...#', '#...#', '#####', '#...#', '#...#'),
  I: G('#####', '..#..', '..#..', '..#..', '#####'),
  J: G('...##', '....#', '....#', '#...#', '.###.'),
  K: G('#...#', '#..#.', '###..', '#..#.', '#...#'),
  L: G('#....', '#....', '#....', '#....', '#####'),
  M: G('#...#', '##.##', '#.#.#', '#...#', '#...#'),
  N: G('#...#', '##..#', '#.#.#', '#..##', '#...#'),
  O: G('.###.', '#...#', '#...#', '#...#', '.###.'),
  P: G('####.', '#...#', '####.', '#....', '#....'),
  Q: G('.###.', '#...#', '#...#', '#..#.', '.##.#'),
  R: G('####.', '#...#', '####.', '#..#.', '#...#'),
  S: G('.####', '#....', '.###.', '....#', '####.'),
  T: G('#####', '..#..', '..#..', '..#..', '..#..'),
  U: G('#...#', '#...#', '#...#', '#...#', '.###.'),
  V: G('#...#', '#...#', '#...#', '.#.#.', '..#..'),
  W: G('#...#', '#...#', '#.#.#', '##.##', '#...#'),
  X: G('#...#', '.#.#.', '..#..', '.#.#.', '#...#'),
  Y: G('#...#', '.#.#.', '..#..', '..#..', '..#..'),
  Z: G('#####', '...#.', '..#..', '.#...', '#####'),
  0: G('.###.', '#..##', '#.#.#', '##..#', '.###.'),
  1: G('..#..', '.##..', '..#..', '..#..', '.###.'),
  2: G('.###.', '#...#', '..##.', '.#...', '#####'),
  3: G('####.', '....#', '.###.', '....#', '####.'),
  4: G('#..#.', '#..#.', '#####', '...#.', '...#.'),
  5: G('#####', '#....', '####.', '....#', '####.'),
  6: G('.###.', '#....', '####.', '#...#', '.###.'),
  7: G('#####', '....#', '...#.', '..#..', '..#..'),
  8: G('.###.', '#...#', '.###.', '#...#', '.###.'),
  9: G('.###.', '#...#', '.####', '....#', '.###.'),
  '.': G('.....', '.....', '.....', '.....', '..#..'),
  '-': G('.....', '.....', '.####', '.....', '.....'),
  '_': G('.....', '.....', '.....', '.....', '#####'),
  '>': G('#....', '.#...', '..#..', '.#...', '#....'),
  ' ': G('.....', '.....', '.....', '.....', '.....'),
};

export const GLYPH_W = 5;
export const GLYPH_H = 5;
const GAP = 1;

/** Columns a rendered string will occupy. */
export const bannerWidth = (text) => text.length * (GLYPH_W + GAP) - GAP;

/**
 * @param {string} text        rendered uppercase
 * @param {string} on          character for a filled cell
 * @param {string} off         character for an empty cell
 * @returns {string[]}         GLYPH_H rows
 */
export function asciiBanner(text, on = '█', off = ' ') {
  const chars = text.toUpperCase().split('');
  const rows = [];
  for (let r = 0; r < GLYPH_H; r++) {
    const parts = chars.map((c) => {
      const glyph = FONT[c] || FONT[' '];
      return glyph[r].replace(/#/g, on).replace(/\./g, off);
    });
    rows.push(parts.join(off.repeat(GAP)));
  }
  return rows;
}

/**
 * Renders the wordmark as inline SVG rectangles.
 *
 * Drawing this as text is unreliable: U+2588 FULL BLOCK is missing from many
 * monospace fonts, so it resolves to a fallback whose advance width differs
 * from the space character. Columns then drift and the letters collide --
 * which is exactly what happens on Android. Rectangles have no font
 * dependency, tile without seams, and scale to any width.
 *
 * Cells are 0.6 wide by 1.0 tall, reproducing monospace character proportions
 * so the letterforms keep their narrow terminal look.
 *
 * @param {string} text
 * @param {number} splitAt  glyph index where the bright half begins
 * @returns {string} an <svg> element
 */
export function bannerSvg(text, splitAt, title = text) {
  const rows = asciiBanner(text, '#', '.');
  const cols = bannerWidth(text);
  const cw = 0.6;
  const cutCol = splitAt * (GLYPH_W + GAP);

  // Run-length encode each row into as few rects as possible: adjacent filled
  // cells merge into one rect, which removes horizontal antialiasing seams.
  const runs = { dim: [], lit: [] };
  rows.forEach((row, y) => {
    let x = 0;
    while (x < cols) {
      if (row[x] !== '#') { x++; continue; }
      let end = x;
      while (end < cols && row[end] === '#' && (end < cutCol) === (x < cutCol)) end++;
      runs[x < cutCol ? 'dim' : 'lit'].push(
        // 1.004 height gives a hairline overlap so rows fuse into solid strokes
        `<rect x="${+(x * cw).toFixed(3)}" y="${y}" width="${+((end - x) * cw).toFixed(3)}" height="1.004"/>`
      );
      x = end;
    }
  });

  return (
    `<svg class="hero__mark" viewBox="0 0 ${+(cols * cw).toFixed(2)} ${GLYPH_H}" ` +
    `role="img" aria-hidden="true" focusable="false" preserveAspectRatio="xMinYMid meet">` +
    `<title>${title}</title>` +
    `<g class="m-dim">${runs.dim.join('')}</g>` +
    `<g class="m-lit">${runs.lit.join('')}</g>` +
    `</svg>`
  );
}
