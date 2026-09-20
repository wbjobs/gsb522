// 忽略列表匹配（纯函数，可在 Node 中测试）。
// 忽略条目格式：
//   { rule: 'color-contrast' }                  忽略整条规则
//   { selector: '#ad' }                         忽略匹配选择器的元素
//   { rule: 'image-alt', selector: 'img.logo' } 组合匹配
//   { selectorIncludes: 'shadow' }              选择器路径包含子串（跨 shadow 场景）

export function matchesIgnore(issue, ignoreEntry) {
  if (!ignoreEntry || typeof ignoreEntry !== 'object') return false;
  if (ignoreEntry.rule && ignoreEntry.rule !== issue.ruleId) return false;
  if (ignoreEntry.selector) {
    const sel = issue.selector || '';
    // 精确匹配路径，或路径以该选择器结尾（忽略条目写的是页面内选择器）
    if (sel !== ignoreEntry.selector
        && !sel.endsWith(ignoreEntry.selector)
        && !sel.includes(`> ${ignoreEntry.selector}`)) {
      return false;
    }
  }
  if (ignoreEntry.selectorIncludes) {
    const sel = issue.selector || '';
    if (!sel.includes(ignoreEntry.selectorIncludes)) return false;
  }
  return true;
}

export function applyIgnoreList(issues, ignoreList = []) {
  const kept = [];
  const ignored = [];
  for (const issue of issues) {
    if (ignoreList.some((entry) => matchesIgnore(issue, entry))) ignored.push(issue);
    else kept.push(issue);
  }
  return { kept, ignored };
}
