import { attr, tagOf } from '../core/dom-utils.js';

const headingLevel = (el) => {
  const t = tagOf(el);
  const m = /^h([1-6])$/.exec(t);
  if (m) return Number(m[1]);
  const level = Number(attr(el, 'aria-level'));
  if (/^h[1-6]$/.test(t) === false && attr(el, 'role') === 'heading' && level >= 1 && level <= 6) return level;
  return m ? Number(m[1]) : null;
};

export default [
  {
    id: 'heading-order',
    description: 'Heading levels must not skip (h1 -> h3 without h2).',
    wcag: '1.3.1', impact: 'moderate',
    run(ctx) {
      // Track per DOM root (document and each shadow root independently).
      const perRoot = new Map();
      for (const el of ctx.elements) {
        const level = headingLevel(el);
        if (level == null) continue;
        const root = el.getRootNode ? el.getRootNode() : ctx.root;
        const state = perRoot.get(root) || { prev: 0 };
        if (state.prev && level > state.prev + 1) {
          ctx.report({
            el, impact: 'moderate', wcag: '1.3.1',
            message: `Heading level skipped from h${state.prev} to h${level}.`,
            fix: `Use h${state.prev + 1}, or adjust the document outline.`
          });
        }
        state.prev = level;
        perRoot.set(root, state);
      }
    }
  },
  {
    id: 'html-lang',
    description: '<html> must declare a valid lang attribute.',
    wcag: '3.1.1', impact: 'moderate',
    run(ctx) {
      const html = ctx.root.documentElement || ctx.root;
      if (tagOf(html) !== 'html') return;
      const lang = attr(html, 'lang');
      if (!lang || !/^[a-zA-Z]{2,3}(-[A-Za-z0-9]+)*$/.test(lang)) {
        ctx.report({
          el: html, impact: 'moderate', wcag: '3.1.1',
          message: lang ? `Invalid lang value "${lang}".` : 'Document has no lang attribute.',
          fix: 'Set <html lang="en"> (or the correct BCP-47 language tag).'
        });
      }
    }
  },
  {
    id: 'document-title',
    description: 'Document must have a non-empty <title>.',
    wcag: '2.4.2', impact: 'moderate',
    run(ctx) {
      const doc = ctx.root.nodeType === 9 ? ctx.root : ctx.root.ownerDocument;
      if (!doc) return;
      const titleEl = doc.querySelector ? doc.querySelector('title') : null;
      const title = (titleEl?.textContent || '').trim();
      if (!title) {
        ctx.report({
          el: titleEl || doc.documentElement || doc, impact: 'moderate', wcag: '2.4.2',
          message: 'Document has no <title>.',
          fix: 'Add a descriptive <title> in <head>.'
        });
      }
    }
  },
  {
    id: 'bypass-blocks',
    description: 'Pages should offer a way to bypass repeated navigation.',
    wcag: '2.4.1', impact: 'minor',
    run(ctx) {
      const doc = ctx.root.nodeType === 9 ? ctx.root : ctx.root.ownerDocument;
      if (!doc || !doc.querySelector) return;
      const hasSkip = doc.querySelector('a[href^="#"],[role="navigation"],nav,[accesskey]');
      const main = doc.querySelector('main,[role="main"]');
      if (!hasSkip || !main) {
        ctx.report({
          el: doc.documentElement || doc, impact: 'minor', wcag: '2.4.1',
          message: 'No skip link, landmark, or access key to bypass repeated blocks.',
          fix: 'Add a "skip to main content" link and a <main> landmark.'
        });
      }
    }
  },
  {
    id: 'no-blink-marquee',
    description: '<blink> and <marquee> violate WCAG pause/stop requirements.',
    wcag: '2.2.2', impact: 'moderate',
    run(ctx) {
      for (const el of ctx.elements) {
        const t = tagOf(el);
        if (t === 'blink' || t === 'marquee') {
          ctx.report({
            el, impact: 'moderate', wcag: '2.2.2',
            message: `<${t}> creates auto-moving/blinking content users cannot always stop.`,
            fix: 'Replace with static content or a controlled, pausable animation.'
          });
        }
      }
    }
  }
];
