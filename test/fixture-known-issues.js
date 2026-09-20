import { h } from './fixtures.js';

// A page deliberately riddled with well-known accessibility defects.
// Also embeds a shadow tree containing its own defects, to verify shadow DOM
// traversal and per-root id/heading/contrast checks.
export function buildKnownIssuesPage() {
  const shadowBtn = h('button', {}, ''); // button without name, inside shadow
  const shadowLink = h('a', { attrs: { href: '#' }, style: { color: '#aaaaaa', backgroundColor: 'rgb(255,255,255)' } },
    ''); // link, low contrast, no name
  const shadowInput = h('input', { attrs: { type: 'text', id: 'sh-in' } }); // unlabeled
  const shadowH1 = h('h1', {}, 'Shadow title');
  const shadowH3 = h('h3', {}, 'Skipped heading'); // h1 -> h3
  const shadowLowText = h('p', {
    style: { color: 'rgb(170,170,170)', backgroundColor: 'rgb(255,255,255)' }
  }, 'Dim text inside the shadow tree.');
  const host = h('div', {
    attrs: { id: 'comp' },
    shadow: {
      children: [shadowH1, shadowH3, shadowBtn, shadowLink, shadowInput, shadowLowText]
    }
  });

  const badContrast = h('p', {
    style: { color: 'rgb(170,170,170)', backgroundColor: 'rgb(255,255,255)' }
  }, 'This light gray text is too low contrast.');

  const noAlt = h('img', { attrs: { src: '/x.png' } });

  const clickDiv = h('div', {
    attrs: { role: 'button' },
    events: ['click'],
    style: { display: 'block', cursor: 'pointer' }
  }, 'Submit');

  const nakedTab = h('span', { attrs: { tabindex: '3' } }, 'out of order');

  const outlineKiller = h('button', {
    style: { outlineStyle: 'none', outlineWidth: '0px' }
  }, 'No focus ring');

  const unlabeled = h('input', { attrs: { type: 'email', id: 'email' } });

  const brokenRef = h('button', { attrs: { 'aria-labelledby': 'missing-id' } }, 'OK');

  const badRole = h('div', { attrs: { role: 'scrollbar-of-fate' } }, 'x');

  const dup1 = h('span', { attrs: { id: 'dup' } }, 'one');
  const dup2 = h('span', { attrs: { id: 'dup' } }, 'two');

  const presentFocusable = h('span', {
    attrs: { role: 'presentation', tabindex: '0' }
  }, 'conflict');

  const body = h('body', {},
    badContrast, noAlt, clickDiv, nakedTab, outlineKiller,
    unlabeled, brokenRef, badRole, dup1, dup2, presentFocusable, host
  );

  const title = h('title', {}, '');
  const head = h('head', {}, title);
  const html = h('html', {}, head, body); // no lang
  const doc = h.__doc || null;
  return {
    elements: {
      badContrast, noAlt, clickDiv, nakedTab, outlineKiller, unlabeled,
      brokenRef, badRole, dup1, dup2, presentFocusable, host,
      shadowBtn, shadowLink, shadowInput, shadowH1, shadowH3, shadowLowText
    },
    html,
    body
  };
}
