// Tracks which event types an element has listeners for.
//
// In the browser this module exposes `instrument(root)` which must run before
// page handlers are registered (e.g. via the bootstrap snippet) to wrap
// addEventListener. It also exposes `recordEvent(el, type)` so the platform
// layer can feed it data any other way. In the node test platform events are
// declared directly on fake elements (__events).

const EVENT_MAP = new WeakMap();

function ensure(el) {
  let set = EVENT_MAP.get(el);
  if (!set) { set = new Set(); EVENT_MAP.set(el, set); }
  return set;
}

export function recordEvent(el, type) {
  ensure(el).add(String(type).toLowerCase());
}

export function hasListener(el, type) {
  const t = String(type).toLowerCase();
  return EVENT_MAP.get(el)?.has(t) || (el.__events || []).includes(t);
}

export function eventTypes(el) {
  const s = new Set(EVENT_MAP.get(el) || []);
  for (const t of el.__events || []) s.add(t);
  return s;
}

export function instrument(target = typeof globalThis !== 'undefined' ? globalThis : null) {
  if (!target || target.__a11yInstrumented) return () => {};
  target.__a11yInstrumented = true;
  const proto = target.EventTarget && target.EventTarget.prototype;
  if (!proto) return () => {};
  const original = proto.addEventListener;
  proto.addEventListener = function (type, listener, options) {
    try {
      if (this && this.nodeType === 1) recordEvent(this, type);
    } catch { /* cross-realm element */ }
    return original.call(this, type, listener, options);
  };
  return () => {
    proto.addEventListener = original;
    delete target.__a11yInstrumented;
  };
}
