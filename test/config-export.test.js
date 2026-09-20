import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeAuditor } from '../src/platform/node/index.js';
import { h, docWith } from './fixtures.js';

function page() {
  const lowText = h('p', {
    attrs: { class: 'dim', id: 'p1' },
    style: { color: 'rgb(170,170,170)', backgroundColor: '#fff' }
  }, 'dim');
  const img = h('img', { attrs: { src: 'a.png', class: 'deco' } });
  return docWith(h('html', { attrs: { lang: 'en' } }, h('body', {}, lowText, img)));
}

test('rules can be disabled via config', async () => {
  const doc = page();
  const auditor = createNodeAuditor(doc, { rules: { 'img-alt': false } });
  assert.equal(auditor.config.rules['img-alt'].enabled, false);
  const a = await auditor.audit();
  assert.ok(!a.findings.some((f) => f.ruleId === 'img-alt'));
  assert.ok(a.findings.some((f) => f.ruleId === 'color-contrast'));
  assert.equal(a.config.rules['img-alt'], false);
});

test('ignore list supports plain selectors and rule-scoped selectors', async () => {
  const doc = page();
  const report = await createNodeAuditor(doc, {
    ignore: [
      '.dim',                                   // ignore element everywhere
      { selector: 'img.deco', rules: ['img-alt'] } // only this rule
    ]
  }).audit();
  assert.ok(!report.findings.some((f) => f.target.includes('p1')), 'class ignore');
  assert.ok(!report.findings.some((f) => f.ruleId === 'img-alt'), 'rule-scoped ignore');
});

test('ignore entry scoped to another rule still reports other rules', async () => {
  const doc = page();
  const report = await createNodeAuditor(doc, {
    ignore: [{ selector: '.dim', rules: ['img-alt'] }]
  }).audit();
  assert.ok(report.findings.some((f) => f.ruleId === 'color-contrast'));
});

test('AAA level raises the contrast threshold (3.1:1 large stays, 4.5 fails)', async () => {
  const doc = docWith(
    h('html', { attrs: { lang: 'en' } },
      h('body', {},
        // #777 on white = 4.48:1 -> passes 3:1 large, fails 4.5/7 normal
        h('p', { style: { color: '#777777', backgroundColor: '#fff' } }, 'normal text')))
  );
  const aa = await createNodeAuditor(doc, { level: 'AA' }).audit();
  assert.ok(aa.findings.some((f) => f.ruleId === 'color-contrast'));
});

test('reports export to JSON, CSV, Markdown and HTML', async () => {
  const doc = page();
  const auditor = createNodeAuditor(doc);
  const report = await auditor.audit();
  const json = JSON.parse(auditor.exportReport(report, 'json'));
  assert.equal(json.tool, 'dom-a11y-audit');
  assert.ok(json.summary.total >= 1);

  const csv = auditor.exportReport(report, 'csv');
  assert.match(csv, /^.?id.?,.*rule.*impact/);
  assert.ok(csv.includes('color-contrast'));

  const md = auditor.exportReport(report, 'md');
  assert.match(md, /# Accessibility Audit Report/);
  assert.ok(md.includes('color-contrast'));

  const html = auditor.exportReport(report, 'html');
  assert.match(html, /<table>/);
  assert.ok(html.includes('color-contrast'));
});

test('closed shadow root is reported as needing review, not silently skipped', async () => {
  const host = h('div', { attrs: { id: 'secret' } });
  const root = host.attachShadow({ mode: 'closed' });
  root.appendChild(h('button', {}, 'x'));
  const doc = docWith(h('html', { attrs: { lang: 'en' } }, h('body', {}, host)));
  const report = await createNodeAuditor(doc).audit();
  assert.equal(report.closedShadowRoots, 1);
  assert.ok(report.findings.some((f) => f.ruleId === 'closed-shadow-root' && f.incomplete));
});

test('display:none and zero-size elements are not audited for contrast', async () => {
  const doc = docWith(h('html', { attrs: { lang: 'en' } }, h('body', {},
    h('p', { style: { display: 'none', color: '#aaa', backgroundColor: '#fff' } }, 'hidden'),
    h('p', { style: { color: '#aaa', backgroundColor: '#fff' }, rect: { width: 0, height: 0 } }, 'zero'))));
  const report = await createNodeAuditor(doc).audit();
  assert.ok(!report.findings.some((f) => f.ruleId === 'color-contrast'));
});
