import { tagOf, attr, resolveRole, openShadowRoot } from './dom-utils.js';

// Elements participating in the sequential focus navigation order.
// Shadow DOM delegatesFocus is honored: tabindex on a shadow host forwards
// into the shadow tree.
export function tabbables(elements) {
  const out = [];
  for (const el of elements) {
    if (!isFocusable(el)) continue;
    const tabindex = parseInt(attr(el, 'tabindex') ?? '', 10);
    out.push({ el, tabindex: Number.isNaN(tabindex) ? 0 : tabindex });
  }
  // Tab order: positive tabindex values ascending first, then DOM order (0).
  return out
    .filter((t) => t.tabindex >= 0)
    .sort((a, b) => (a.tabindex === 0 ? 1 : 0) - (b.tabindex === 0 ? 1 : 0) || a.tabindex - b.tabindex)
    .map((t) => t.el);
}

export function isFocusable(el) {
  if (attr(el, 'disabled') != null || attr(el, 'inert') != null) return false;
  const t = tagOf(el);
  const native = ['a', 'button', 'input', 'select', 'textarea', 'summary', 'audio', 'video'].includes(t);
  if (native) {
    if (t === 'a' && attr(el, 'href') == null && attr(el, 'tabindex') == null) return false;
    if (t === 'input' && (attr(el, 'type') || '').toLowerCase() === 'hidden') return false;
    return true;
  }
  const tabindex = attr(el, 'tabindex');
  if (tabindex != null) return Number(tabindex) >= 0;
  const role = resolveRole(el);
  return typeof role === 'string' &&
    ['button','link','checkbox','menuitem','menuitemcheckbox','menuitemradio','option','radio',
      'switch','tab','treeitem','combobox','textbox','searchbox','slider','spinbutton'].includes(role);
}

// Focus-style simulation. `probe` is a platform callback that returns computed
// style for the element under :focus / :focus-visible. Returns a verdict per
// tabbable: 'ok' | 'removed' | 'none' | 'unknown'.
export function simulateFocusIndicators(els, ctx) {
  const results = [];
  for (const el of els) {
    const base = ctx.computed(el);
    const probed = ctx.probeFocus ? ctx.probeFocus(el) : null;
    const verdict = judge(base, probed, el);
    results.push({ el, verdict, base: brief(base), focus: brief(probed) });
  }
  return results;
}

function brief(cs) {
  if (!cs) return null;
  return {
    outline: `${cs.outlineWidth || ''} ${cs.outlineStyle || ''} ${cs.outlineColor || ''}`.trim(),
    border: `${cs.borderWidth || cs.borderTopWidth || ''} ${cs.borderStyle || ''} ${cs.borderColor || ''}`.trim(),
    boxShadow: cs.boxShadow || 'none',
    backgroundColor: cs.backgroundColor,
    color: cs.color
  };
}

function judge(base, focus, el) {
  if (!focus) return 'unknown';
  // Author explicitly removed the indicator (both states) and provides
  // nothing in its place. In real browsers the simulated :focus state would
  // also show a UA default ring, so equality plus explicit style:none here is
  // how we detect `outline:none` resets rather than default focus rings.
  const explicitlyRemoved = base?.outlineStyle === 'none' &&
    parseFloat(base.outlineWidth || '0') === 0 &&
    !hasReplacement(base) && isNoneOutline(focus) && !hasReplacement(focus);
  if (explicitlyRemoved) return 'removed';
  if (!styleEquals(base, focus)) return 'ok';
  // No difference AND no indicator in either state, on an element with no UA
  // default ring expectation (marked via outlineStyle 'none' baseline).
  if (base?.outlineStyle === 'none' && !hasReplacement(base) && !hasReplacement(focus)) {
    return 'none';
  }
  return 'ok';
}

function isNoneOutline(cs) {
  if (!cs) return true;
  const w = parseFloat(cs.outlineWidth);
  return cs.outlineStyle === 'none' || !w || w === 0;
}

function hasReplacement(cs) {
  if (!cs) return false;
  if (cs.boxShadow && cs.boxShadow !== 'none') return true;
  const bw = parseFloat(cs.borderWidth || cs.borderTopWidth);
  if (bw > 0 && cs.borderStyle && cs.borderStyle !== 'none') return true;
  return false;
}

function styleEquals(a, b) {
  if (!a || !b) return false;
  const keys = ['outlineWidth','outlineStyle','outlineColor','borderWidth','borderStyle','borderColor','boxShadow','backgroundColor','color'];
  return keys.every((k) => (a[k] || '') === (b[k] || ''));
}

// Collect all shadow roots (open) for observer wiring.
export function* allShadowRoots(root) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    const sr = node.nodeType === 1 ? openShadowRoot(node) : null;
    if (sr) { yield sr; stack.push(sr); }
    const kids = node.children || node.childNodes || [];
    for (const child of kids) {
      if (child.nodeType === 1) stack.push(child);
    }
  }
}
