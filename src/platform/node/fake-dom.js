// Minimal DOM implementation used by the Node test harness. It models just
// what the audit engine touches: elements, text nodes, (open/closed) shadow
// roots, attributes, computed styles, layout rects and recorded listeners.
let uid = 0;

export class FakeNode {
  constructor(nodeName, nodeType = 1) {
    this.nodeName = nodeName;
    this.tagName = nodeType === 1 ? nodeName.toUpperCase() : nodeName;
    this.nodeType = nodeType;
    this.nodeValue = nodeType === 3 ? nodeName : '';
    this.childNodes = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.__computed = {};
    this.__rect = { width: 20, height: 12 };
    this.__events = [];
    this.shadowRoot = null;
    this.ownerDocument = null;
    this.uid = ++uid;
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  appendChild(child) {
    child.remove?.();
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument || (this.nodeType === 9 ? this : this.ownerDocument);
    this.childNodes.push(child);
    if (child.nodeType === 1 && child.ownerDocument) propagateDoc(child, child.ownerDocument);
    notifyObservers(this, child, 'childList');
    return child;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    notifyObservers(this, this, 'attributes', name);
  }
  remove() {
    if (this.parentElement) {
      const i = this.parentElement.childNodes.indexOf(this);
      if (i >= 0) this.parentElement.childNodes.splice(i, 1);
      this.parentElement = null;
    }
  }
  contains(other) {
    let n = other;
    while (n) {
      if (n === this) return true;
      n = n.parentElement || (n.getRootNode?.()?.host ?? null);
    }
    return false;
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  getAttributeNames() { return [...this.attributes.keys()]; }
  hasAttribute(name) { return this.attributes.has(name); }
  attachShadow(init = {}) {
    const root = new FakeDocumentFragment(init.mode || 'open', this);
    if (root.mode === 'open') this.shadowRoot = root;
    else this.shadowRoot = null;
    // expose closed root for tests only via __shadowRoot
    this.__shadowRoot = root;
    root.host = this;
    return root;
  }
  getRootNode() {
    let n = this;
    while (n.parentElement) n = n.parentElement;
    if (n.__isShadowRoot) return n;
    return n.ownerDocument || n;
  }
  closest(sel) {
    let n = this;
    while (n) {
      if (n.nodeType === 1 && fakeMatches(n, sel)) return n;
      n = n.parentElement;
    }
    return null;
  }
  addEventListener(type) { this.__events.push(String(type).toLowerCase()); }
  setComputed(style) { Object.assign(this.__computed, style); return this; }
  setRect(rect) { Object.assign(this.__rect, rect); return this; }
  getBoundingClientRect() { return { ...this.__rect, left: 0, top: 0 }; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  querySelector(sel) { return findFirst(this, sel); }
  querySelectorAll(sel) { return findAll(this, sel); }
  get textContent() {
    return this.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.textContent)).join('');
  }
  get outerHTML() {
    const attrs = [...this.attributes].map(([k, v]) => ` ${k}="${v}"`).join('');
    const inner = this.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.outerHTML)).join('');
    return `<${this.nodeName}${attrs}>${inner}</${this.nodeName}>`;
  }
  get style() {
    const el = this;
    return new Proxy({}, {
      set(_, prop, val) {
        el.__computed[toCss(prop)] = String(val);
        return true;
      },
      get(_, prop) { return el.__computed[toCss(prop)] || ''; }
    });
  }
  cloneNode(deep) {
    const c = new FakeNode(this.nodeName, this.nodeType);
    for (const [k, v] of this.attributes) c.setAttribute(k, v);
    if (deep) for (const ch of this.childNodes) c.appendChild(ch.cloneNode(true));
    return c;
  }
}

function toCss(p) {
  return String(p).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function propagateDoc(node, doc) {
  node.ownerDocument = doc;
  for (const child of node.childNodes) if (child.nodeType === 1) propagateDoc(child, doc);
  if (node.shadowRoot) for (const child of node.shadowRoot.children) propagateDoc(child, doc);
}

export class FakeDocument extends FakeNode {
  constructor() {
    super('#document', 9);
    this.ownerDocument = this;
    this.activeElement = null;
    this.__isDocument = true;
  }
  get documentElement() { return this.children.find((n) => n.nodeName === 'html') || null; }
  getElementById(id) { return findAll(this, `[id="${id}"]`)[0] || null; }
  createElement(tag) { const el = new FakeNode(tag, 1); el.ownerDocument = this; return el; }
  createTextNode(text) { const t = new FakeNode(text, 3); t.ownerDocument = this; return t; }
}

export class FakeDocumentFragment extends FakeNode {
  constructor(mode, host) {
    super('#shadow-root', 11);
    this.mode = mode;
    this.host = host;
    this.__isShadowRoot = true;
    this.ownerDocument = host.ownerDocument;
  }
  getElementById(id) { return findAll(this, `[id="${id}"]`)[0] || null; }
}

// --- tiny selector helpers sufficient for the platform's own queries -------
function findFirst(root, sel) { return findAll(root, sel)[0] || null; }
function findAll(root, sel) {
  const out = [];
  const tag = sel.match(/^[a-zA-Z0-9-]+/)?.[0];
  const idM = /\[id="([^"]+)"\]/.exec(sel);
  const attrM = /^\[([\w-]+)(?:\^?="?([^"\]]*)"?)?\]$/.exec(sel.trim());
  const forM = /\[for="([^"]+)"\]/.exec(sel);
  walk(root, (el) => {
    if (tag && el.nodeName !== tag) return;
    if (idM && el.getAttribute('id') !== idM[1]) return;
    if (forM && el.getAttribute('for') !== forM[1]) return;
    if (attrM && !idM && !forM) {
      if (el.getAttribute(attrM[1]) == null) return;
    }
    if (!tag && !idM && !attrM && !forM) return;
    out.push(el);
  });
  return out;
}

function walk(node, fn) {
  for (const child of node.childNodes) {
    if (child.nodeType === 1) { fn(child); walk(child, fn); }
    if (child.nodeType === 1 && child.shadowRoot) walk(child.shadowRoot, fn);
  }
}

function fakeMatches(el, sel) {
  const tag = sel.match(/^[a-zA-Z0-9-]+/)?.[0];
  return !tag || el.nodeName === tag;
}


// --- minimal MutationObserver model used by the dynamic watcher ----------
const OBSERVERS = new Set();
export function __installMutationObserver(global = globalThis) {
  global.MutationObserver = class FakeMutationObserver {
    constructor(cb) { this.cb = cb; this.takeRecords = () => []; }
    observe(root, opts) { this.root = root; this.opts = opts; OBSERVERS.add(this); }
    disconnect() { OBSERVERS.delete(this); }
  };
  global.MutationObserver.__reset = () => OBSERVERS.clear();
}
function notifyObservers(target, node, type, attrName) {
  for (const obs of OBSERVERS) {
    if (type === 'attributes' && obs.opts?.attributeFilter &&
        !obs.opts.attributeFilter.includes(attrName)) continue;
    obs.cb([{ type, target, addedNodes: [node], attributeName: attrName }]);
  }
}
