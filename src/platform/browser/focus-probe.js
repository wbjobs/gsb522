// Real focus simulation: save the current active element and scroll
// position, focus each control, read its computed style, then restore.
// This captures :focus and :focus-visible rules exactly as users see them.
export function createFocusProbe(doc, win) {
  return function probeFocus(el) {
    const active = doc.activeElement;
    const sx = win?.scrollX ?? 0, sy = win?.scrollY ?? 0;
    let style = null;
    try {
      if (typeof el.focus === 'function') {
        el.focus({ preventScroll: true });
        style = snapshot(getComputedStyle(el));
      }
    } catch {
      style = null;
    } finally {
      try { if (active && typeof active.focus === 'function') active.focus({ preventScroll: true }); } catch { /* noop */ }
      win?.scrollTo?.(sx, sy);
    }
    return style;
  };
}

function snapshot(cs) {
  const out = {};
  for (const k of ['outlineWidth','outlineStyle','outlineColor','borderWidth','borderTopWidth',
    'borderStyle','borderColor','boxShadow','backgroundColor','color']) {
    out[k] = cs[k];
  }
  return out;
}
