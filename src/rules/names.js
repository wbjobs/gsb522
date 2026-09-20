import { attr, tagOf, accessibleName, resolveRole } from '../core/dom-utils.js';

export default [
  {
    id: 'img-alt',
    description: 'Images must have alt text (empty allowed for decorative images).',
    wcag: '1.1.1', impact: 'critical',
    run(ctx) {
      for (const el of ctx.elements) {
        const t = tagOf(el);
        const role = resolveRole(el);
        if (t !== 'img' && t !== 'area' && role !== 'img') continue;
        if (t === 'input' && (attr(el, 'type') || '').toLowerCase() !== 'image') continue;
        if (t === 'svg') continue;
        if (attr(el, 'alt') == null) {
          const aria = attr(el, 'aria-label') || attr(el, 'aria-labelledby');
          if (aria) continue;
          if (t === 'img' && role === 'presentation') continue;
          ctx.report({
            el, impact: 'critical', wcag: '1.1.1',
            message: 'Image has no alt attribute.',
            fix: 'Add alt describing the image, or alt="" for purely decorative images.'
          });
        }
      }
    }
  },
  {
    id: 'button-name',
    description: 'Buttons must have an accessible name.',
    wcag: '4.1.2', impact: 'critical',
    run(ctx) {
      for (const el of ctx.elements) {
        if (!ctx.isVisible(el)) continue;
        const role = resolveRole(el);
        const isBtn = tagOf(el) === 'button' || role === 'button';
        if (!isBtn) continue;
        const name = accessibleName(el, new Set(), ctx);
        if (!name) {
          ctx.report({
            el, impact: 'critical', wcag: '4.1.2',
            message: 'Button has no accessible name.',
            fix: 'Add visible text, aria-label, aria-labelledby, or a titled icon.'
          });
        }
      }
    }
  },
  {
    id: 'link-name',
    description: 'Links must have an accessible name.',
    wcag: '4.1.1', impact: 'serious',
    run(ctx) {
      for (const el of ctx.elements) {
        if (!ctx.isVisible(el)) continue;
        const role = resolveRole(el);
        const t = tagOf(el);
        if (t !== 'a' && role !== 'link') continue;
        // A plain <a> with neither href nor role=link is not a link.
        if (t === 'a' && attr(el, 'href') == null && role !== 'link') continue;
        if (!accessibleName(el, new Set(), ctx)) {
          ctx.report({
            el, impact: 'serious', wcag: '4.1.1',
            message: 'Link has no accessible name.',
            fix: 'Add link text, aria-label, or title.'
          });
        }
      }
    }
  },
  {
    id: 'form-label',
    description: 'Form controls must have an accessible label.',
    wcag: '3.3.2 / 4.1.2', impact: 'critical',
    run(ctx) {
      for (const el of ctx.elements) {
        const t = tagOf(el);
        if (!['input', 'textarea', 'select'].includes(t)) continue;
        const type = (attr(el, 'type') || 'text').toLowerCase();
        if (['hidden', 'button', 'submit', 'reset', 'image'].includes(type)) continue;
        if (attr(el, 'aria-label') || attr(el, 'aria-labelledby')) continue;
        if (attr(el, 'title')) continue;
        const name = accessibleName(el, new Set(), ctx);
        if (!name) {
          ctx.report({
            el, impact: 'critical', wcag: '3.3.2',
            message: `${t}${type !== 'text' ? `[type=${type}]` : ''} has no label.`,
            fix: 'Associate a <label for="id">, wrap in <label>, or add aria-label/aria-labelledby.'
          });
        }
      }
    }
  },
  {
    id: 'empty-heading',
    description: 'Headings should contain non-empty accessible text.',
    wcag: '1.3.1', impact: 'moderate',
    run(ctx) {
      for (const el of ctx.elements) {
        const t = tagOf(el);
        const role = resolveRole(el);
        if (!['h1','h2','h3','h4','h5','h6'].includes(t) && role !== 'heading') continue;
        if (!accessibleName(el, new Set(), ctx)) {
          ctx.report({
            el, impact: 'moderate', wcag: '1.3.1',
            message: 'Heading element has no text content.',
            fix: 'Add heading text or remove the empty heading.'
          });
        }
      }
    }
  },
  {
    id: 'generic-click-name',
    description: 'Interactive non-semantic elements should expose a name.',
    wcag: '4.1.2', impact: 'moderate',
    run(ctx) {
      for (const el of ctx.elements) {
        const role = resolveRole(el);
        const t = tagOf(el);
        if (!['div','span'].includes(t)) continue;
        const widget = typeof role === 'string' &&
          ['button','link','checkbox','tab','menuitem','option'].includes(role);
        if (!widget) continue;
        if (!accessibleName(el, new Set(), ctx)) {
          ctx.report({
            el, impact: 'moderate', wcag: '4.1.2',
            message: `Custom ${t} with role="${role}" has no accessible name.`,
            fix: 'Add aria-label, visible text, or aria-labelledby.'
          });
        }
      }
    }
  }
];
