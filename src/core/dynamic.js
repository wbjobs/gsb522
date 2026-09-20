import { allShadowRoots } from './focus.js';

// Watches document + all open shadow roots for mutations and re-audits the
// affected subtree after a debounce. Newly attached shadow roots are wired
// up automatically.
export function observe(auditor, options = {}) {
  const debounceMs = options.debounceMs ?? 300;
  const observers = [];
  let timer = null;
  const seenRoots = new Set();

  const schedule = (targets) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      wireRoots();
      const result = await auditor.reaudit(targets);
      auditor.emit?.('dynamic', result);
    }, debounceMs);
  };

  const makeObserver = (root) => {
    if (typeof root.ownerDocument?.defaultView?.MutationObserver === 'function') {
      return new root.ownerDocument.defaultView.MutationObserver((muts) => {
        const targets = [...new Set(muts.map((m) => m.target).filter((t) => t.nodeType === 1))];
        schedule(targets);
      });
    }
    if (typeof MutationObserver === 'function') {
      return new MutationObserver((muts) => {
        const targets = [...new Set(muts.map((m) => m.target).filter((t) => t.nodeType === 1))];
        schedule(targets);
      });
    }
    return null;
  };

  function wireRoots() {
    const roots = [auditor.ctx.root, ...allShadowRoots(auditor.ctx.root)];
    for (const root of roots) {
      if (seenRoots.has(root)) continue;
      seenRoots.add(root);
      const obs = makeObserver(root);
      if (!obs) continue;
      obs.observe(root, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['role','class','style','tabindex','alt','title','lang','hidden','aria-label','aria-labelledby','aria-hidden','id','for','href']
      });
      observers.push(obs);
    }
  }

  wireRoots();
  return {
    disconnect() {
      if (timer) clearTimeout(timer);
      observers.forEach((o) => o.disconnect());
      observers.length = 0;
      seenRoots.clear();
    },
    refresh: wireRoots
  };
}
