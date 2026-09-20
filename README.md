# dom-a11y-audit

A zero-dependency, in-browser DOM accessibility auditor. It scans the live DOM —
including open **Shadow DOM** — for WCAG issues, gives an actionable fix for each
finding, and exports reports. The expensive work (pixel/color math) runs in a
**Web Worker**, and the page can be watched for dynamic changes.

## Checks (23 rules)

| Area | Rules |
| --- | --- |
| Color contrast (WCAG 1.4.3, AA/AAA, large text) | `color-contrast` |
| ARIA validity | `aria-valid-role`, `aria-valid-attr`, `aria-valid-value`, `aria-idrefs`, `aria-presentation-conflict`, `aria-required-owned`, `aria-hidden-focusable` |
| Names & labels | `img-alt`, `button-name`, `link-name`, `form-label`, `empty-heading`, `generic-click-name` |
| Structure | `heading-order`, `html-lang`, `document-title`, `bypass-blocks`, `no-blink-marquee`, `duplicate-id` |
| Focus & keyboard | `focus-indicator`, `tabindex-positive`, `keyboard-accessible` |

Closed shadow roots cannot be entered by design; hosts carrying them are
reported as `closed-shadow-root` ("needs review") rather than silently skipped.

## Usage in the browser

```js
import { createAuditor } from './src/platform/browser/index.js';

const auditor = createAuditor({
  level: 'AA',                 // 'AA' | 'AAA'
  rules: { 'img-alt': false }, // disable a rule
  ignore: [
    '.decorative',                              // CSS selector
    { selector: 'img.hero', rules: ['img-alt'] }, // ignore for one rule
    'bad-card::shadow button'                     // pierce a shadow boundary
  ],
  contrast: { canvas: true },  // rasterize to canvas for gradients/images
  workers: { enabled: true, minBatch: 40 },
  dynamic: { enabled: true, debounceMs: 300 }
});

const report = await auditor.audit();

auditor.downloadReport(report, 'json'); // 'json' | 'html' | 'csv' | 'md'
const md = auditor.exportReport(report, 'md');

const watcher = auditor.watch(); // re-audit on DOM mutations
watcher.disconnect();
```

Early instrumentation (optional) wraps `addEventListener` before page code runs
so the `keyboard-accessible` rule knows about click-only widgets registered
imperatively:

```js
import { instrument } from './src/platform/browser/index.js';
const stop = instrument(window); // call before app bundle loads
```

## How the hard parts work

- **Contrast math** — `src/core/color.js` parses `#hex`, `rgb(a)`, `hsl`,
  `hwb`, named colors; composites translucent layers up the ancestor chain
  (`flattenColor` + opacity stack); computes WCAG relative luminance/ratio and
  picks the AA/AAA threshold (4.5/3, 7/4.5).
- **Canvas sampling** — `src/platform/browser/canvas-sample.js` serializes each
  text element with its ancestor backgrounds into an SVG `foreignObject`,
  rasterizes it, and reads edge pixels. This handles gradients/background
  images that CSS parsing cannot. Results are prefetched asynchronously then
  read synchronously by the rule. A tainted canvas is reported as "needs
  review", never guessed.
- **Focus simulation** — `src/platform/browser/focus-probe.js` saves the active
  element/scroll position, calls `focus({preventScroll:true})` on every
  tabbable control, snapshots `:focus`-state computed styles, and restores
  state. The rule distinguishes a real `outline:none` reset from the UA
  default ring and checks for `box-shadow`/border replacements.
- **Keyboard reachability** — tab order is derived from tabindex/native
  semantics (`src/core/focus.js`); custom widgets with click handlers but no
  keyboard handler/tabindex are flagged (1.1, 2.1.1).
- **Shadow DOM** — `walkFlat` (`src/core/dom-utils.js`) flattens open shadow
  roots; headings, duplicate ids and ARIA id references are evaluated **per
  root** (ARIA references never cross shadow boundaries, exactly per spec).
- **Workers** — DOM-bound work stays on the main thread (DOM is not
  transferable); contrast *arithmetic* and pixel-bucket averaging move to a
  Worker created from a Blob URL (`src/platform/browser/worker-source.js`), so
  no bundler or separately hosted worker file is required. Large DOM walks are
  time-sliced to keep the page responsive.
- **Dynamic content** — `src/core/dynamic.js` observes `document` and every
  open shadow root via `MutationObserver`, auto-wires newly attached roots,
  and debounces re-audits.

## Configuration & ignore lists

- `level`: `'AA'` (4.5/3) or `'AAA'` (7/4.5).
- `rules`: `{ 'rule-id': false }` or `{ 'rule-id': { enabled: true, options } }`.
- `ignore`: CSS selectors (tag/id/class/`[attr]`, descendants, `::shadow`
  piercing), optionally scoped to rule ids; finding ids can also be muted.
- `includeIncomplete`: keep "needs review" items (tainted canvas, unresolved
  backgrounds) in the report.

## Report format

`{ tool, version, url, timestamp, durationMs, config, summary, findings,
closedShadowRoots }`. Each finding has a stable `id`, `ruleId`, `impact`
(critical/serious/moderate/minor), `wcag`, human `message`, concrete `fix`,
`target` path (with `::shadow` crossings), HTML `snippet`, and numeric `data`
(e.g. measured/required ratio, foreground/background hex). Exports: JSON,
HTML, CSV, Markdown.

## Demo

```bash
npm run demo        # http://localhost:8080/demo/
```

`demo/known-issues.html` plants contrast, ARIA, name, focus/keyboard and
shadow-DOM defects; the runner UI toggles rules, takes the ignore list, runs
the audit and offers all four exports.

## Tests (Node, zero dependencies)

```bash
npm test
```

The Node platform ships a small fake DOM (`src/platform/node/fake-dom.js`) with
open/closed shadow roots, computed styles and layout rects. Tests cover the
contrast math, every defect on a known-issues fixture (including defects inside
an open shadow root), rule toggles, ignore lists, closed-root reporting, all
four exporters, the browser platform under a DOM/Worker stub, and the exact
Worker source on a real Node worker thread.
