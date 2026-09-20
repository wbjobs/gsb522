// 颜色解析与 WCAG 对比度计算。
// 纯函数部分可在 Node 中测试；浏览器端可用 Canvas 解析任意 CSS 颜色字符串。

const NAMED_COLORS = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
  blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', maroon: '#800000', purple: '#800080', fuchsia: '#ff00ff',
  lime: '#00ff00', olive: '#808000', navy: '#000080', teal: '#008080',
  aqua: '#00ffff', orange: '#ffa500', transparent: 'rgba(0,0,0,0)',
  rebeccapurple: '#663399',
};

let canvasCtx = null;
function getCanvasCtx() {
  if (canvasCtx !== null) return canvasCtx;
  if (typeof document === 'undefined') return null;
  try {
    canvasCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  } catch {
    canvasCtx = null;
  }
  return canvasCtx;
}

function clamp255(v) {
  return Math.min(255, Math.max(0, Math.round(v)));
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}

function parseAlpha(str) {
  if (str == null || str === '') return 1;
  str = String(str).trim();
  if (str.endsWith('%')) return Math.min(1, Math.max(0, parseFloat(str) / 100));
  const a = parseFloat(str);
  return Number.isNaN(a) ? 1 : Math.min(1, Math.max(0, a));
}

function parseComponent(str) {
  str = String(str).trim();
  if (str.endsWith('%')) return clamp255((parseFloat(str) / 100) * 255);
  return clamp255(parseFloat(str));
}

// 纯解析器：hex / rgb(a) / hsl(a) / 常见命名色。返回 {r,g,b,a} 或 null。
export function parseColorPure(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim().toLowerCase();
  if (NAMED_COLORS[str]) return parseColorPure(NAMED_COLORS[str]);

  let m = str.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const hex = m[1];
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split('').map((ch) => parseInt(ch + ch, 16));
      return { r, g, b, a: hex.length === 4 ? a / 255 : 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  m = str.match(/^rgba?\((.+)\)$/);
  if (m) {
    const body = m[1].trim();
    if (body.includes('/') || (!body.includes(',') && body.includes(' '))) {
      const [comps, alpha] = body.split('/').map((s) => s.trim());
      const parts = comps.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 3) return null;
      return {
        r: parseComponent(parts[0]),
        g: parseComponent(parts[1]),
        b: parseComponent(parts[2]),
        a: parseAlpha(alpha),
      };
    }
    const parts = body.split(',').map((s) => s.trim());
    if (parts.length < 3) return null;
    return {
      r: parseComponent(parts[0]),
      g: parseComponent(parts[1]),
      b: parseComponent(parts[2]),
      a: parseAlpha(parts[3]),
    };
  }

  m = str.match(/^hsla?\((.+)\)$/);
  if (m) {
    const body = m[1].trim();
    let parts;
    let alpha;
    if (body.includes('/')) {
      const [comps, a] = body.split('/').map((s) => s.trim());
      parts = comps.split(/[\s,]+/).filter(Boolean);
      alpha = parseAlpha(a);
    } else {
      parts = body.split(/[\s,]+/).filter(Boolean);
      alpha = parts.length > 3 ? parseAlpha(parts[3]) : 1;
    }
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    const { r, g, b } = hslToRgb(h, s, l);
    return { r, g, b, a: alpha };
  }

  return null;
}

// 浏览器端增强：Canvas 可解析 color-mix()/lab()/系统色等任意合法 CSS 颜色。
export function parseColor(input) {
  const pure = parseColorPure(input);
  if (pure) return pure;
  const ctx = getCanvasCtx();
  if (!ctx || typeof input !== 'string') return null;
  try {
    ctx.fillStyle = '#000';
    ctx.fillStyle = input;
    const normalized = ctx.fillStyle;
    if (normalized === '#000' && input.trim().toLowerCase() !== '#000'
        && !/^#0{3,8}$/.test(input.trim().toLowerCase())
        && input.trim().toLowerCase() !== 'black') {
      return null;
    }
    return parseColorPure(normalized);
  } catch {
    return null;
  }
}

// 将半透明前景色混合到不透明背景上。
export function blendAlpha(fg, bg) {
  const a = fg.a == null ? 1 : fg.a;
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  return {
    r: clamp255(fg.r * a + bg.r * (1 - a)),
    g: clamp255(fg.g * a + bg.g * (1 - a)),
    b: clamp255(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

function channelLuminance(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// WCAG 2.x 相对亮度
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

// WCAG 对比度 (L1 + 0.05) / (L2 + 0.05)，范围 1..21
export function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// 是否为大字号文本：>=24px，或粗体且 >=18.66px（WCAG 大号文本定义）
export function isLargeText(fontSizePx, fontWeight) {
  const bold = typeof fontWeight === 'string'
    ? fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700
    : fontWeight >= 700;
  if (fontSizePx >= 24) return true;
  if (bold && fontSizePx >= 18.66) return true;
  return false;
}

export function requiredRatio(level = 'AA', largeText = false) {
  if (level === 'AAA') return largeText ? 4.5 : 7;
  return largeText ? 3 : 4.5;
}

export function meetsContrast(ratio, level = 'AA', largeText = false) {
  return ratio >= requiredRatio(level, largeText);
}
