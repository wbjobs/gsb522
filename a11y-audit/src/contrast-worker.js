// Web Worker：批量计算文本对比度，避免主线程阻塞。
// 输入: { jobs: [{ id, fg: {r,g,b,a}, bg: {r,g,b,a}, fontSize, fontWeight, level }] }
// 输出: { results: [{ id, ratio, required, largeText, pass }] }

function clamp255(v) {
  return Math.min(255, Math.max(0, Math.round(v)));
}

function blendAlpha(fg, bg) {
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

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function isLargeText(fontSizePx, fontWeight) {
  const bold = typeof fontWeight === 'string'
    ? fontWeight === 'bold' || parseInt(fontWeight, 10) >= 700
    : fontWeight >= 700;
  return fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
}

function requiredRatio(level, largeText) {
  if (level === 'AAA') return largeText ? 4.5 : 7;
  return largeText ? 3 : 4.5;
}

self.onmessage = (event) => {
  const { jobs } = event.data;
  const results = jobs.map((job) => {
    const fg = blendAlpha(job.fg, job.bg);
    const largeText = isLargeText(job.fontSize, job.fontWeight);
    const required = requiredRatio(job.level || 'AA', largeText);
    const ratio = contrastRatio(fg, job.bg);
    return {
      id: job.id,
      ratio: Math.round(ratio * 100) / 100,
      required,
      largeText,
      pass: ratio >= required,
    };
  });
  self.postMessage({ results });
};
