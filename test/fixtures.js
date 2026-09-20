import { FakeDocument, FakeNode, defaultComputed } from '../src/platform/node/index.js';

// h('p', { attrs:{class:'x'}, style:{color:'#aaa'}, events:['click'], rect:{width:0} }, 'text', child)
export function h(tag, props = {}, ...children) {
  const el = new FakeNode(tag, 1);
  el.__computed = defaultComputed(tag);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.style) for (const [k, v] of Object.entries(props.style)) el.__computed[camel(k)] = v;
  if (props.events) el.__events.push(...props.events);
  if (props.rect) el.setRect(props.rect);
  if (props.shadow) {
    const mode = props.shadow.mode || 'open';
    const root = el.attachShadow({ mode });
    const add = (child) => { child.ownerDocument = el.ownerDocument; root.appendChild(child); };
    for (const child of normalizeChildren(props.shadow.children)) add(child);
  }
  for (const child of normalizeChildren(children)) el.appendChild(child);
  return el;
}

function normalizeChildren(children) {
  return children.flat().map((c) => (typeof c === 'string' || typeof c === 'number'
    ? (() => { const t = new FakeNode(String(c), 3); return t; })()
    : c));
}

function camel(k) {
  return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function docWith(...children) {
  const doc = new FakeDocument();
  for (const child of children.flat()) {
    child.ownerDocument = doc;
    doc.appendChild(child);
  }
  return doc;
}

export function htmlDoc({ lang = 'en', title = 'Test page', body = [], skipMain = false } = {}) {
  const titleEl = h('title', {}, title);
  const head = h('head', {}, titleEl);
  const main = h('main', {}, h('h1', {}, 'Main heading'), ...body);
  const html = h('html', lang ? { attrs: { lang } } : {}, head, h('body', {}, skipMain ? h('div', {}, ...body) : main));
  const doc = docWith(html);
  return { doc, html };
}

export function findRules(report) {
  return report.findings.reduce((acc, f) => {
    (acc[f.ruleId] ||= []).push(f);
    return acc;
  }, {});
}
