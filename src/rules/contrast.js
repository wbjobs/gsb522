import { contrastRatio, requiredContrast, isLargeText, rgbToHex } from '../core/color.js';
import { resolveColors, textCandidates } from '../core/color-resolve.js';

// Phase 1 runs on the main thread: walk DOM, resolve colors (computed styles
// or prefetched canvas samples), produce serializable tasks.
// Phase 2 is pure arithmetic over [r,g,b] triples and can run in a Worker via
// platform.runPureBatch (see browser platform + worker-source.js).
function extract(task, ctx) {
  const { fg, bg, source, incomplete, taint } = resolveColors(task.el, ctx);
  if (!bg) return { ...task, unresolved: true, type: 'contrast' };
  return {
    ...task, type: 'contrast',
    fgArr: [fg.r, fg.g, fg.b],
    bgArr: [bg.r, bg.g, bg.b],
    source, incomplete, taint
  };
}

// Pure worker-side mapping: identical to the luminance math shipped to the
// worker, so main-thread fallback and worker results always agree.
function computeRatio(task) {
  if (task.unresolved) return task;
  const ratio = contrastRatio(
    { r: task.fgArr[0], g: task.fgArr[1], b: task.fgArr[2] },
    { r: task.bgArr[0], g: task.bgArr[1], b: task.bgArr[2] }
  );
  return { ...task, ratio };
}

computeRatio.pure = true;
computeRatio.workerTask = 'contrast';
computeRatio.toInput = (task) => task;
computeRatio.fromOutput = (task, result) => {
  // Worker replies with the enriched task (containing ratio); accept both the
  // raw ratio-bearing object and a pass-through.
  if (result && typeof result.ratio === 'number') return result;
  return computeRatio(task);
};

export default {
  id: 'color-contrast',
  description: 'Text contrast meets WCAG ratio for its size/weight.',
  wcag: '1.4.3 / 1.4.11', impact: 'serious',
  async run(ctx) {
    const candidates = textCandidates(ctx.elements).filter(({ el }) => ctx.isVisible(el));
    const tasks = candidates.map(({ el, text }) => {
      const cs = ctx.computed(el);
      const fontSize = parseFloat(cs?.fontSize) || 16;
      const fontWeight = cs?.fontWeight || '400';
      const bold = /bold|[7-9]00/.test(String(fontWeight));
      return { el, text, fontSize, large: isLargeText(fontSize, bold ? 700 : 400) };
    });

    // DOM-bound extraction always runs here; arithmetic batches offload.
    const extracted = await ctx.parallel(tasks, (task) => extract(task, ctx));
    const results = await ctx.parallel(extracted, computeRatio);

    const minRatio = requiredContrast(ctx.config.level, false);
    for (const r of results) {
      if (r.unresolved) {
        if (ctx.config.includeIncomplete) {
          ctx.report({
            el: r.el, impact: 'minor', wcag: '1.4.3',
            message: 'Background could not be resolved; contrast needs manual review.',
            data: { foreground: r.text.slice(0, 60) }, incomplete: true
          });
        }
        continue;
      }
      const fg = { r: r.fgArr[0], g: r.fgArr[1], b: r.fgArr[2] };
      const bg = { r: r.bgArr[0], g: r.bgArr[1], b: r.bgArr[2] };
      const need = requiredContrast(ctx.config.level, r.large);
      if (r.ratio + 0.01 < need) {
        ctx.report({
          el: r.el,
          impact: r.ratio + 0.05 < minRatio - 1 ? 'critical' : 'serious',
          wcag: '1.4.3',
          message: `Contrast ${r.ratio.toFixed(2)}:1 is below the required ${need}:1 for ${r.large ? 'large ' : ''}text.`,
          fix: `Darken/lighten text or background. Foreground ${rgbToHex(fg)} on ${rgbToHex(bg)}; measured via ${r.source}.`,
          data: {
            ratio: Number(r.ratio.toFixed(2)), required: need,
            foreground: rgbToHex(fg), background: rgbToHex(bg),
            sampleText: r.text.slice(0, 60), fontSize: r.fontSize
          }
        });
      }
      if (r.incomplete && ctx.config.includeIncomplete) {
        ctx.report({
          el: r.el, impact: 'minor', wcag: '1.4.3',
          message: 'Background image or gradient present; computed ratio may not match rendered pixels.',
          data: { ratio: Number(r.ratio.toFixed(2)) }, incomplete: true
        });
      }
    }
  }
};
