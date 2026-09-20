// 焦点顺序与键盘可达性：tabbable 收集（跨 shadow DOM）、焦点模拟。
import { walkDeep, isVisible, describeElement, selectorPath } from './dom-utils.js';

const TABBABLE_SELECTOR = [
  'a[href]', 'area[href]', 'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'iframe', 'object', 'embed',
  '[contenteditable="true"]', '[tabindex]', 'audio[controls]', 'video[controls]',
  'summary',
].join(',');

function isDisabledOrHidden(el) {
  if (el.disabled) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  return !isVisible(el);
}

// 按文档顺序收集可聚焦元素（穿透 shadow root），并按 tabindex 规则排序：
// tabindex > 0 的排前面（按值升序），tabindex = 0 / 无 tabindex 按文档顺序。
export function collectTabbable(root) {
  const candidates = [];
  walkDeep(root, (el) => {
    if (!el.matches || !el.matches(TABBABLE_SELECTOR)) return;
    if (isDisabledOrHidden(el)) return;
    const tabindex = el.hasAttribute('tabindex')
      ? parseInt(el.getAttribute('tabindex'), 10)
      : 0;
    if (Number.isNaN(tabindex) || tabindex < 0) return;
    candidates.push({ el, tabindex, order: candidates.length });
  });
  const positive = candidates.filter((c) => c.tabindex > 0).sort((a, b) => a.tabindex - b.tabindex);
  const natural = candidates.filter((c) => c.tabindex === 0);
  return [...positive, ...natural].map((c) => c.el);
}

// 组合式 activeElement：逐层穿透 shadow root 拿到真实聚焦元素。
export function deepActiveElement(doc = document) {
  let active = doc.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

// 焦点模拟：依次 focus() 每个可聚焦元素，验证焦点真的落上去。
// 返回 { issues, sequence }。调用方负责在结束后恢复焦点。
export function simulateFocus(root) {
  const issues = [];
  const sequence = [];
  const tabbable = collectTabbable(root);
  const previousActive = deepActiveElement();

  for (const el of tabbable) {
    let ok = true;
    try {
      el.focus({ preventScroll: true });
    } catch {
      try { el.focus(); } catch { ok = false; }
    }
    const actual = deepActiveElement();
    if (ok && actual !== el) ok = false;
    sequence.push({ selector: selectorPath(el), focusable: ok });
    if (!ok) {
      issues.push({
        ruleId: 'focus-unreachable',
        severity: 'serious',
        message: `元素 ${describeElement(el)} 在 tab 序列中但无法获得焦点`,
        suggestion: '检查元素是否被禁用、被遮挡，或祖先存在 pointer-events/焦点拦截；'
          + '自定义元素需设置 tabindex="0" 或 delegatesFocus。',
        selector: selectorPath(el),
      });
    }
  }

  // 恢复之前焦点
  try {
    if (previousActive && previousActive.focus) previousActive.focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  } catch { /* 忽略恢复失败 */ }

  return { issues, sequence };
}

// 键盘可达性静态检查：可点击但不可聚焦、正 tabindex、交互元素缺少键盘事件。
export function keyboardStaticIssues(root) {
  const issues = [];
  walkDeep(root, (el) => {
    if (!el.matches) return;
    if (isDisabledOrHidden(el)) return;

    // 正 tabindex 破坏自然焦点顺序
    if (el.hasAttribute('tabindex')) {
      const tab = parseInt(el.getAttribute('tabindex'), 10);
      if (tab > 0) {
        issues.push({
          ruleId: 'focus-order-positive-tabindex',
          severity: 'moderate',
          message: `元素 ${describeElement(el)} 使用了 tabindex="${tab}"（正值）`,
          suggestion: '移除正 tabindex，改用 tabindex="0" 并依靠 DOM 顺序表达焦点顺序。',
          selector: selectorPath(el),
        });
      }
    }

    const tag = el.tagName.toLowerCase();
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'summary', 'audio', 'video'];
    const role = el.getAttribute('role');
    const isNativeInteractive = interactiveTags.includes(tag);
    const hasClickHandler = typeof el.onclick === 'function'
      || el.hasAttribute('onclick')
      || role === 'button' || role === 'link' || role === 'checkbox'
      || role === 'tab' || role === 'menuitem' || role === 'switch';

    if (hasClickHandler && !isNativeInteractive) {
      const tabindex = el.getAttribute('tabindex');
      const focusable = tabindex !== null && parseInt(tabindex, 10) >= 0;
      if (!focusable) {
        issues.push({
          ruleId: 'keyboard-clickable-not-focusable',
          severity: 'critical',
          message: `元素 ${describeElement(el)} 可点击（${role ? `role="${role}"` : '绑定了 click'}）但无法通过键盘聚焦`,
          suggestion: '添加 tabindex="0" 并提供 keydown（Enter/Space）处理；更推荐直接使用 <button>。',
          selector: selectorPath(el),
        });
      } else if (role === 'button' || (!role && tag === 'div') || (!role && tag === 'span')) {
        const hasKeyHandler = typeof el.onkeydown === 'function' || typeof el.onkeyup === 'function'
          || typeof el.onkeypress === 'function' || el.hasAttribute('onkeydown')
          || el.hasAttribute('onkeyup') || el.hasAttribute('onkeypress');
        if (!hasKeyHandler) {
          issues.push({
            ruleId: 'keyboard-no-key-handler',
            severity: 'serious',
            message: `元素 ${describeElement(el)} 可聚焦且绑定了点击，但未检测到键盘事件处理`,
            suggestion: '为 Enter / Space 添加 keydown 处理，或改用原生 <button>（自带键盘行为）。',
            selector: selectorPath(el),
          });
        }
      }
    }
  });
  return issues;
}
