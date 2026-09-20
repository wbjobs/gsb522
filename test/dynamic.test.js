import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observe } from '../src/core/dynamic.js';
import { createNodeAuditor, __installMutationObserver } from '../src/platform/node/index.js';
import { h, docWith } from './fixtures.js';

test('dynamic watcher re-audits when an offending element is added', async () => {
  __installMutationObserver(globalThis);
  MutationObserver.__reset();

  const body = h('body', {}, h('main', {}, h('h1', {}, 'Clean page')));
  const doc = docWith(h('html', { attrs: { lang: 'en' } }, body));
  const auditor = createNodeAuditor(doc);

  const first = await auditor.audit();
  assert.equal(first.findings.filter((f) => f.ruleId === 'img-alt').length, 0);

  const events = [];
  const watcher = observe({
    ctx: { root: doc },
    reaudit: () => auditor.audit(),
    emit: (name, report) => events.push({ name, count: report.summary.violations })
  }, { debounceMs: 20 });

  body.appendChild(h('img', { attrs: { src: 'new.png' } }));
  await new Promise((r) => setTimeout(r, 120));
  watcher.disconnect();

  assert.ok(events.some((e) => e.name === 'dynamic'), 'dynamic event emitted');
  assert.ok(events.some((e) => e.count > 0), 're-audit reports the new violation');
});

test('observe is a no-op disconnect when MutationObserver is absent', async () => {
  const saved = globalThis.MutationObserver;
  delete globalThis.MutationObserver;
  const doc = docWith(h('html', { attrs: { lang: 'en' } }, h('body', {})));
  const auditor = createNodeAuditor(doc);
  const events = [];
  const watcher = observe({
    ctx: { root: doc },
    reaudit: () => auditor.audit(),
    emit: (name, r) => events.push(name)
  }, { debounceMs: 5 });
  assert.doesNotThrow(() => watcher.disconnect());
  globalThis.MutationObserver = saved;
});
