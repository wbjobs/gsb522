import { NAMED_COLORS } from './color-names.js';

// {r,g,b,a} where a is 0..1. null means "fully transparent / unresolved".
export function parseColor(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'rgba(0, 0, 0, 0)') {
    return s === 'transparent' || !s ? { r: 0, g: 0, b: 0, a: 0 } : null;
  }
  if (s === 'currentcolor' || s === 'inherit' || s === 'initial' || s === 'unset') return null;
  if (NAMED_COLORS[s]) {
    const [r, g, b] = NAMED_COLORS[s];
    return { r, g, b, a: 1 };
  }
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (h.length === 6) return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    if (h.length === 8) return { r: (n >> 24) & 255, g: (n >> 16) & 255, b: (n >> 8) & 255, a: (n & 255) / 255 };
  }
  m = /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/.exec(s);
  if (m) {
    const out = parseFunctional(s, m[1]);
    if (out) return out;
  }
  // system / unknown colors: treat conservatively as unresolved
  return null;
}

function parseFunctional(s, fn) {
  const parts = s
    .slice(s.indexOf('(') + 1, -1)
    .split(/[\/,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (fn === 'rgb' || fn === 'rgba') {
    if (parts.length < 3) return null;
    return { r: num8(parts[0]), g: num8(parts[1]), b: num8(parts[2]), a: parts[3] != null ? alpha(parts[3]) : 1 };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    if (parts.length < 3) return null;
    const [r, g, b] = hslToRgb(hue(parts[0]), pct100(parts[1]), pct100(parts[2]));
    return { r, g, b, a: parts[3] != null ? alpha(parts[3]) : 1 };
  }
  if (fn === 'hwb') {
    if (parts.length < 3) return null;
    const [r, g, b] = hwbToRgb(hue(parts[0]), pct100(parts[1]), pct100(parts[2]));
    return { r, g, b, a: parts[3] != null ? alpha(parts[3]) : 1 };
  }
  // lab/lch/oklab/oklch/color(): approximate through sRGB best-effort, else unresolved
  return null;
}

const num8 = (v) => {
  if (v.endsWith('%')) return Math.round(pct(v));
  return clamp255(Math.round(Number(v)));
};
const alpha = (v) => (v.endsWith('%') ? clamp01(Number(v.slice(0, -1)) / 100) : clamp01(Number(v)));
const pct100 = (v) => (v.endsWith('%') ? Number(v.slice(0, -1)) : Number(v) * 100);
const hue = (v) => (v.endsWith('deg') ? Number(v.slice(0, -3)) : Number(v));
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const clamp255 = (n) => Math.min(255, Math.max(0, n));

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function hwbToRgb(h, w, b) {
  const [r0, g0, b0] = hslToRgb(h, 100, 50);
  let [r, g, bl] = [r0 / 255, g0 / 255, b0 / 255];
  w /= 100; b /= 100;
  if (w + b >= 1) {
    const gray = w / (w + b);
    return [gray * 255, gray * 255, gray * 255].map(Math.round);
  }
  for (const [i, v] of [r, g, bl].entries()) {
    const nv = v * (1 - w - b) + w;
    if (i === 0) r = nv; else if (i === 1) g = nv; else bl = nv;
  }
  return [r * 255, g * 255, bl * 255].map(Math.round);
}

// Composite a possibly-translucent foreground color over an opaque backdrop.
export function flattenColor(fg, backdrop) {
  if (!fg) return backdrop ? { ...backdrop, a: 1 } : null;
  if (!backdrop) return fg.a === 0 ? null : { ...fg };
  const a = fg.a + backdrop.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (cp, bp) => Math.round((fg.a * cp + backdrop.a * (1 - fg.a) * bp) / a);
  return { r: mix(fg.r, backdrop.r), g: mix(fg.g, backdrop.g), b: mix(fg.b, backdrop.b), a };
}

// Effective opacity of an element stack (multiplies opacity from self up).
export function stackOpacity(chain) {
  let a = 1;
  for (const node of chain) {
    const o = Number(node.__computed?.opacity);
    if (Number.isFinite(o)) a *= clamp01(o);
  }
  return a;
}

export function relativeLuminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

// WCAG 2.1 thresholds. level: 'AA' | 'AAA'; large: 18pt+ bold 14pt+.
export function requiredContrast(level, large) {
  if (level === 'AAA') return large ? 3 : 7;
  return large ? 3 : 4.5;
}

export function isLargeText(fontSizePx, fontWeight) {
  const weight = Number(fontWeight) || 400;
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && weight >= 700);
}
