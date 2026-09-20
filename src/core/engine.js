import { resolveConfig } from './config.js';
import { ALL_RULES } from '../rules/index.js';
import { allElements, tagOf } from './dom-utils.js';
import { makeFinding, applyIgnore, summarize } from './report.js';

// Platform adapter contract:
//   ctx.computed(el) -> CSSStyleDeclaration-like
//   ctx.rect(el)     -> {width,height} | null
//   ctx.root         -> document or element root
//   ctx.probeFocus?(el) -> computed style under :focus
//   ctx.sampleBackground?(el, chain) -> {color, source, incomplete?, taint?} | null
//   ctx.workerURL?
export function createEngine(platform, userConfig = {}, ruleList = ALL_RULES) {
  const config = resolveConfig(userConfig, ruleList.map((r) => r.id));
  const root = config.root || platform.root;
  config.__root = root;

  const ctx = {
    root,
    config,
    elements: [],
    computed: platform.computed,
    rect: platform.rect || (() => null),
    probeFocus: platform.probeFocus || null,
    sampleBackground: platform.sampleBackground || null,
    canvasBackground: platform.canvasBackground || '#ffffff',
    isVisible: (el) => platform.isVisible ? platform.isVisible(el, ctx) : true,
    // Rules call ctx.parallel(items, fn). Items are DOM-bound so they cannot
    // cross a worker boundary; we execute them in time-sliced chunks to keep
    // the main thread responsive. Pure (serializable) batches can opt into
    // the Worker via platform.runPureBatch (see browser platform).
    async parallel(items, fn) {
      if (config.workers.enabled && fn.pure && platform.runPureBatch &&
          items.length >= config.workers.minBatch) {
        return platform.runPureBatch(items, fn);
      }
      const CHUNK = 500;
      const out = new Array(items.length);
      for (let i = 0; i < items.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, items.length);
        for (let j = i; j < end; j++) out[j] = fn(items[j], j);
        if (end < items.length) await new Promise((r) => setTimeout(r, 0));
      }
      return out;
    },
    report() {}
  };

  const listeners = new Map();
  const engine = {
    ctx,
    config,
    on(event, fn) {
      listeners.set(event, (listeners.get(event) || []).concat(fn));
      return () => listeners.set(event, (listeners.get(event) || []).filter((f) => f !== fn));
    },
    emit(event, payload) {
      for (const fn of listeners.get(event) || []) fn(payload);
    },
    async audit(targetRoot = root) {
      const start = Date.now();
      ctx.root = targetRoot;
      ctx.elements = [...allElements(targetRoot)];
      const findings = [];
      const elementByPath = new Map();
      ctx.report = (raw) => {
        const rule = currentRule;
        const finding = makeFinding(rule, raw, targetRoot);
        findings.push(finding);
        if (raw.el) elementByPath.set(finding.target, raw.el);
      };

      const closedHosts = collectClosedHosts(targetRoot, platform);

      for (const rule of ruleList) {
        const rc = config.rules[rule.id];
        if (!rc || rc.enabled === false) continue;
        ctx.options = rc.options || {};
        currentRule = rule;
        try {
          await rule.run(ctx);
        } catch (err) {
          ctx.emit?.('ruleError', { ruleId: rule.id, error: err });
          engine.emit('ruleError', { ruleId: rule.id, error: err });
        }
      }
      for (const host of closedHosts) {
        findings.push(makeFinding(
          { id: 'closed-shadow-root', impact: 'minor', wcag: null,
            description: 'Closed shadow root could not be inspected.' },
          { el: host, impact: 'minor',
            message: 'Element has a closed shadow root; its contents were not audited.',
            fix: 'Attach the auditor from within the component, or use an open shadow root.',
            incomplete: true }, targetRoot));
      }
      const kept = applyIgnore(findings, elementByPath, config);
      const report = {
        tool: 'dom-a11y-audit',
        version: 1,
        url: platform.url || null,
        timestamp: Date.now(),
        durationMs: Date.now() - start,
        config: { level: config.level, rules: Object.fromEntries(
          Object.entries(config.rules).map(([k, v]) => [k, v.enabled])
        )},
        summary: summarize(kept),
        findings: kept,
        closedShadowRoots: closedHosts.length
      };
      engine.emit('report', report);
      return report;
    },
    async reaudit(targets) {
      return engine.audit(root);
    }
  };
  let currentRule = { id: 'unknown' };
  return engine;
}

function collectClosedHosts(rootNode, platform) {
  const hosts = [];
  for (const el of allElements(rootNode)) {
    const sr = el.shadowRoot != null ? el.shadowRoot : (el.__shadowRoot || null);
    if (sr && sr.mode === 'closed') hosts.push(el);
  }
  return hosts;
}
