import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesIgnore, applyIgnoreList } from '../src/ignore.js';
import { summarize, buildReport } from '../src/report.js';

const issue = (ruleId, selector) => ({
  ruleId, severity: 'serious', message: 'm', suggestion: 's', selector,
});

test('matchesIgnore: 按规则忽略', () => {
  assert.equal(matchesIgnore(issue('color-contrast', 'p'), { rule: 'color-contrast' }), true);
  assert.equal(matchesIgnore(issue('image-alt', 'img'), { rule: 'color-contrast' }), false);
});

test('matchesIgnore: 按选择器忽略（含结尾匹配）', () => {
  assert.equal(matchesIgnore(issue('image-alt', 'img.logo'), { selector: 'img.logo' }), true);
  assert.equal(
    matchesIgnore(issue('image-alt', 'body > section > img.logo'), { selector: 'img.logo' }),
    true,
  );
  assert.equal(matchesIgnore(issue('image-alt', 'img.banner'), { selector: 'img.logo' }), false);
});

test('matchesIgnore: 组合与 selectorIncludes（shadow 路径）', () => {
  const shadowIssue = issue('color-contrast', 'my-card ::shadow div > p.dim');
  assert.equal(matchesIgnore(shadowIssue, { rule: 'color-contrast', selectorIncludes: 'p.dim' }), true);
  assert.equal(matchesIgnore(shadowIssue, { rule: 'image-alt', selectorIncludes: 'p.dim' }), false);
  assert.equal(matchesIgnore(shadowIssue, { selectorIncludes: 'other' }), false);
});

test('applyIgnoreList: 分离保留与忽略', () => {
  const issues = [
    issue('color-contrast', 'p.a'),
    issue('image-alt', 'img'),
    issue('label', 'input'),
  ];
  const { kept, ignored } = applyIgnoreList(issues, [{ rule: 'image-alt' }]);
  assert.equal(kept.length, 2);
  assert.equal(ignored.length, 1);
  assert.equal(ignored[0].ruleId, 'image-alt');
});

test('summarize / buildReport 结构', () => {
  const issues = [
    { ruleId: 'a', severity: 'critical' },
    { ruleId: 'a', severity: 'minor' },
    { ruleId: 'b', severity: 'critical' },
  ];
  const summary = summarize(issues);
  assert.equal(summary.total, 3);
  assert.equal(summary.bySeverity.critical, 2);
  assert.equal(summary.byRule.a, 2);

  const report = buildReport({ issues, ignored: [], url: 'http://x', durationMs: 5, ruleConfig: {} });
  assert.equal(report.tool, 'a11y-audit');
  assert.equal(report.summary.total, 3);
  assert.ok(report.timestamp);
});
