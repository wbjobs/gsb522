// DOM 工具：Shadow DOM 深度遍历、可见性判断、有效背景色、可访问名称计算。
import { parseColor, blendAlpha } from './color.js';

// 深度遍历 root（含 shadow root 与同源 iframe），按文档顺序对每个元素调用 cb。
export function walkDeep(root, cb) {
  const visit = (node) => {
    if (!node) return;
    if (node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      for (const child of node.children || []) visit(child);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    cb(node);
    if (node.shadowRoot) visit(node.shadowRoot);
    // 同源 iframe（跨域会抛异常，直接跳过）
    if (node.tagName === 'IFRAME') {
      try {
        if (node.contentDocument) visit(node.contentDocument);
      } catch { /* 跨域，忽略 */ }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
}

export function deepQueryAll(root, predicate) {
  const out = [];
  walkDeep(root, (el) => {
    if (predicate(el)) out.push(el);
  });
  return out;
}

// 组合树父节点：优先 parentNode，shadow 内元素向上走到 host。
export function composedParent(el) {
  if (el.parentNode) {
    if (el.parentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE && el.parentNode.host) {
      return el.parentNode.host;
    }
    return el.parentNode.nodeType === Node.ELEMENT_NODE ? el.parentNode : null;
  }
  return null;
}

export function isHidden(el) {
  if (el.hidden) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true;
  if (parseFloat(style.opacity) === 0) return true;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0 && !el.querySelector(':scope > *')) return true;
  return false;
}

// 沿组合树向上判断元素是否真正可见。
export function isVisible(el) {
  let node = el;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.hidden) return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    node = composedParent(node);
  }
  return true;
}

// 计算元素的有效背景色：沿组合树向上收集背景色并做 alpha 混合，默认白底。
export function getEffectiveBackground(el) {
  const layers = [];
  let node = el;
  while (node) {
    const style = getComputedStyle(node);
    const bg = parseColor(style.backgroundColor);
    if (bg && bg.a > 0) layers.push(bg);
    if (bg && bg.a >= 1) break; // 不透明背景，停止向上
    node = composedParent(node);
  }
  let result = { r: 255, g: 255, b: 255, a: 1 }; // 页面默认白底
  for (let i = layers.length - 1; i >= 0; i--) {
    result = blendAlpha(layers[i], result);
  }
  return result;
}

// 元素自身（不含纯容器子树）的可见文本。
export function ownText(el) {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
  }
  return text.trim();
}

// 收集包含可见文本的元素（叶子级），用于对比度检测。
export function collectTextElements(root) {
  const out = [];
  walkDeep(root, (el) => {
    if (el.closest('[aria-hidden="true"]')) return;
    const text = ownText(el);
    if (!text) return;
    if (!isVisible(el)) return;
    const style = getComputedStyle(el);
    if (parseFloat(style.opacity) === 0) return;
    out.push({ el, text, style });
  });
  return out;
}

function resolveById(el, id) {
  const root = el.getRootNode();
  return root.getElementById ? root.getElementById(id) : null;
}

// 简化版可访问名称计算（ARIA accName 的核心路径）。
export function accessibleName(el) {
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const text = labelledby.split(/\s+/)
      .map((id) => resolveById(el, id))
      .filter(Boolean)
      .map((node) => node.textContent.trim())
      .join(' ')
      .trim();
    if (text) return text;
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return (el.getAttribute('alt') || '').trim();
  if (tag === 'input') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'submit' || type === 'reset') return el.value || (type === 'submit' ? 'Submit' : 'Reset');
    if (type === 'image') return (el.getAttribute('alt') || '').trim();
    // 关联 label
    const id = el.id;
    if (id) {
      const root = el.getRootNode();
      const label = root.querySelector ? root.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      if (label) return label.textContent.trim();
    }
    const wrapping = el.closest('label');
    if (wrapping) return wrapping.textContent.trim();
    if (el.getAttribute('title')) return el.getAttribute('title').trim();
    if (el.getAttribute('placeholder')) return el.getAttribute('placeholder').trim();
    return '';
  }
  if (tag === 'select' || tag === 'textarea') {
    const id = el.id;
    if (id) {
      const label = el.getRootNode().querySelector
        ? el.getRootNode().querySelector(`label[for="${CSS.escape(id)}"]`)
        : null;
      if (label) return label.textContent.trim();
    }
    const wrapping = el.closest('label');
    if (wrapping) return wrapping.textContent.trim();
    if (el.getAttribute('title')) return el.getAttribute('title').trim();
    return '';
  }
  if (tag === 'fieldset') {
    const legend = el.querySelector('legend');
    if (legend) return legend.textContent.trim();
  }
  if (el.getAttribute('title')) return el.getAttribute('title').trim();
  return (el.textContent || '').trim();
}

// 生成元素的可读定位描述（用于报告）。
export function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = typeof el.className === 'string' && el.className.trim()
    ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
    : '';
  const inShadow = el.getRootNode() instanceof ShadowRoot;
  return `${inShadow ? '[shadow] ' : ''}${tag}${id}${cls}`;
}

// 生成元素的唯一选择器路径（跨 shadow root 用 ::shadow 分隔）。
export function selectorPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      part += `#${CSS.escape(node.id)}`;
      parts.unshift(part);
      break;
    }
    const parent = node.parentNode;
    if (parent && parent.children) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === node.tagName,
      );
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      node = root.host;
      if (node) parts.unshift('::shadow');
    } else {
      node = node.parentElement;
    }
  }
  return parts.join(' > ').replace(/ > ::shadow > /g, ' ::shadow ');
}
