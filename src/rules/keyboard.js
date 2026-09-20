import { attr, tagOf, resolveRole } from '../core/dom-utils.js';
import { tabbables, simulateFocusIndicators } from '../core/focus.js';
import { hasListener } from '../core/listener-tracker.js';

export default [
  {
    id: 'focus-indicator',
    description: 'Tabbable elements must show a visible focus indicator.',
    wcag: '2.4.7', impact: 'serious',
    async run(ctx) {
      const visibleTab = tabbables(ctx.elements).filter((el) => ctx.isVisible(el));
      const verdicts = simulateFocusIndicators(visibleTab, ctx);
      for (const v of verdicts) {
        if (v.verdict === 'removed') {
          ctx.report({
            el: v.el, impact: 'serious', wcag: '2.4.7',
            message: 'Focus outline is removed with no replacement (e.g. outline:none + no :focus style).',
            fix: 'Add a :focus-visible style such as outline: 2px solid Highlight or a box-shadow.',
            data: v.focus
          });
        } else if (v.verdict === 'none') {
          ctx.report({
            el: v.el, impact: 'moderate', wcag: '2.4.7',
            message: 'No style change detected between normal and :focus states.',
            fix: 'Provide a clearly visible :focus-visible style.',
            data: v.focus,
            incomplete: !ctx.probeFocus
          });
        }
      }
    }
  },
  {
    id: 'tabindex-positive',
    description: 'tabindex > 0 distorts the natural focus order.',
    wcag: '2.4.3', impact: 'moderate',
    run(ctx) {
      for (const el of ctx.elements) {
        const ti = parseInt(attr(el, 'tabindex') ?? '', 10);
        if (ti > 0) {
          ctx.report({
            el, impact: 'moderate', wcag: '2.4.3',
            message: `tabindex="${ti}" forces a custom tab position.`,
            fix: 'Use tabindex="0" and arrange elements in logical DOM order.'
          });
        }
      }
    }
  },
  {
    id: 'keyboard-accessible',
    description: 'Custom interactive elements must be keyboard operable.',
    wcag: '2.1.1', impact: 'critical',
    run(ctx) {
      for (const el of ctx.elements) {
        if (!ctx.isVisible(el)) continue;
        const t = tagOf(el);
        const role = resolveRole(el);
        const widgetRole = typeof role === 'string' &&
          ['button','link','checkbox','menuitem','menuitemcheckbox','menuitemradio','option',
           'radio','switch','tab','treeitem'].includes(role);
        const hasClick = hasListener(el, 'click');
        const hasKey = hasListener(el, 'keydown') || hasListener(el, 'keypress') || hasListener(el, 'keyup');
        const native = ['a','button','input','select','textarea','summary'].includes(t);
        if (!hasClick || native || !widgetRole) continue;
        if (!hasKey) {
          ctx.report({
            el, impact: 'critical', wcag: '2.1.1',
            message: `Element with click handler and role="${role}" has no keyboard handler.`,
            fix: 'Handle keydown for Enter (and Space for buttons), or use a native <button>.'
          });
        }
        if (attr(el, 'tabindex') == null) {
          ctx.report({
            el, impact: 'critical', wcag: '2.1.1',
            message: `Custom ${t} with role="${role}" is not in the tab order.`,
            fix: 'Add tabindex="0" or use a native interactive element.'
          });
        }
      }
    }
  },
  {
    id: 'duplicate-id',
    description: 'IDs must be unique so ARIA references resolve correctly.',
    wcag: '4.1.1', impact: 'serious',
    run(ctx) {
      // Scoped per root: duplicate ids inside the same shadow root/document.
      const perRoot = new Map();
      for (const el of ctx.elements) {
        const id = attr(el, 'id');
        if (!id) continue;
        const root = el.getRootNode ? el.getRootNode() : ctx.root;
        const map = perRoot.get(root) || new Map();
        map.set(id, (map.get(id) || 0) + 1);
        perRoot.set(root, map);
      }
      const seen = new Set();
      for (const el of ctx.elements) {
        const id = attr(el, 'id');
        if (!id) continue;
        const root = el.getRootNode ? el.getRootNode() : ctx.root;
        if (perRoot.get(root).get(id) > 1 && !seen.has(`${root === ctx.root ? 'doc' : 'shadow'}:${id}:${tagOf(el)}`)) {
          seen.add(`${root === ctx.root ? 'doc' : 'shadow'}:${id}:${tagOf(el)}`);
          ctx.report({
            el, impact: 'serious', wcag: '4.1.1',
            message: `Duplicate id "${id}" within the same DOM root.`,
            fix: 'Make ids unique; aria-labelledby/describedby may resolve to the wrong element.'
          });
        }
      }
    }
  }
];
