import { GLOBAL_ARIA, VALID_ROLES, ABSTRACT_ROLES } from './aria-data.js';

// ---------------------------------------------------------------------------
// Tree traversal that flattens open shadow roots. Closed shadow roots cannot be
// entered (the platform simply returns null) and are reported separately by the
// engine so users know part of the tree was hidden from the auditor.
// ---------------------------------------------------------------------------

export function openShadowRoot(node) {
  const sr = node.shadowRoot ?? node.__shadowRoot ?? null;
  return sr && sr.mode !== 'closed' ? sr : null;
}

export function* walkFlat(root) {
  yield root;
  const sr = root.nodeType === 1 ? openShadowRoot(root) : null;
  if (sr) yield* walkFlat(sr);
  const children = root.children || root.childNodes || [];
  for (const child of children) {
    if (child.nodeType === 1) yield* walkFlat(child);
  }
}

export function* allElements(root) {
  for (const node of walkFlat(root)) {
    if (node.nodeType === 1) yield node;
  }
}

export function tagOf(el) {
  return (el.tagName || el.nodeName || '').toLowerCase();
}

export function attr(el, name) {
  const v = el.getAttribute ? el.getAttribute(name) : null;
  return v == null ? null : String(v);
}

export function isHiddenAttr(el) {
  const hidden = attr(el, 'hidden');
  return hidden !== null && hidden !== 'false' && hidden !== 'until-found';
}

export function isVisible(el, ctx) {
  const cs = ctx.computed(el);
  if (!cs) return true;
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
  if (Number(cs.opacity) === 0) return false;
  let node = el;
  while (node) {
    if (isHiddenAttr(node)) return false;
    node = node.parentElement || node.getRootNode?.().host || null;
  }
  const r = ctx.rect(el);
  if (r && (r.width === 0 || r.height === 0)) return false;
  return true;
}

// Native role mapping (subset of ARIA in HTML).
const NATIVE_ROLES = {
  a: (el) => (attr(el, 'href') != null ? 'link' : null),
  button: () => 'button',
  input: (el) => inputRole(attr(el, 'type')),
  select: (el) => (el.size && Number(el.size) > 1 ? 'listbox' : 'combobox'),
  textarea: () => 'textbox',
  img: (el) => (attr(el, 'alt') === '' ? 'presentation' : 'img'),
  nav: () => 'navigation',
  main: () => 'main',
  header: (el) => (!el.closest?.('article,aside,main,nav,section') ? 'banner' : null),
  footer: (el) => (!el.closest?.('article,aside,main,nav,section') ? 'contentinfo' : null),
  aside: () => 'complementary',
  form: () => 'form',
  ul: () => 'list', ol: () => 'list',
  li: () => 'listitem',
  table: () => 'table', tr: () => 'row', td: () => 'cell',
  th: () => 'columnheader',
  h1: () => 'heading', h2: () => 'heading', h3: () => 'heading',
  h4: () => 'heading', h5: () => 'heading', h6: () => 'heading',
  dialog: () => 'dialog',
  progress: () => 'progressbar',
  hr: () => 'separator',
  figure: () => 'figure',
  figcaption: () => 'caption',
  fieldset: () => 'group',
  datalist: () => 'listbox',
  output: () => 'status',
  article: () => 'article',
  section: (el) => (accessibleName(el, new Set()) ? 'region' : null)
};

function inputRole(type) {
  switch ((type || 'text').toLowerCase()) {
    case 'button': case 'submit': case 'reset': case 'image': return 'button';
    case 'checkbox': return 'checkbox';
    case 'radio': return 'radio';
    case 'range': return 'slider';
    case 'search': return 'searchbox';
    case 'url': case 'email': case 'tel': case 'number': case 'password':
    case 'text': case '': return 'textbox';
    case 'hidden': return null;
    default: return 'textbox';
  }
}

// Resolve role with ARIA override. Returns null when the element has no role.
export function resolveRole(el) {
  const roleAttr = attr(el, 'role');
  if (roleAttr) {
    const first = roleAttr.trim().split(/\s+/)[0];
    if (first === 'none' || first === 'presentation') return 'presentation';
    if (VALID_ROLES.has(first) && !ABSTRACT_ROLES.has(first)) return first;
    return { invalid: first };
  }
  const t = tagOf(el);
  const fn = NATIVE_ROLES[t];
  return fn ? fn(el) : null;
}

// ---------------------------------------------------------------------------
// Accessible name (simplified accname 1.1): aria-label -> aria-labelledby ->
// native caption (label / alt / title / inner text).
// ---------------------------------------------------------------------------

export function getLabelNodes(el, ctx) {
  const ids = (attr(el, 'aria-labelledby') || '').split(/\s+/).filter(Boolean);
  const out = [];
  for (const id of ids) {
    const owner = el.getRootNode ? el.getRootNode() : ctx.root;
    const found = owner.getElementById ? owner.getElementById(id) : null;
    if (found) out.push(found);
  }
  return out;
}

export function nodeText(node, seen = new Set()) {
  if (!node || seen.has(node)) return '';
  seen.add(node);
  if (node.nodeType === 3) return node.nodeValue || '';
  if (node.nodeType !== 1) return '';
  if (tagOf(node) === 'img') return attr(node, 'alt') ?? '';
  let text = '';
  const sr = openShadowRoot(node);
  const kids = sr ? [...sr.childNodes] : [...(node.childNodes || [])];
  for (const child of kids) text += nodeText(child, seen);
  return text;
}

export function accessibleName(el, seen = new Set(), ctx = null) {
  if (!el || seen.has(el)) return '';
  seen.add(el);
  const ariaLabel = attr(el, 'aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  if (attr(el, 'aria-labelledby')) {
    const root = el.getRootNode ? el.getRootNode() : ctx?.root;
    const text = attr(el, 'aria-labelledby')
      .split(/\s+/)
      .map((id) => (root?.getElementById ? root.getElementById(id) : null))
      .map((n) => (n ? nodeText(n) : ''))
      .join(' ')
      .trim();
    if (text) return text;
  }
  const t = tagOf(el);
  if (t === 'img' || t === 'area' || t === 'input') {
    if (t === 'input' && ['button', 'submit', 'reset', 'image'].includes((attr(el, 'type') || '').toLowerCase())) {
      return (attr(el, 'value') || attr(el, 'title') || '').trim();
    }
    if (attr(el, 'alt') != null) return attr(el, 'alt').trim();
  }
  if (t === 'input' || t === 'textarea' || t === 'select') {
    const root = el.getRootNode ? el.getRootNode() : ctx?.root;
    const id = attr(el, 'id');
    if (id && root?.querySelector) {
      const lab = root.querySelector(`label[for="${cssEscape(id)}"]`);
      if (lab) return nodeText(lab).trim();
    }
    const wrapped = el.closest?.('label');
    if (wrapped) return nodeText(wrapped).replace(nodeText(el), '').trim() || nodeText(wrapped).trim();
    if (attr(el, 'title')) return attr(el, 'title').trim();
    return '';
  }
  if (t === 'a' && attr(el, 'title')) return attr(el, 'title').trim();
  if (t === 'button') return (nodeText(el) || attr(el, 'title') || attr(el, 'value') || '').trim();
  if (t === 'a') return (nodeText(el) || attr(el, 'title') || '').trim();
  if (t === 'svg' && attr(el, 'title')) return attr(el, 'title').trim();
  if (t === 'slot' && ctx) return '';
  const text = nodeText(el).replace(/\s+/g, ' ').trim();
  if (text) return text;
  if (attr(el, 'title')) return attr(el, 'title').trim();
  return '';
}

function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

// Element chain from a root to `el`, crossing shadow boundaries.
export function ancestorChain(el, root) {
  const chain = [];
  let node = el;
  while (node && node !== root) {
    chain.push(node);
    const p = node.parentElement;
    if (p) node = p;
    else {
      const r = node.getRootNode?.();
      node = r?.host || null;
    }
  }
  if (node === root) chain.push(root);
  chain.reverse();
  return chain;
}

// CSS-ish path that records shadow host crossings with "::shadow".
export function describePath(el, root) {
  const chain = ancestorChain(el, root);
  return chain
    .map((n) => {
      if (n === root) return tagOf(root) === '#document' ? 'document' : cssId(n) || tagOf(n);
      const prev = chain[chain.indexOf(n) - 1];
      if (prev && n.getRootNode?.() !== prev?.getRootNode?.()) return `::shadow > ${cssId(n) || tagOf(n)}`;
      return cssId(n) || tagOf(n);
    })
    .join(' > ');
}

function cssId(n) {
  const id = attr(n, 'id');
  return id ? `${tagOf(n)}#${id}` : null;
}

export function isInteractive(el) {
  const t = tagOf(el);
  if (['a', 'button', 'input', 'select', 'textarea', 'summary', 'option', 'audio', 'video', 'details'].includes(t)) {
    if (t === 'a' && attr(el, 'href') == null) {
      return attr(el, 'tabindex') != null || attr(el, 'role') === 'link';
    }
    return true;
  }
  const role = resolveRole(el);
  return typeof role === 'string' && ['button','link','checkbox','menuitem','menuitemcheckbox','menuitemradio',
    'option','radio','switch','tab','treeitem','combobox','textbox','searchbox','slider','spinbutton'].includes(role);
}

export function hasGlobalAria(el) {
  return [...GLOBAL_ARIA].some((a) => attr(el, a) != null);
}
