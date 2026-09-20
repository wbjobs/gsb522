import { createEngine } from '../../core/engine.js';
import { createBackgroundSampler } from './canvas-sample.js';
import { createFocusProbe } from './focus-probe.js';
import { getWorkerURL } from './worker-source.js';
import { observe } from '../../core/dynamic.js';
import { EXPORTERS } from '../../core/report.js';
import { instrument } from '../../core/listener-tracker.js';
import { ancestorChain } from '../../core/dom-utils.js';

export { instrument };
export { EXPORTERS };


const STYLE_KEYS = ['color','background-color','background-image','font-size','font-weight',
  'font-family','opacity','display','visibility','outline-width','outline-style','outline-color',
  'border-width','border-style','border-color','border-top-width','box-shadow','line-height'];
const CAMEL = Object.fromEntries(STYLE_KEYS.map((k) => [k, k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]));
function normalizeStyle(cs) {
  if (!cs) return cs;
  const out = {};
  for (const kebab of STYLE_KEYS) {
    const camel = CAMEL[kebab];
    let v = cs[camel];
    if ((v === undefined || v === '') && typeof cs.getPropertyValue === 'function') {
      v = cs.getPropertyValue(kebab);
    }
    out[camel] = v ?? '';
  }
  return out;
}
export function createAuditor(userConfig = {}) {
  const doc = userConfig.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('No document available; pass config.document.');
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const config = userConfig;

  const sampler = config.contrast?.canvas === false
    ? { prefetch: async () => {}, sample: () => null }
    : createBackgroundSampler(doc);

  const platform = {
    root: doc,
    url: win?.location?.href || null,
    computed: (el) => {
      try {
        if (el.nodeType !== 1) return null;
        const gcs = win?.getComputedStyle || (typeof getComputedStyle === 'function' ? getComputedStyle : null);
        if (!gcs) return null;
        const cs = gcs(el);
        return normalizeStyle(cs);
      } catch { return null; }
    },
    rect: (el) => {
      try {
        if (typeof el.getBoundingClientRect !== 'function') return null;
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      } catch { return null; }
    },
    isVisible: (el) => {
      try {
        const cs = platform.computed(el);
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)) return false;
        const r = platform.rect(el);
        return !r || (r.width > 0 && r.height > 0);
      } catch { return true; }
    },
    sampleBackground: (el) => sampler.sample(el),
    probeFocus: config.focus === false ? null : createFocusProbe(doc, win),
    workerURL: config.workers?.enabled === false ? null : getWorkerURL(win?.URL, win?.Blob),
    runPureBatch: createPureBatchRunner(win, config)
  };

  const engine = createEngine(platform, config);

  // Prefetch canvas backgrounds before contrast rule runs so the sync color
  // resolver can read rasterized results.
  engine.on('beforeContrast', () => {});
  wrapContrastPrefetch(engine, sampler);

  const auditor = {
    config: engine.config,
    ctx: engine.ctx,
    on: engine.on.bind(engine),
    emit: engine.emit.bind(engine),
    audit: () => engine.audit(platform.root),
    auditElement: (el) => engine.audit(el),
    watch() {
      if (!config.dynamic || config.dynamic.enabled === false) return { disconnect() {} };
      return observe({
        ctx: engine.ctx,
        reaudit: () => engine.audit(platform.root),
        emit: engine.emit.bind(engine)
      }, config.dynamic);
    },
    exportReport(report, format = 'json') {
      const fn = EXPORTERS[format];
      if (!fn) throw new Error(`Unknown export format: ${format}`);
      return fn(report);
    },
    downloadReport(report, format = 'json', filename) {
      const body = auditor.exportReport(report, format);
      const mime = { json: 'application/json', csv: 'text/csv', md: 'text/markdown', html: 'text/html' }[format];
      const blob = new win.Blob([body], { type: `${mime || 'text/plain'};charset=utf-8` });
      const a = doc.createElement('a');
      a.href = win.URL.createObjectURL(blob);
      a.download = filename || `a11y-report.${format}`;
      a.click();
      win.URL.revokeObjectURL(a.href);
    }
  };
  return auditor;
}

// Before the contrast rule executes, rasterize every visible text candidate
// so canvas-based backgrounds are available synchronously.
function wrapContrastPrefetch(engine, sampler) {
  const origAudit = engine.audit.bind(engine);
  engine.audit = async (root) => {
    engine.ctx.root = root;
    const { textCandidates } = await import('../../core/color-resolve.js');
    const { allElements } = await import('../../core/dom-utils.js');
    const elements = [...allElements(root)];
    engine.ctx.elements = elements;
    const candidates = textCandidates(elements)
      .filter(({ el }) => engine.ctx.isVisible(el))
      .map(({ el }) => ({ el, chain: ancestorChain(el, root) }));
    if (candidates.length) await sampler.prefetch(candidates);
    return origAudit(root);
  };
}

function createPureBatchRunner(win, config) {
  if (config.workers?.enabled === false) return null;
  let worker = null;
  return async function runPureBatch(items, fn) {
    if (!fn.pure) return items.map((x) => fn(x));
    const payloads = items.map((item) => fn.toInput(item));
    if (!worker) {
      const { getWorkerURL } = await import('./worker-source.js');
      const url = getWorkerURL(win?.URL, win?.Blob);
      if (!url) return items.map((x) => fn(x));
      const WorkerCtor = win?.Worker || (typeof Worker !== 'undefined' ? Worker : null);
      if (!WorkerCtor) return items.map((x) => fn(x));
      worker = new WorkerCtor(url);
    }
    const id = Math.random().toString(36).slice(2);
    const results = await new Promise((resolve, reject) => {
      const onMsg = (e) => {
        if (e.data?.id !== id) return;
        worker.removeEventListener('message', onMsg);
        resolve(e.data.payload);
      };
      worker.addEventListener('message', onMsg);
      worker.addEventListener('error', (e) => reject(e), { once: true });
      worker.postMessage({ id, items: payloads });
    });
    return items.map((item, i) => fn.fromOutput(item, results[i]));
  };
}
