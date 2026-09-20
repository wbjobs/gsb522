// 内置规则集。每条规则 run(ctx) 返回 issue 数组；color-contrast 为异步（走 Worker）。
import {
  walkDeep, isVisible, accessibleName, describeElement, selectorPath,
  collectTextElements, getEffectiveBackground,
} from './dom-utils.js';
import { parseColor } from './color.js';
import { keyboardStaticIssues, simulateFocus } from './focus.js';

const ARIA_ATTRS = new Set([
  'aria-activedescendant', 'aria-atomic', 'aria-autocomplete', 'aria-busy',
  'aria-checked', 'aria-colcount', 'aria-colindex', 'aria-colspan', 'aria-controls',
  'aria-current', 'aria-describedby', 'aria-description', 'aria-details',
  'aria-disabled', 'aria-dropeffect', 'aria-errormessage', 'aria-expanded',
  'aria-flowto', 'aria-grabbed', 'aria-haspopup', 'aria-hidden', 'aria-invalid',
  'aria-keyshortcuts', 'aria-label', 'aria-labelledby', 'aria-level', 'aria-live',
  'aria-modal', 'aria-multiline', 'aria-multiselectable', 'aria-orientation',
  'aria-owns', 'aria-placeholder', 'aria-posinset', 'aria-pressed', 'aria-readonly',
  'aria-relevant', 'aria-required', 'aria-roledescription', 'aria-rowcount',
  'aria-rowindex', 'aria-rowspan', 'aria-selected', 'aria-setsize', 'aria-sort',
  'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext',
]);

const VALID_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell',
  'checkbox', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition',
  'dialog', 'directory', 'document', 'feed', 'figure', 'form', 'grid', 'gridcell',
  'group', 'heading', 'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main',
  'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'navigation', 'none', 'note', 'option', 'presentation',
  'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader',
  'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status',
  'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'timer',
  'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

// 角色 -> 必需的 aria 状态/属性
const REQUIRED_STATE_BY_ROLE = {
  checkbox: ['aria-checked'],
  switch: ['aria-checked'],
  radio: ['aria-checked'],
  scrollbar: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
  slider: ['aria-valuenow'],
  spinbutton: ['aria-valuenow'],
  combobox: ['aria-expanded'],
  option: ['aria-selected'],
  heading: [],
};

const ARIA_VALUE_ENUMS = {
  'aria-checked': ['true', 'false', 'mixed'],
  'aria-expanded': ['true', 'false'],
  'aria-hidden': ['true', 'false'],
  'aria-pressed': ['true', 'false', 'mixed'],
  'aria-selected': ['true', 'false'],
  'aria-invalid': ['true', 'false', 'grammar', 'spelling'],
  'aria-current': ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
  'aria-live': ['off', 'polite', 'assertive'],
  'aria-autocomplete': ['inline', 'list', 'both', 'none'],
  'aria-orientation': ['horizontal', 'vertical'],
  'aria-sort': ['ascending', 'descending', 'none', 'other'],
};

function issue(ruleId, severity, el, message, suggestion) {
  return {
    ruleId,
    severity,
    message,
    suggestion,
    selector: el ? selectorPath(el) : '(document)',
    element: el ? describeElement(el) : '(document)',
  };
}

export const RULES = {
  // 颜色对比度：收集文本元素，交给 Worker 批量计算。
  'color-contrast': {
    name: '颜色对比度',
    async: true,
    async run(ctx) {
      const items = collectTextElements(ctx.root);
      const jobs = [];
      const meta = [];
      items.forEach(({ el, text, style }, index) => {
        const fg = parseColor(style.color);
        if (!fg) return;
        const bg = getEffectiveBackground(el);
        jobs.push({
          id: index,
          fg,
          bg,
          fontSize: parseFloat(style.fontSize),
          fontWeight: style.fontWeight,
          level: ctx.level,
        });
        meta.push({ el, text: text.slice(0, 40), fg, bg });
      });
      const results = await ctx.runContrastJobs(jobs);
      const issues = [];
      for (const res of results) {
        if (res.pass) continue;
        const { el, text, fg, bg } = meta[res.id];
        issues.push({
          ruleId: 'color-contrast',
          severity: 'serious',
          message: `文本 "${text}" 对比度 ${res.ratio}:1，低于要求的 ${res.required}:1`
            + `（${res.largeText ? '大字号' : '普通'}文本，WCAG ${ctx.level}）`,
          suggestion: `将前景色调深或背景调亮，使对比度 ≥ ${res.required}:1。`
            + `当前前景 rgb(${fg.r},${fg.g},${fg.b})，背景 rgb(${bg.r},${bg.g},${bg.b})。`,
          selector: selectorPath(el),
          element: describeElement(el),
          details: { ratio: res.ratio, required: res.required, fg, bg },
        });
      }
      return issues;
    },
  },

  'aria-valid-attr': {
    name: 'ARIA 属性名合法',
    run(ctx) {
      const issues = [];
      walkDeep(ctx.root, (el) => {
        if (!el.getAttributeNames) return;
        for (const attr of el.getAttributeNames()) {
          if (attr.startsWith('aria-') && !ARIA_ATTRS.has(attr)) {
            issues.push(issue('aria-valid-attr', 'serious', el,
              `元素 ${describeElement(el)} 使用了不存在的 ARIA 属性 "${attr}"`,
              '检查拼写；参考 WAI-ARIA 规范中的合法属性列表。'));
          }
        }
      });
      return issues;
    },
  },

  'aria-valid-attr-value': {
    name: 'ARIA 属性值合法',
    run(ctx) {
      const issues = [];
      walkDeep(ctx.root, (el) => {
        if (!el.getAttributeNames) return;
        for (const attr of el.getAttributeNames()) {
          const allowed = ARIA_VALUE_ENUMS[attr];
          if (!allowed) continue;
          const value = el.getAttribute(attr);
          if (value !== null && !allowed.includes(value)) {
            issues.push(issue('aria-valid-attr-value', 'serious', el,
              `元素 ${describeElement(el)} 的 ${attr}="${value}" 不是合法值`,
              `${attr} 允许的值：${allowed.join(' / ')}。`));
          }
        }
      });
      return issues;
    },
  },

  'aria-valid-role': {
    name: 'role 值合法',
    run(ctx) {
      const issues = [];
      walkDeep(ctx.root, (el) => {
        const role = el.getAttribute && el.getAttribute('role');
        if (!role) return;
        for (const token of role.trim().split(/\s+/)) {
          if (!VALID_ROLES.has(token)) {
            issues.push(issue('aria-valid-role', 'serious', el,
              `元素 ${describeElement(el)} 使用了无效 role "${token}"`,
              '移除或替换为合法的 ARIA role。'));
          }
        }
      });
      return issues;
    },
  },

  'aria-required-attr': {
    name: '角色必需 ARIA 属性',
    run(ctx) {
      const issues = [];
      walkDeep(ctx.root, (el) => {
        const role = el.getAttribute && el.getAttribute('role');
        if (!role) return;
        const required = REQUIRED_STATE_BY_ROLE[role.trim().split(/\s+/)[0]];
        if (!required) return;
        for (const attr of required) {
          if (!el.hasAttribute(attr)) {
            issues.push(issue('aria-required-attr', 'critical', el,
              `role="${role}" 的元素 ${describeElement(el)} 缺少必需属性 ${attr}`,
              `添加 ${attr} 以向辅助技术暴露当前状态。`));
          }
        }
      });
      return issues;
    },
  },

  'label': {
    name: '表单控件标签',
    run(ctx) {
      const issues = [];
      walkDeep(ctx.root, (el) => {
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;
        if (tag === 'input') {
          const type = (el.getAttribute('type') || 'text').toLowerCase();
          if (['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) return;
        }
        if (!isVisible(el)) return;
        if (!accessibleName(el)) {
          issues.push(issue('label', 'critical', el,
            `表单控件 ${describeElement(el)} 没有可访问名称`,
            '添加关联的 <label for>、包裹式 <label>、aria-label 或 aria-labelledby。'));
        }
      });
      return issues;
    },
  },

  'image-alt': {
    name: '图片替代文本',
    run(ctx) {
      const issues = [];
      walkDeep(ctx.root, (el) => {
        if (el.tagName !== 'IMG') return;
        if (!isVisible(el)) return;
        if (el.getAttribute('role') === 'presentation' || el.getAttribute('role') === 'none') return;
        if (!el.hasAttribute('alt')) {
          issues.push(issue('image-alt', 'critical', el,
            `图片 ${describeElement(el)} 缺少 alt 属性`,
            '为有意义的图片添加描述性 alt；纯装饰图片使用 alt="" 或 role="presentation"。'));
        }
      });
      return issues;
    },
  },

  'button-name': {
    name: '按钮可访问名称',
    run(ctx) {
      const issues = [];
      walkDeep(ctx.root, (el) => {
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        const isButton = tag === 'button'
          || (tag === 'input' && ['button', 'submit', 'reset'].includes((el.getAttribute('type') || '').toLowerCase()))
          || el.getAttribute('role') === 'button';
        if (!isButton) return;
        if (!isVisible(el)) return;
        if (!accessibleName(el)) {
          issues.push(issue('button-name', 'critical', el,
            `按钮 ${describeElement(el)} 没有可访问名称`,
            '添加文本内容、aria-label 或 aria-labelledby；图标按钮必须提供 aria-label。'));
        }
      });
      return issues;
    },
  },

  'link-name': {
    name: '链接可访问名称',
    run(ctx) {
      const issues = [];
      walkDeep(ctx.root, (el) => {
        const isLink = (el.tagName === 'A' && el.hasAttribute('href'))
          || el.getAttribute('role') === 'link';
        if (!isLink) return;
        if (!isVisible(el)) return;
        if (!accessibleName(el)) {
          issues.push(issue('link-name', 'serious', el,
            `链接 ${describeElement(el)} 没有可访问名称`,
            '为链接添加文本内容或 aria-label。'));
        }
      });
      return issues;
    },
  },

  'duplicate-id': {
    name: 'ID 唯一性',
    run(ctx) {
      const issues = [];
      const seen = new Map();
      walkDeep(ctx.root, (el) => {
        if (!el.id) return;
        // id 只需在同一 root（document 或 shadow root）内唯一
        const root = el.getRootNode();
        const key = `${root === document ? 'doc' : (root.host ? describeElement(root.host) : 'frag')}::${el.id}`;
        if (seen.has(key)) {
          issues.push(issue('duplicate-id', 'minor', el,
            `元素 ${describeElement(el)} 的 id "${el.id}" 在同一作用域内重复`,
            '保证 id 唯一，否则 label[for]、aria-labelledby 等引用会产生歧义。'));
        } else {
          seen.set(key, el);
        }
      });
      return issues;
    },
  },

  'heading-order': {
    name: '标题层级顺序',
    run(ctx) {
      const issues = [];
      let lastLevel = 0;
      walkDeep(ctx.root, (el) => {
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        let level = 0;
        if (/^h[1-6]$/.test(tag)) level = parseInt(tag[1], 10);
        else if (el.getAttribute && el.getAttribute('role') === 'heading') {
          level = parseInt(el.getAttribute('aria-level') || '2', 10);
        }
        if (!level) return;
        if (lastLevel && level > lastLevel + 1) {
          issues.push(issue('heading-order', 'moderate', el,
            `标题层级从 h${lastLevel} 跳到 h${level}（${describeElement(el)}）`,
            `按层级递进使用标题，当前应使用 h${lastLevel + 1}。`));
        }
        lastLevel = level;
      });
      return issues;
    },
  },

  'document-title': {
    name: '页面标题',
    run(ctx) {
      if (ctx.root !== document && ctx.root.nodeType !== Node.DOCUMENT_NODE) return [];
      if (document.title && document.title.trim()) return [];
      return [issue('document-title', 'serious', null,
        '页面缺少 <title>', '在 <head> 中添加描述页面用途的 <title>。')];
    },
  },

  'html-lang': {
    name: '页面语言',
    run(ctx) {
      if (ctx.root !== document && ctx.root.nodeType !== Node.DOCUMENT_NODE) return [];
      const lang = document.documentElement.getAttribute('lang');
      if (lang && lang.trim()) return [];
      return [issue('html-lang', 'serious', null,
        '<html> 缺少 lang 属性', '设置 <html lang="zh-CN"> 等，帮助屏幕阅读器选择正确发音。')];
    },
  },

  'keyboard-accessible': {
    name: '键盘可达性（静态）',
    run(ctx) {
      return keyboardStaticIssues(ctx.root);
    },
  },

  'focus-simulation': {
    name: '焦点顺序模拟',
    run(ctx) {
      const { issues } = simulateFocus(ctx.root);
      return issues;
    },
  },
};

export const DEFAULT_RULE_CONFIG = Object.fromEntries(
  Object.keys(RULES).map((id) => [id, { enabled: true }]),
);
