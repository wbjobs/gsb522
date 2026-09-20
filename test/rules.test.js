import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeAuditor } from '../src/platform/node/index.js';
import { h, docWith, htmlDoc } from './fixtures.js';

async function auditBody(...body) {
  const { doc } = htmlDoc({ body });
  return createNodeAuditor(doc).audit();
}

test('flags invalid aria token and numeric values', async () => {
  const report = await auditBody(
    h('div', { attrs: { 'aria-hidden': 'maybe' } }, 'x'),
    h('div', { attrs: { 'aria-level': 'lots' } }, 'y'),
    h('div', { attrs: { role: 'slider', 'aria-valuemin': '10', 'aria-valuemax': '2', 'aria-valuenow': '20' } }, 'z')
  );
  assert.ok(report.findings.some((f) => f.ruleId === 'aria-valid-value' && /maybe/.test(f.message)));
  assert.ok(report.findings.some((f) => f.ruleId === 'aria-valid-value' && /aria-level/.test(f.message)));
  assert.ok(report.findings.some((f) => /aria-valuemax/.test(f.message)));
  assert.ok(report.findings.some((f) => /aria-valuenow/.test(f.message)));
});

test('flags unknown aria attributes and abstract roles', async () => {
  const report = await auditBody(
    h('div', { attrs: { 'aria-labelx': 'bad' } }, 'a'),
    h('div', { attrs: { role: 'widget' } }, 'b') // abstract role
  );
  assert.ok(report.findings.some((f) => f.ruleId === 'aria-valid-attr' && /aria-labelx/.test(f.message)));
  assert.ok(report.findings.some((f) => f.ruleId === 'aria-valid-role' && /widget/.test(f.message)));
});

test('required-owned detects a list without list items', async () => {
  const report = await auditBody(
    h('ul', { attrs: { role: 'list' } }, h('div', {}, 'not an item'))
  );
  assert.ok(report.findings.some((f) => f.ruleId === 'aria-required-owned'));
});

test('native ul/li and labeled controls produce no name findings', async () => {
  const label = h('label', { attrs: { for: 'n' } }, 'Email');
  const input = h('input', { attrs: { type: 'email', id: 'n' } });
  const report = await auditBody(h('ul', {}, h('li', {}, 'one'), h('li', {}, 'two')), label, input,
    h('button', {}, 'Go'), h('a', { attrs: { href: '#' } }, 'Home'));
  assert.ok(!report.findings.some((f) => f.ruleId === 'form-label'));
  assert.ok(!report.findings.some((f) => f.ruleId === 'button-name'));
  assert.ok(!report.findings.some((f) => f.ruleId === 'link-name'));
  assert.ok(!report.findings.some((f) => f.ruleId === 'aria-required-owned'));
});

test('focus indicator: explicit outline:none is flagged; default ring is not', async () => {
  const report = await auditBody(
    h('button', { style: { outlineStyle: 'none', outlineWidth: '0px' } }, 'Killed ring'),
    h('button', {}, 'Default ring')
  );
  const fi = report.findings.filter((f) => f.ruleId === 'focus-indicator');
  assert.equal(fi.length, 1);
  assert.match(fi[0].message, /outline/i);
});

test('positive tabindex reported, 0 and -1 are not', async () => {
  const report = await auditBody(
    h('span', { attrs: { tabindex: '5' } }, 'a'),
    h('span', { attrs: { tabindex: '0' } }, 'b'),
    h('button', { attrs: { tabindex: '-1' } }, 'c')
  );
  const ti = report.findings.filter((f) => f.ruleId === 'tabindex-positive');
  assert.equal(ti.length, 1);
});

test('blink/marquee and skipped headings are reported', async () => {
  const { doc } = htmlDoc({
    body: [h('h2', {}, 'Two'), h('h4', {}, 'Four'), h('marquee', {}, 'sale'), h('blink', {}, 'x')]
  });
  const report = await createNodeAuditor(doc).audit();
  assert.ok(report.findings.some((f) => f.ruleId === 'heading-order'));
  assert.ok(report.findings.some((f) => f.ruleId === 'no-blink-marquee' && /marquee/.test(f.message)));
  assert.ok(report.findings.some((f) => f.ruleId === 'no-blink-marquee' && /blink/.test(f.message)));
});

test('aria-hidden subtree hides a focusable descendant', async () => {
  const hidden = h('div', { attrs: { 'aria-hidden': 'true' } },
    h('a', { attrs: { href: '#' } }, 'hidden but focusable'));
  const report = await auditBody(hidden);
  assert.ok(report.findings.some((f) => f.ruleId === 'aria-hidden-focusable'));
});
