// 主控：规则调度、Worker 管理、动态内容监听、报告导出。
import { RULES, DEFAULT_RULE_CONFIG } from './rules.js';
import { applyIgnoreList } from './ignore.js';
import { buildReport, toHTML, download } from './report.js';

export class A11yAudit {
  /**
   * @param {object} options
   * @param {Node} [options.root] 扫描根，默认 document
   * @param {'AA'|'AAA'} [options.level] WCAG 等级
   * @param {object} [options.rules] 规则配置 { ruleId: { enabled, ... } }
   * @param {Array}  [options.ignore] 忽略列表
   * @param {string} [options.workerUrl] Worker 脚本地址
   */
  constructor(options = {}) {
    this.root = options.root || document;
    this.level = options.level || 'AA';
    this.ruleConfig = { ...DEFAULT_RULE_CONFIG, ...(options.rules || {}) };
    this.ignoreList = options.ignore || [];
    this.workerUrl = options.workerUrl
      || new URL('./contrast-worker.js', import.meta.url).href;
    this._worker = null;
    this._observer = null;
    this._debounceTimer = null;
    this.lastReport = null;
  }

  _getWorker() {
    if (!this._worker) {
      this._worker = new Worker(this.workerUrl);
    }
    return this._worker;
  }

  // 将对比度计算任务发给 Worker；Worker 不可用时回退到主线程。
  _runContrastJobs(jobs) {
    return new Promise((resolve) => {
      let worker;
      try {
        worker = this._getWorker();
      } catch {
        resolve(this._fallbackContrast(jobs));
        return;
      }
      const onMessage = (event) => {
        worker.removeEventListener('message', onMessage);
        resolve(event.data.results);
      };
      const onError = () => {
        worker.removeEventListener('error', onError);
        resolve(this._fallbackContrast(jobs));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError, { once: true });
      worker.postMessage({ jobs });
    });
  }

  async _fallbackContrast(jobs) {
    const { blendAlpha, contrastRatio, isLargeText, requiredRatio } = await import('./color.js');
    return jobs.map((job) => {
      const fg = blendAlpha(job.fg, job.bg);
      const largeText = isLargeText(job.fontSize, job.fontWeight);
      const required = requiredRatio(job.level || 'AA', largeText);
      const ratio = Math.round(contrastRatio(fg, job.bg) * 100) / 100;
      return { id: job.id, ratio, required, largeText, pass: ratio >= required };
    });
  }

  /** 执行一次完整扫描，返回报告对象。 */
  async scan() {
    const started = performance.now();
    const ctx = {
      root: this.root,
      level: this.level,
      runContrastJobs: (jobs) => this._runContrastJobs(jobs),
    };

    const allIssues = [];
    for (const [ruleId, rule] of Object.entries(RULES)) {
      const config = this.ruleConfig[ruleId];
      if (!config || config.enabled === false) continue;
      try {
        const issues = await rule.run(ctx, config);
        allIssues.push(...issues);
      } catch (err) {
        allIssues.push({
          ruleId,
          severity: 'minor',
          message: `规则执行出错：${err.message}`,
          suggestion: '请向工具维护者反馈。',
          selector: '(rule-engine)',
          element: '(rule-engine)',
        });
      }
    }

    const { kept, ignored } = applyIgnoreList(allIssues, this.ignoreList);
    this.lastReport = buildReport({
      issues: kept,
      ignored,
      durationMs: Math.round(performance.now() - started),
      ruleConfig: Object.fromEntries(
        Object.entries(this.ruleConfig).map(([id, cfg]) => [id, { enabled: cfg.enabled !== false }]),
      ),
    });
    return this.lastReport;
  }

  /**
   * 监听动态内容：DOM 变化后防抖重新扫描。
   * @param {(report) => void} callback 每次重扫后回调
   * @param {number} [debounceMs]
   */
  observe(callback, debounceMs = 500) {
    this.stopObserving();
    this._observer = new MutationObserver(() => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(async () => {
        const report = await this.scan();
        if (callback) callback(report);
      }, debounceMs);
    });
    const target = this.root.nodeType === Node.DOCUMENT_NODE ? this.root.documentElement : this.root;
    this._observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'alt', 'aria-label',
        'aria-labelledby', 'tabindex', 'role', 'lang', 'title', 'href', 'disabled'],
      characterData: true,
    });
    return this;
  }

  stopObserving() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    clearTimeout(this._debounceTimer);
    return this;
  }

  exportJSON(filename = 'a11y-report.json') {
    const report = this.lastReport;
    if (!report) throw new Error('请先执行 scan()');
    download(filename, JSON.stringify(report, null, 2), 'application/json');
  }

  exportHTML(filename = 'a11y-report.html') {
    const report = this.lastReport;
    if (!report) throw new Error('请先执行 scan()');
    download(filename, toHTML(report), 'text/html');
  }

  destroy() {
    this.stopObserving();
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  }
}

export { RULES, DEFAULT_RULE_CONFIG };
