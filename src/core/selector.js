import { tagOf, attr } from './dom-utils.js';

// Minimal selector engine: supports comma groups, descendant combinators,
// tag, #id, .class, [attr], [attr="v"] and the custom shadow piercing token
// "::shadow" (boundary between a host and its shadow tree).
// Returns true if `el` (anywhere in the flattened tree) matches any selector.
export function matches(el, selector, root) {
  if (!selector) return false;
  return selector.split(',').some((s) => matchOne(el, s.trim(), root));
}

function matchOne(el, selector, root) {
  const groups = tokenize(selector);
  return matchGroups(el, groups, groups.length - 1, root);
}

// Split into simple-selector groups on descendant whitespace, honoring ::shadow.
function tokenize(selector) {
  const tokens = [];
  for (const part of selector.split(/\s*>\s*/)) {
    const t = part.trim();
    if (t === '::shadow' || t === '') continue;
    tokens.push(t);
  }
  // plain descendant split when no > used: split on whitespace not inside []
  if (!selector.includes('>')) {
    return selector.match(/(\[[^\]]*\]|\S+)/g)?.filter((t) => t !== '::shadow') || [];
  }
  return tokens;
}

function matchGroups(el, groups, i, root) {
  let node = el;
  while (i >= 0 && node) {
    if (!simpleMatches(node, groups[i])) {
      // walk ancestors within the same root; crossing a shadow host counts too
    }
    if (simpleMatches(node, groups[i])) i--;
    if (i < 0) return true;
    const parent = node.parentElement;
    node = parent || node.getRootNode?.().host || null;
  }
  return false;
}

function simpleMatches(el, token) {
  // parse leading tag, then #id, .class and [..] parts
  const m = /^([a-z0-9-]*|\*)((?:[.#][\w-]+|\[[^\]]*\])*)$/i.exec(token);
  if (!m) return token === '*';
  const [, tag, rest] = m;
  if (tag && tag !== '*' && tagOf(el) !== tag.toLowerCase()) return false;
  const parts = rest.match(/[.#][\w-]+|\[[^\]]*\]/g) || [];
  for (const p of parts) {
    if (p[0] === '#') { if (attr(el, 'id') !== p.slice(1)) return false; }
    else if (p[0] === '.') {
      const cls = (attr(el, 'class') || '').split(/\s+/);
      if (!cls.includes(p.slice(1))) return false;
    } else {
      const am = /^\[([\w-]+)(?:([~|^$*]?=)"?([^"\]]*)"?)?\]$/.exec(p);
      if (!am) return false;
      const v = attr(el, am[1]);
      if (v == null) return false;
      if (am[2] && !attrOp(v, am[2], am[3])) return false;
    }
  }
  return true;
}

function attrOp(actual, op, expected) {
  switch (op) {
    case '=': return actual === expected;
    case '^=': return actual.startsWith(expected);
    case '$=': return actual.endsWith(expected);
    case '*=': return actual.includes(expected);
    case '~=': return actual.split(/\s+/).includes(expected);
    case '|=': return actual === expected || actual.startsWith(expected + '-');
    default: return true;
  }
}

// Determine whether a shadow-piercing selector applies to an element and
// return the inner selector after ::shadow (or null).
export function shadowInner(selector) {
  const idx = selector.indexOf('::shadow');
  if (idx === -1) return null;
  return selector.slice(idx + '::shadow'.length).trim().replace(/^>\s*/, '');
}
