import { createEngine } from '../../core/engine.js';
import { EXPORTERS } from '../../core/report.js';

export * from './fake-dom.js';
export { EXPORTERS };

// Build an auditor over a fake document. `documents` carry computed styles on
// each node (__computed), which replaces getComputedStyle.
export function createNodeAuditor(doc, userConfig = {}) {
  const platform = {
    root: doc,
    url: userConfig.url || 'test://fixture',
    computed: (el) => el?.__computed || {},
    rect: (el) => el?.__rect || null,
    isVisible: (el) => {
      const cs = el.__computed || {};
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.__rect;
      return !r || (r.width > 0 && r.height > 0);
    },
    sampleBackground: null,
    // Tests declare expected focus styles explicitly on __focusStyle; if
    // absent we return a clone of the base style (i.e. "no visible change").
    probeFocus: (el) => el.__focusStyle || (() => {
      const cs = el.__computed || {};
      return Object.fromEntries(['outlineWidth','outlineStyle','outlineColor',
        'borderWidth','borderStyle','borderColor','boxShadow','backgroundColor','color']
        .map((k) => [k, cs[k] || '']));
    })(),
    workerURL: null
  };
  const engine = createEngine(platform, userConfig);
  return {
    config: engine.config,
    on: engine.on.bind(engine),
    audit: () => engine.audit(doc),
    auditElement: (el) => engine.audit(el),
    exportReport: (report, format = 'json') => EXPORTERS[format](report)
  };
}

// Default browser-like computed styles for a fresh fixture node.
export function defaultComputed(tag) {
  const base = {
    display: 'inline',
    visibility: 'visible',
    opacity: '1',
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    fontSize: '16px',
    fontWeight: '400',
    outlineWidth: '0px',
    outlineStyle: 'auto', // browsers expose UA default ring style as 'auto'
    outlineColor: 'rgb(0, 0, 0)',
    borderWidth: '0px',
    borderStyle: 'none',
    borderColor: 'rgb(0, 0, 0)',
    boxShadow: 'none'
  };
  if (['div','p','h1','h2','h3','h4','h5','h6','ul','ol','li','table','form','header','footer','main','nav','aside','section','article'].includes(tag)) {
    base.display = 'block';
  }
  if (/^h[1-6]$/.test(tag)) {
    base.fontWeight = '700';
    base.fontSize = ({ 1: '32px', 2: '24px', 3: '18.72px', 4: '16px', 5: '13.28px', 6: '10.72px' })[tag[1]];
  }
  if (tag === 'a') base.color = 'rgb(0, 0, 238)';
  if (tag === 'b' || tag === 'strong') base.fontWeight = '700';
  return base;
}
