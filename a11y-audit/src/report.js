// 报告生成与导出（JSON / HTML）。

const SEVERITY_ORDER = ['critical', 'serious', 'moderate', 'minor'];
const SEVERITY_LABEL = {
  critical: '严重', serious: '高', moderate: '中', minor: '低',
};

export function summarize(issues) {
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const byRule = {};
  for (const issue of issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    byRule[issue.ruleId] = (byRule[issue.ruleId] || 0) + 1;
  }
  return { total: issues.length, bySeverity, byRule };
}

export function buildReport({ issues, ignored, url, durationMs, ruleConfig }) {
  return {
    tool: 'a11y-audit',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    url: url || (typeof location !== 'undefined' ? location.href : ''),
    durationMs,
    summary: summarize(issues),
    ignoredCount: ignored ? ignored.length : 0,
    rules: ruleConfig,
    issues,
    ignored: ignored || [],
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toHTML(report) {
  const rows = report.issues
    .slice()
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
    .map((issue) => `
      <tr class="sev-${issue.severity}">
        <td><span class="badge">${SEVERITY_LABEL[issue.severity] || issue.severity}</span></td>
        <td>${escapeHtml(issue.ruleId)}</td>
        <td>${escapeHtml(issue.message)}</td>
        <td><code>${escapeHtml(issue.selector)}</code></td>
        <td>${escapeHtml(issue.suggestion)}</td>
      </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>无障碍审计报告 - ${escapeHtml(report.url)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  code { background: #f6f6f6; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  .badge { padding: 2px 8px; border-radius: 10px; color: #fff; font-size: 12px; }
  .sev-critical .badge { background: #b00020; }
  .sev-serious .badge { background: #d2691e; }
  .sev-moderate .badge { background: #8a6d00; }
  .sev-minor .badge { background: #555; }
  .summary span { margin-right: 1.5rem; }
</style>
</head>
<body>
  <h1>无障碍审计报告</h1>
  <p class="summary">
    <span>页面：${escapeHtml(report.url)}</span>
    <span>时间：${escapeHtml(report.timestamp)}</span>
    <span>问题总数：<strong>${report.summary.total}</strong></span>
    <span>严重 ${report.summary.bySeverity.critical} / 高 ${report.summary.bySeverity.serious}
      / 中 ${report.summary.bySeverity.moderate} / 低 ${report.summary.bySeverity.minor}</span>
    <span>已忽略：${report.ignoredCount}</span>
  </p>
  <table>
    <thead><tr><th>级别</th><th>规则</th><th>问题</th><th>元素</th><th>修复建议</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">未发现问题</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

export function download(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
