import { createAuditor } from '../src/platform/browser/index.js';
import { ALL_RULES } from '../src/rules/index.js';

const status = document.getElementById('status');
const runBtn = document.getElementById('run');

const panel = document.createElement('div');
panel.style.cssText = 'font:12px/1.5 system-ui;display:none;margin-top:1rem';
document.body.appendChild(panel);

function readConfig() {
  const rules = {};
  panel.querySelectorAll('[data-rule]').forEach((cb) => {
    rules[cb.dataset.rule] = { enabled: cb.checked };
  });
  const ignore = panel.querySelector('#ignore')?.value
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .map((selector) => ({ selector })) || [];
  return {
    level: panel.querySelector('#level')?.value || 'AA',
    rules,
    ignore,
    workers: { enabled: panel.querySelector('#workers')?.checked ?? true },
    dynamic: { enabled: false }
  };
}

function renderConfig() {
  panel.style.display = 'block';
  panel.innerHTML = `
    <details open style="border:1px solid #ddd;border-radius:8px;padding:.6rem 1rem">
      <summary><b>Audit configuration</b></summary>
      <p>
        Level:
        <label><input type="radio" name="level" id="level-aa" value="AA" checked> AA</label>
        <label><input type="radio" name="level" id="level-aaa" value="AAA"> AAA</label>
        &nbsp;&nbsp;<label><input type="checkbox" id="workers" checked> Web Worker batching</label>
      </p>
      <p><b>Rules</b> (${ALL_RULES.length})</p>
      <div id="rule-list" style="columns:2;max-width:760px"></div>
      <p><b>Ignore list</b> — one CSS selector per line (<code>host::shadow selector</code> pierces shadow roots):</p>
      <textarea id="ignore" rows="3" style="width:100%;max-width:760px"
        placeholder=".dim&#10;img[src*='decorative']&#10;bad-card::shadow button.ghost-btn"></textarea>
    </details>
    <div id="export-bar"></div>
    <div id="results"></div>`;
  const list = panel.querySelector('#rule-list');
  for (const rule of ALL_RULES) {
    const lab = document.createElement('label');
    lab.style.display = 'block';
    lab.innerHTML = `<input type="checkbox" data-rule="${rule.id}" checked>
      <code>${rule.id}</code> — ${rule.description}`;
    list.appendChild(lab);
  }
  panel.querySelectorAll('input[name=level]').forEach((r) => {
    r.addEventListener('change', () => run());
  });
}

function renderResults(report, auditor) {
  const s = report.summary;
  const bar = panel.querySelector('#export-bar');
  bar.innerHTML = '';
  for (const fmt of ['json', 'html', 'csv', 'md']) {
    const b = document.createElement('button');
    b.textContent = `Export ${fmt.toUpperCase()}`;
    b.style.margin = '.2rem .4rem .2rem 0';
    b.addEventListener('click', () => auditor.downloadReport(report, fmt));
    bar.appendChild(b);
  }

  const el = panel.querySelector('#results');
  const rows = report.findings.map((f) => `
    <tr class="i-${f.impact}${f.incomplete ? ' review' : ''}">
      <td>${f.impact}${f.incomplete ? '<br><small>review</small>' : ''}</td>
      <td><code>${f.ruleId}</code><br><small>${f.wcag || ''}</small></td>
      <td>${escapeHtml(f.target)}</td>
      <td>${escapeHtml(f.message)}<br><b>Fix:</b> ${escapeHtml(f.fix || '')}</td>
    </tr>`).join('');
  el.innerHTML = `
    <h2>Results</h2>
    <p><b>${s.violations}</b> violations, ${s.incomplete} need manual review —
      critical ${s.byImpact.critical}, serious ${s.byImpact.serious},
      moderate ${s.byImpact.moderate}, minor ${s.byImpact.minor}
      ${report.closedShadowRoots ? ` · ${report.closedShadowRoots} closed shadow root(s)` : ''}
    </p>
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
      <thead><tr><th>Impact</th><th>Rule</th><th>Target</th><th>Message &amp; fix</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

let lastAuditor = null;
async function run() {
  if (!panel.querySelector('#rule-list')) renderConfig();
  const level = panel.querySelector('input[name=level]:checked')?.value || 'AA';
  const config = readConfig();
  config.level = level;
  status.textContent = 'Auditing…';
  lastAuditor = createAuditor(config);
  const report = await lastAuditor.audit();
  renderResults(report, lastAuditor);
  status.textContent = `Done — ${report.summary.violations} violations in ${report.durationMs}ms`;
}

runBtn.addEventListener('click', run);
// Auto-run once so the demo immediately demonstrates the output.
window.addEventListener('load', () => setTimeout(run, 100));
