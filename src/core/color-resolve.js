import { parseColor, flattenColor, stackOpacity } from './color.js';
import { ancestorChain } from './dom-utils.js';

// Resolve an element's text color against its effective background by walking
// the ancestor chain inside the current root. Background images / gradients
// cannot be computed from CSS alone; the platform layer may pass a `sample`
// callback that returns actual rendered pixel data (via canvas).
//
// Returns { fg, bg, ratio, source, incomplete }
export function resolveColors(el, ctx) {
  const cs = ctx.computed(el);
  const root = ctx.root;
  const chain = ancestorChain(el, root);

  const fg0 = parseColor(cs?.color) || parseColor('#000000');
  const opacity = stackOpacity(chain);
  const fg = { ...fg0, a: fg0.a * opacity };

  // Canvas/framebuffer sampling takes priority (handles gradients & images).
  if (ctx.sampleBackground) {
    const sampled = ctx.sampleBackground(el, chain);
    if (sampled && sampled.color) {
      const bg = sampled.color;
      return { fg, bg, source: sampled.source || 'canvas', incomplete: !!sampled.incomplete, taint: sampled.taint };
    }
  }

  // Walk from the outermost ancestor inward compositing translucent backgrounds.
  let backdrop = parseColor(ctx.canvasBackground || '#ffffff');
  let incomplete = false;
  for (const node of chain) {
    const ncs = ctx.computed(node);
    const bgImage = ncs?.backgroundImage && ncs.backgroundImage !== 'none';
    if (bgImage) incomplete = true;
    const bg = parseColor(ncs?.backgroundColor);
    if (bg) backdrop = flattenColor({ ...bg }, backdrop);
    const op = Number(ncs?.opacity);
    if (Number.isFinite(op) && op < 1) backdrop = { ...backdrop };
  }
  return { fg, bg: backdrop, source: 'computed-style', incomplete };
}

// Text-bearing leaf elements for contrast testing. We dedupe nested
// candidates so a <p> and its <span> with identical computed colors are not
// reported twice.
export function textCandidates(elements) {
  const out = [];
  for (const el of elements) {
    const text = directText(el);
    if (!text) continue;
    const cs = el.__computed || {};
    const role = el.__roleCache;
    if (role === 'presentation' && !text) continue;
    out.push({ el, text });
  }
  return dedupe(out);
}

export function directText(el) {
  const nodes = el.childNodes || [];
  let text = '';
  for (const node of nodes) {
    if (node.nodeType === 3) text += node.nodeValue || '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

function dedupe(candidates) {
  const result = [];
  for (const c of candidates) {
    const cs = c.el.__computed;
    const dup = result.find((r) =>
      r.el.contains?.(c.el) &&
      sameColor(r.el.__computed?.color, cs?.color) &&
      sameColor(r.el.__computed?.backgroundColor, cs?.backgroundColor));
    if (!dup) result.push(c);
  }
  return result;
}

function sameColor(a, b) {
  return (a || '') === (b || '');
}
