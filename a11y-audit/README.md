# a11y-audit

纯前端 DOM 无障碍审计工具。扫描当前页面，检测对比度、ARIA、焦点顺序、键盘可达性等问题，并给出可操作的修复建议。

## 特性

- **颜色对比度**：WCAG 2.x 相对亮度算法；沿组合树计算有效背景（含 alpha 混合）；Canvas 解析任意 CSS 颜色；批量计算下放到 Web Worker，不阻塞主线程。
- **ARIA 检测**：非法属性名 / 非法属性值 / 无效 role / 角色缺少必需状态属性。
- **焦点顺序**：收集 tabbable 元素（穿透 Shadow DOM），检测正 `tabindex`；`focus()` 逐个模拟，验证焦点真实落位（`deepActiveElement` 穿透 shadow root）。
- **键盘可达性**：可点击但不可聚焦、可聚焦但缺少键盘事件处理的元素。
- **动态内容**：`MutationObserver` 防抖重扫。
- **Shadow DOM**：遍历、背景计算、焦点模拟、选择器路径（`host ::shadow …`）全程支持；同源 iframe 也会进入。
- **规则配置 / 忽略列表 / 报告导出**（JSON + HTML）。

## 快速开始

```bash
cd a11y-audit
npm run demo          # 打开 http://localhost:8080
npm test              # 运行纯逻辑单元测试（Node，无需浏览器）
```

演示页 `index.html` 内置了一组已知问题（低对比度、缺 alt、无名按钮、跳级标题、正 tabindex、Shadow DOM 内问题等），打开后点击「运行扫描」即可验证。

## 用法

```js
import { A11yAudit } from './src/audit.js';

const audit = new A11yAudit({
  level: 'AA',                    // 或 'AAA'
  rules: {
    'color-contrast': { enabled: true },
    'focus-simulation': { enabled: false },   // 关闭某条规则
  },
  ignore: [
    { rule: 'image-alt' },                            // 忽略整条规则
    { selector: 'img.logo' },                         // 忽略匹配元素
    { rule: 'color-contrast', selectorIncludes: '.ad' }, // 组合条件
  ],
});

const report = await audit.scan();
audit.exportJSON();
audit.exportHTML();

// 动态内容监听
audit.observe((report) => console.log(report.summary));
```

## 内置规则

| 规则 ID | 说明 |
| --- | --- |
| `color-contrast` | 文本对比度（Worker 批量计算，AA/AAA，区分大字号） |
| `aria-valid-attr` / `aria-valid-attr-value` / `aria-valid-role` | ARIA 属性名 / 值 / role 合法性 |
| `aria-required-attr` | checkbox、slider 等角色缺少必需状态属性 |
| `label` | 表单控件缺少可访问名称 |
| `image-alt` / `button-name` / `link-name` | 替代文本与可访问名称 |
| `heading-order` | 标题层级跳跃 |
| `duplicate-id` | 同一作用域内 id 重复 |
| `document-title` / `html-lang` | 页面标题与语言 |
| `keyboard-accessible` | 可点击不可聚焦 / 缺少键盘事件 |
| `focus-simulation` | 逐个 focus() 模拟，验证焦点可达 |

## 目录结构

```
src/
  audit.js            主控：规则调度、Worker 管理、MutationObserver、导出
  rules.js            内置规则集
  color.js            颜色解析（Canvas 增强）与 WCAG 对比度（纯函数，可测）
  dom-utils.js        Shadow DOM 深度遍历、可见性、有效背景、可访问名称
  focus.js            tabbable 收集、焦点模拟、键盘可达性静态检查
  ignore.js           忽略列表匹配（纯函数，可测）
  report.js           报告构建与 JSON/HTML 导出
  contrast-worker.js  Web Worker：批量对比度计算
test/                 Node 单元测试（颜色数学、忽略匹配、报告结构）
index.html            含已知问题的演示页 + 审计面板
```

## 已知限制

- 背景图片 / 渐变上的文本以最近的有效背景色近似计算。
- 跨域 iframe 无法进入（浏览器安全限制）。
- 键盘事件检测基于 `on*` 属性与内联属性；`addEventListener` 注册的监听器无法枚举，可能漏报 `keyboard-no-key-handler`。
