// ── Team colour → theme tokens ───────────────────────────────────────────
// The selected team's colour is the app's accent: it fills the next-match
// card, lights the active tab and paints primary buttons, so the app reads as
// this team's rather than a template's. Team colours are picked by volunteers
// in a colour input, though — gold, sky blue and white all turn up — so the
// raw value cannot be trusted as text or as a button fill on either theme.
//
// teamPalette() derives contrast-safe variants: the raw colour for large
// fills, plus a shade that holds 4.5:1 against the light surface and a tint
// that holds it against the dark one, each with a readable foreground.

export const DEFAULT_TEAM_COLOR = '#23407a';

const WHITE = '#ffffff';
const INK = '#1c2421';
// Must match --card in the .dark block of index.css.
const DARK_SURFACE = '#1a201d';
const AA = 4.5;

function parseHex(hex) {
  const raw = String(hex || '')
    .trim()
    .replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function toHex(rgb) {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(parseHex(a));
  const lb = luminance(parseHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(rgb, target, amount) {
  return rgb.map((v, i) => v + (target[i] - v) * amount);
}

/** Step toward `target` until the colour holds AA against `surface`. */
function settle(rgb, target, surface) {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = toHex(mix(rgb, target, step * 0.05));
    if (contrast(candidate, surface) >= AA) return candidate;
  }
  return toHex(target);
}

/** White or ink, whichever reads better on `fill`. */
export function readableOn(fill) {
  return contrast(fill, WHITE) >= contrast(fill, INK) ? WHITE : INK;
}

// Below this a filled block stops reading as a block against the page behind
// it — a white or cream team colour on a white card, a navy one on the dark
// surface — so it gets an outline instead of melting into the page.
const EDGE_MIN = 1.35;
const LIGHT_EDGE = '#cfd5cd';
const DARK_EDGE = '#3a423e';
// A whole card of saturated colour glares on a dark page; pulling the fill a
// fifth of the way toward the surface keeps the hue without the floodlight.
const DARK_FILL_DIM = 0.2;

/**
 * @param {string} hex  the team's colour, any #rgb / #rrggbb, or nothing
 * @returns {{ base, baseFg, light, lightFg, dark, darkFg, fillDark, fillDarkFg, edgeLight, edgeDark }}
 *   base / fillDark — large fills (the next-match card, the jersey badge) per theme
 *   light / dark    — the accent as text and buttons, AA against each surface
 *   edgeLight / edgeDark — an outline colour when the fill would vanish, else the fill itself
 */
export function teamPalette(hex) {
  const rgb = parseHex(hex) || parseHex(DEFAULT_TEAM_COLOR);
  const base = toHex(rgb);
  // A white or cream kit still fills its own card, but darkening it into a
  // button colour lands on flat grey, which reads as disabled. Those teams
  // borrow the default accent for buttons and links.
  const accent = contrast(base, WHITE) < EDGE_MIN ? parseHex(DEFAULT_TEAM_COLOR) : rgb;
  const light = settle(accent, [0, 0, 0], WHITE);
  const dark = settle(accent, [255, 255, 255], DARK_SURFACE);
  const fillDark = toHex(mix(rgb, parseHex(DARK_SURFACE), DARK_FILL_DIM));
  return {
    base,
    baseFg: readableOn(base),
    light,
    lightFg: readableOn(light),
    dark,
    darkFg: readableOn(dark),
    fillDark,
    fillDarkFg: readableOn(fillDark),
    edgeLight: contrast(base, WHITE) < EDGE_MIN ? LIGHT_EDGE : base,
    edgeDark: contrast(fillDark, DARK_SURFACE) < EDGE_MIN ? DARK_EDGE : fillDark,
  };
}

/**
 * The palette as CSS custom properties, for setProperty on the root. index.css
 * picks the light or dark member of each pair into --team / --team-foreground
 * / --team-edge, which is what components read.
 */
export function teamColorVars(hex) {
  const p = teamPalette(hex);
  return {
    '--team-fill-light': p.base,
    '--team-fill-light-foreground': p.baseFg,
    '--team-edge-light': p.edgeLight,
    '--team-fill-dark': p.fillDark,
    '--team-fill-dark-foreground': p.fillDarkFg,
    '--team-edge-dark': p.edgeDark,
    '--team-light': p.light,
    '--team-light-foreground': p.lightFg,
    '--team-dark': p.dark,
    '--team-dark-foreground': p.darkFg,
  };
}
