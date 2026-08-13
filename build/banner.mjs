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
 * Renders a two-tone wordmark: the first `splitAt` characters get one class,
 * the rest another — the "opencode" treatment, where the two halves of the
 * name are shaded differently.
 *
 * @returns {string} HTML for a <pre> body
 */
export function bannerHtml(text, splitAt, dimClass = 'dim') {
  const cut = splitAt * (GLYPH_W + GAP);
  return asciiBanner(text)
    .map((row) => {
      const a = row.slice(0, cut).replace(/ /g, ' ');
      const b = row.slice(cut).replace(/ /g, ' ');
      return `<span class="${dimClass}">${a}</span>${b}`;
    })
    .join('\n');
}
