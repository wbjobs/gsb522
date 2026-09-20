import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeAuditor } from '../src/platform/node/index.js';
import { docWith } from './fixtures.js';
import { buildKnownIssuesPage } from './fixture-known-issues.js';

async function runAudit(overrides = {}) {
  const page = buildKnownIssuesPage();
  const doc = docWith(page.html);
  const auditor = createNodeAuditor(doc, overrides);
  const report = await auditor.audit();
  return { report, page, auditor, doc };
}

test('detects every known issue on the defect fixture page', async () => {
  const { report } = await runAudit();
  const ids = new Set(report.findings.map((f) => f.ruleId));

  const expected = [
    'color-contrast',
    'img-alt',
    'button-name',
    'link-name',
    'form-label',
    'aria-valid-role',
    'aria-idrefs',
    'aria-presentation-conflict',
    'duplicate-id',
    'focus-indicator',
    'tabindex-positive',
    'keyboard-accessible',
    'html-lang',
    'document-title',
    'heading-order'
  ];
  for (const id of expected) {
    assert.ok(ids.has(id), `expected rule to fire: ${id} (got ${[...ids].join(', ')})`);
  }
  assert.ok(report.summary.violations >= expected.length);
  assert.ok(report.summary.byImpact.critical > 0);
});

test('contrast finding reports measured ratio, required ratio and colors', async () => {
  const { report } = await runAudit();
  const f = report.findings.find((x) => x.ruleId === 'color-contrast' &&
    x.data.sampleText?.includes('light gray'));
  assert.ok(f, 'expected a contrast finding for the gray paragraph');
  assert.ok(f.data.ratio < 4.5, `ratio should fail AA, got ${f.data.ratio}`);
  assert.equal(f.data.required, 4.5);
  assert.match(f.data.foreground, /^#[0-9a-f]{6}$/);
  assert.match(f.data.background, /^#[0-9a-f]{6}$/);
  assert.ok(/required|4\.5|:1/.test(f.message));
  assert.ok(f.fix.includes('#'), 'fix should suggest concrete colors');
});

test('detects defects inside open shadow DOM', async () => {
  const { report, page } = await runAudit();
  const shadowTargets = report.findings.filter((f) => f.target.includes('::shadow'));
  assert.ok(shadowTargets.some((f) => f.ruleId === 'button-name'),
    'shadow button without name');
  assert.ok(shadowTargets.some((f) => f.ruleId === 'form-label'),
    'shadow unlabeled input');
  assert.ok(shadowTargets.some((f) => f.ruleId === 'heading-order'),
    'shadow h1->h3 skip');
  const shadowContrast = shadowTargets.filter((f) => f.ruleId === 'color-contrast');
  assert.ok(shadowContrast.length >= 1, 'shadow low contrast text/link');
});

test('keyboard rule flags click-only custom widget and missing tabindex', async () => {
  const { report } = await runAudit();
  const kb = report.findings.filter((f) => f.ruleId === 'keyboard-accessible');
  assert.ok(kb.some((f) => /no keyboard handler/i.test(f.message)));
  assert.ok(kb.some((f) => /tab order/i.test(f.message)));
});

test('aria-labelledby pointing to a missing id is reported', async () => {
  const { report } = await runAudit();
  assert.ok(report.findings.some((f) => f.ruleId === 'aria-idrefs' && /missing-id/.test(f.message)));
});

test('findings carry actionable fixes and stable ids', async () => {
  const { report } = await runAudit();
  for (const f of report.findings) {
    assert.ok(f.id && f.id.startsWith('a11y-'));
    assert.ok(f.target);
    assert.equal(typeof f.message, 'string');
  }
});
