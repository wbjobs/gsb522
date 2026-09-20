import { matches, shadowInner } from './selector.js';
import { describePath, tagOf, attr } from './dom-utils.js';

let counter = 0;

export function makeFinding(rule, raw, root) {
  const el = raw.el;
  const path = el && el.nodeType === 1 ? describePath(el, root) : (el?.nodeName || 'document');
  const fingerprint = [
    rule.id,
    path,
    (raw.message || '').slice(0, 80)
  ].join('|');
  const id = 'a11y-' + hash(fingerprint).toString(36) + '-' + (counter++).toString(36);
  return {
    id,
    ruleId: rule.id,
    impact: raw.impact || rule.impact || 'moderate',
    wcag: raw.wcag || rule.wcag || null,
    message: raw.message || rule.description,
    fix: raw.fix || null,
    target: path,
    tag: el && el.nodeType === 1 ? tagOf(el) : null,
    snippet: el && el.cloneNode && el.cloneNode ? snippet(el) : null,
    data: raw.data || {},
    incomplete: !!raw.incomplete
  };
}

function snippet(el) {
  try {
    const outer = el.outerHTML || '';
    return outer.length > 180 ? outer.slice(0, 177) + '...' : outer;
  } catch {
    return null;
  }
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

// Apply the ignore list: plain selectors, rule-scoped selectors, shadow
// piercing ("host::shadow inner"), and muted finding ids.
export function applyIgnore(findings, elementByPath, config) {
  return findings.filter((f) => {
    if (config.ignoreFindingIds.has(f.id)) return false;
    const el = elementByPath.get(f.target);
    for (const entry of config.ignore) {
      if (entry.findingId && f.id === entry.findingId) return false;
      if (entry.rules && !entry.rules.includes(f.ruleId)) continue;
      if (!entry.selector || !el) continue;
      if (matches(el, entry.selector, config.__root)) return false;
      const inner = shadowInner(entry.selector);
      if (inner && matches(el, inner, config.__root)) return false;
    }
    return true;
  });
}

export function summarize(findings) {
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const byRule = {};
  let incomplete = 0;
  for (const f of findings) {
    byImpact[f.impact] = (byImpact[f.impact] || 0) + 1;
    byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
    if (f.incomplete) incomplete++;
  }
  return {
    total: findings.length,
    violations: findings.filter((f) => !f.incomplete).length,
    incomplete,
    byImpact,
    byRule
  };
}

export function toJSON(report) {
  return JSON.stringify(report, null, 2);
}

export function toCSV(report) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
  const rows = [['id','rule','impact','wcag','target','message','fix','incomplete'].map(esc).join(',')];
  for (const f of report.findings) {
    rows.push([f.id, f.ruleId, f.impact, f.wcag, f.target, f.message, f.fix, f.incomplete].map(esc).join(','));
  }
  return rows.join('\n');
}

export function toMarkdown(report) {
  const s = report.summary;
  const lines = [
    `# Accessibility Audit Report`,
    ``,
    `- URL: ${report.url || 'n/a'}`,
    `- Date: ${new Date(report.timestamp).toISOString()}`,
    `- Level: ${report.config.level}`,
    `- Violations: **${s.violations}** (needs review: ${s.incomplete})`,
    `- Critical ${s.byImpact.critical} · Serious ${s.byImpact.serious} · Moderate ${s.byImpact.moderate} · Minor ${s.byImpact.minor}`,
    ``,
    `| Rule | Impact | WCAG | Target | Message | Fix |`,
    `| --- | --- | --- | --- | --- | --- |`
  ];
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  for (const f of report.findings) {
    lines.push(`| ${cell(f.ruleId)}${f.incomplete ? ' _(review)_' : ''} | ${f.impact} | ${f.wcag || ''} | \`${cell(f.target)}\` | ${cell(f.message)} | ${cell(f.fix || '')} |`);
  }
  return lines.join('\n');
}

export function toHTML(report) {
  const s = report.summary;
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = report.findings.map((f) => `
    <tr class="impact-${esc(f.impact)}${f.incomplete ? ' incomplete' : ''}">
      <td>${esc(f.ruleId)}</td><td>${esc(f.impact)}</td><td>${esc(f.wcag || '')}</td>
      <td><code>${esc(f.target)}</code></td><td>${esc(f.message)}</td><td>${esc(f.fix || '')}</td>
    </tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>A11y report</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#1a1a1a}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
tr.impact-critical{background:#fdecea}tr.impact-serious{background:#fff4e5}tr.incomplete td{opacity:.75}
h1{font-size:1.3rem}.meta span{margin-right:1.2rem}
</style>
<h1>Accessibility Audit Report</h1>
<p class="meta"><span>URL: ${esc(report.url || '')}</span><span>Level: ${esc(report.config.level)}</span>
<span>Violations: ${s.violations}</span><span>Review: ${s.incomplete}</span></p>
<table><thead><tr><th>Rule</th><th>Impact</th><th>WCAG</th><th>Target</th><th>Message</th><th>Fix</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

export const EXPORTERS = { json: toJSON, csv: toCSV, md: toMarkdown, html: toHTML };
