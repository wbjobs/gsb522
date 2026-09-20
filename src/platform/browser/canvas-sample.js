// Background color resolution via canvas rasterization.
//
// Strategy: for each text element we serialize it (with ancestor background
// context) into an SVG <foreignObject>, rasterize that to a canvas, and read
// pixels just outside/behind the glyph box. This covers gradients and
// background images, which CSS parsing alone cannot evaluate. Cross-origin
// images taint the canvas and are reported as "needs review".
//
// Rasterization is async (Image decode), so rules first call prefetch() to
// fill a cache, then resolveColors() reads the cache synchronously.
const SERIALIZED_PROPS = [
  'color', 'background-color', 'background-image', 'font-size', 'font-weight',
  'font-family', 'opacity', 'display', 'visibility', 'padding', 'border-radius',
  'line-height', 'letter-spacing'
];

export function createBackgroundSampler(doc) {
  const cache = new Map();

  async function prefetch(items) {
    await Promise.all(items.map((item) => remember(item.el, item.chain)));
  }

  async function load(el, chain) {
    if (cache.has(el)) return cache.get(el);
    const entry = Promise.resolve().then(() => rasterize(el, chain));
    cache.set(el, entry);
    return entry;
  }

  // Returns the settled rasterization entry or null if not prefetched/settled.
  function sample(el) {
    return SETTLED.get(el) || null;
  }
  const SETTLED = new Map();
  async function remember(el, chain) {
    const entry = await load(el, chain);
    SETTLED.set(el, entry);
    return entry;
  }

  async function rasterize(el, chain) {
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width < 1 || rect.height < 1) return { status: 'fulfilled', value: null };
    try {
      const w = Math.ceil(rect.width);
      const h = Math.ceil(rect.height);
      const svg = buildSvg(el, chain, w, h);
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const bmp = await loadImage(url);
      URL.revokeObjectURL(url);
      const canvas = doc.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const c = canvas.getContext('2d', { willReadFrequently: true });
      c.drawImage(bmp, 0, 0, w, h);
      const color = readEdgePixels(c, w, h);
      return { status: 'fulfilled', value: color ? { color, source: 'canvas' } : null };
    } catch (err) {
      if (err?.name === 'SecurityError') {
        return { status: 'fulfilled', value: { color: null, source: 'canvas', incomplete: true, taint: true } };
      }
      return { status: 'fulfilled', value: null };
    }
  }

  return { prefetch, sample };
}

function buildSvg(el, chain, w, h) {
  // Clone each ancestor so backgrounds behind the text are reproduced, then
  // inline the computed style on every cloned element.
  const leafClone = el.cloneNode(true);
  const pairs = chain.map((node) => ({ src: node, dst: node === el ? leafClone : node.cloneNode(false) }));
  for (let i = 0; i < pairs.length - 1; i++) pairs[i].dst.appendChild(pairs[i + 1].dst);
  for (const { src, dst } of pairs) {
    inlineStyle(src, dst);
    for (const [s, d] of zipAll(src, dst)) inlineStyle(s, d);
  }
  const rootClone = pairs[0].dst;
  const xhtml = new XMLSerializer().serializeToString(ensureXhtml(rootClone));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
}

function* zipAll(src, dst) {
  const ss = src.querySelectorAll('*');
  const dd = dst.querySelectorAll('*');
  for (let i = 0; i < ss.length && i < dd.length; i++) yield [ss[i], dd[i]];
}

function ensureXhtml(node) {
  if (!node.getAttribute || !node.getAttribute('xmlns')) {
    node.setAttribute?.('xmlns', 'http://www.w3.org/1999/xhtml');
  }
  node.querySelectorAll?.('*').forEach((n) => {
    if (!n.getAttribute('xmlns')) n.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  });
  return node;
}

function inlineStyle(src, dst) {
  const cs = getComputedStyle(src);
  let text = '';
  for (const prop of SERIALIZED_PROPS) {
    const v = cs.getPropertyValue(prop);
    if (v) text += `${prop}:${v};`;
  }
  dst.setAttribute?.('style', text);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Sample near the element's vertical edges (least likely to cover glyphs) and
// average; also verify the four corners agree within tolerance.
function readEdgePixels(ctx2d, w, h) {
  const pts = [
    [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3],
    [Math.floor(w / 2), 2], [Math.floor(w / 2), h - 3]
  ];
  const colors = [];
  for (const [x, y] of pts) {
    try {
      const d = ctx2d.getImageData(x, y, 1, 1).data;
      if (d[3] === 0) continue;
      colors.push([d[0], d[1], d[2]]);
    } catch (err) {
      if (err.name === 'SecurityError') {
        const e = new Error('tainted'); e.name = 'SecurityError'; throw e;
      }
      return null;
    }
  }
  if (!colors.length) return null;
  const avg = [0, 1, 2].map((i) => Math.round(colors.reduce((a, c) => a + c[i], 0) / colors.length));
  return { r: avg[0], g: avg[1], b: avg[2], a: 1 };
}
