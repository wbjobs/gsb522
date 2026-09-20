import { test } from 'node:test';
import assert from 'node:assert/strict';

// The browser platform touches real browser globals. Build a small DOM/window
// stub sufficient to run an end-to-end audit outside of a browser, exercising
// the focus probe, worker Blob URL creation, export and download paths.
test('browser platform runs end to end under a stub environment', async () => {
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.nodeName = tag;
      this.nodeType = 1;
      this.childNodes = [];
      this.parentElement = null;
      this.attributes = new Map();
      this._style = new Map();
      this._listeners = new Map();
      this.shadowRoot = null;
    }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    appendChild(c) { c.remove?.(); c.parentElement = this; this.childNodes.push(c); c.ownerDocument = doc;
      if (c.getRootNode && !c.__rootGet) { /* inherit doc */ } return c; }
    remove() { if (this.parentElement) { const i = this.parentElement.childNodes.indexOf(this); if (i>=0) this.parentElement.childNodes.splice(i,1); this.parentElement = null; } }
    contains(o) { let n = o; while (n) { if (n === this) return true; n = n.parentElement; } return false; }
    getAttribute(n) { return this.attributes.has(n) ? this.attributes.get(n) : null; }
    setAttribute(n, v) { this.attributes.set(n, String(v)); }
    getAttributeNames() { return [...this.attributes.keys()]; }
    attachShadow() {
      const host = this;
      return {
        mode: 'open', host, childNodes: [],
        get children() { return this.childNodes.filter((n) => n.nodeType === 1); },
        appendChild(c) { c.parentElement = { getRootNode: () => this }; this.childNodes.push(c); c.__root = this; return c; },
        getElementById(id) { return findId(this, id); },
        querySelector() { return null; }
      };
    }
    getRootNode() {
      let n = this;
      while (n.parentElement && n.parentElement.nodeType !== 11) n = n.parentElement;
      return n.__root || doc;
    }
    closest() { return null; }
    addEventListener(t, fn) { (this._listeners.get(t) || this._listeners.set(t, []).get(t)).push(fn); }
    dispatchEvent(e) { (this._listeners.get(e.type) || []).forEach((fn) => fn(e)); return true; }
    focus() { doc.activeElement = this; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 40, height: 16 }; }
    get style() {
      const el = this;
      return new Proxy({}, { set: (_, p, v) => { el._style.set(p, v); return true; }, get: (_, p) => el._style.get(p) || '' });
    }
    get outerHTML() { return `<${this.nodeName}${[...this.attributes].map(([k,v])=>` ${k}="${v}"`).join('')}></${this.nodeName}>`; }
    click() { this.dispatchEvent({ type: 'click' }); }
    querySelector() { return null; }
  }
  class Txt {
    constructor(t) { this.nodeType = 3; this.nodeValue = t; this.parentElement = null; }
    get nodeName() { return '#text'; }
  }
  function findId(root, id) {
    for (const n of root.childNodes) {
      if (n.getAttribute && n.getAttribute('id') === id) return n;
      const f = n.shadowRoot && findId(n.shadowRoot, id);
      if (f) return f;
      if (n.childNodes) { const f2 = findId(n, id); if (f2) return f2; }
    }
    return null;
  }
  function getComputedStyle(el) {
    return new Proxy({
      display: 'block', visibility: 'visible', opacity: '1',
      fontSize: el._font || '16px', fontWeight: '400',
      outlineWidth: el === outlineKiller ? '0px' : '1px',
      outlineStyle: el === outlineKiller ? 'none' : 'auto',
      outlineColor: 'rgb(0,0,0)', borderWidth: '0px', borderStyle: 'none',
      borderColor: 'rgb(0,0,0)', boxShadow: 'none',
      color: el._color || 'rgb(0,0,0)',
      backgroundColor: el._bg || 'rgba(0,0,0,0)', backgroundImage: 'none',
      getPropertyValue(p) { return this[p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? ''; }
    }, {
      get(t, p) { return t[p] ?? ''; },
      set(t, p, v) { t[p] = v; return true; },
      defineProperty(t, p, desc) { t[p] = desc.value; return true; }
    });
  }

  const doc = new El('#document');
  doc.nodeType = 9;
  doc.documentElement = new El('html');
  doc.documentElement.setAttribute('lang', 'en');
  doc.ownerDocument = doc;
  doc.activeElement = null;
  doc.createElement = (t) => new El(t);
  doc.querySelector = () => null;
  doc.defaultView = null;

  const body = new El('body'); doc.appendChild(doc.documentElement); doc.appendChild(body);
  const p = new El('p'); p._color = 'rgb(170,170,170)'; p._bg = 'rgb(255,255,255)';
  p.appendChild(new Txt('dim text'));
  body.appendChild(p);
  const img = new El('img'); img.setAttribute('src', 'x.png'); body.appendChild(img);
  const outlineKiller = new El('button'); outlineKiller.appendChild(new Txt('no ring'));
  body.appendChild(outlineKiller);
  globalThis.outlineKiller = outlineKiller;

  // Browser globals
  globalThis.URL = { createObjectURL: () => 'blob:stub', revokeObjectURL() {} };
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
  globalThis.Worker = class {
    constructor(url) { this.url = url; this._msg = null; }
    addEventListener(t, fn) { if (t === 'message') this._msg = fn; }
    removeEventListener() {}
    postMessage(msg) {
      // Mirror worker-source.js contrast handling.
      function lum(c) {
        const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      }
      function ratio(a, b) {
        const l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      }
      const payload = (msg.items || []).map((t) => {
        if (t.type === 'contrast' && t.fgArr) return { ...t, ratio: ratio(t.fgArr, t.bgArr) };
        return t;
      });
      setTimeout(() => this._msg({ data: { id: msg.id, payload } }), 0);
    }
  };
  globalThis.getComputedStyle = getComputedStyle;
  globalThis.MutationObserver = class { observe(){} disconnect(){} };
  globalThis.XMLSerializer = class { serializeToString() { return '<div xmlns="http://www.w3.org/1999/xhtml"></div>'; } };
  globalThis.Image = class { set src(v) { this._v = v; setTimeout(() => this.onerror?.(new Error('stub-no-image')), 0); } get src(){ return this._v; } };

  const { createAuditor } = await import('../src/platform/browser/index.js');
  const auditor = createAuditor({
    document: doc,
    // no window/location in this stub
    contrast: { canvas: false },
    focus: true,
    workers: { enabled: true, minBatch: 1 }
  });
  const report = await auditor.audit();
  const ids = new Set(report.findings.map((f) => f.ruleId));
  assert.ok(ids.has('color-contrast'), 'contrast ran in browser platform');
  assert.ok(ids.has('img-alt'));
  assert.ok(ids.has('focus-indicator'));

  const json = auditor.exportReport(report, 'json');
  assert.ok(JSON.parse(json).findings.length > 0);
  assert.ok(auditor.exportReport(report, 'csv').includes('color-contrast'));
  assert.ok(auditor.exportReport(report, 'html').includes('<table>'));
  assert.ok(auditor.exportReport(report, 'md').startsWith('# Accessibility'));

  for (const k of ['URL','Blob','Worker','MutationObserver','XMLSerializer','Image','getComputedStyle']) {
    try { delete globalThis[k]; } catch {}
  }
});
