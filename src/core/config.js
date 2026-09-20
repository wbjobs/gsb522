// Default audit configuration. Everything is overridable via createAuditor(config).
export const DEFAULT_CONFIG = {
  level: 'AA',                 // 'AA' | 'AAA'
  rules: {
    // ruleId -> { enabled: boolean, options?: object }
    // Filled below with all rules enabled.
  },
  // Selectors / targets to ignore. Each entry:
  //   'css selector'        matches light-DOM elements
  //   'host::shadow sel'    pierces into a shadow root attached to host
  //   { rule, selector }    ignore only for one rule
  ignore: [],
  // Persistent node ids attached to findings so users can mute them.
  ignoreFindingIds: [],
  root: null,                  // document by default; element for partial audits
  includeIncomplete: true,     // report "needs review" findings
  workers: { enabled: true, minBatch: 40 },
  contrast: {
    largeTextBoldPx: 18.66,
    largeTextPx: 24,
    canvas: true,              // sample rendered pixels when possible
    // pseudo-classes probed during focus simulation
    focusPseudo: [':focus', ':focus-visible']
  },
  dynamic: { enabled: true, debounceMs: 300 }
};

export function resolveConfig(userConfig = {}, ruleIds = []) {
  const cfg = merge(structuredCloneSafe(DEFAULT_CONFIG), userConfig || {});
  for (const id of ruleIds) {
    if (!(id in cfg.rules)) cfg.rules[id] = { enabled: true, options: {} };
  }
  // user may pass rules: { 'rule-id': false } shorthand
  for (const [id, val] of Object.entries(cfg.rules)) {
    if (val === false) cfg.rules[id] = { enabled: false, options: {} };
    else if (val === true) cfg.rules[id] = { enabled: true, options: {} };
    else if (val && typeof val === 'object') {
      cfg.rules[id] = { enabled: val.enabled !== false, options: val.options || {} };
    }
  }
  cfg.ignore = (cfg.ignore || []).map(normalizeIgnore);
  cfg.ignoreFindingIds = new Set(cfg.ignoreFindingIds || []);
  return cfg;
}

function normalizeIgnore(entry) {
  if (typeof entry === 'string') return { selector: entry, rules: null };
  return {
    selector: entry.selector,
    rules: entry.rules ? (Array.isArray(entry.rules) ? entry.rules : [entry.rules]) : null,
    findingId: entry.findingId || null
  };
}

function merge(base, over) {
  if (!over) return base;
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Set) &&
        base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = merge(base[k], v);
    } else base[k] = v;
  }
  return base;
}

// DEFAULT_CONFIG contains only JSON-safe values; clone without structuredClone
// so the same code works in older runtimes/tests.
function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}
