import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor, contrastRatio, flattenColor, relativeLuminance,
  requiredContrast, isLargeText, rgbToHex
} from '../src/core/color.js';

test('parses hex, rgb, rgba, hsl and named colors', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#7777'), { r: 119, g: 119, b: 119, a: 0.4666666666666667 });
  assert.deepEqual(parseColor('rgb(0,0,0)'), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('rgba(0,0,0,0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor('red'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('hsl(120, 100%, 50%)'), { r: 0, g: 255, b: 0, a: 1 });
  assert.equal(parseColor('transparent').a, 0);
});

test('canonical WCAG contrast values', () => {
  const white = parseColor('#ffffff');
  const black = parseColor('#000000');
  assert.ok(Math.abs(contrastRatio(white, black) - 21) < 0.01);
  // #777 on white is the famous 4.48:1 (fails AA normal text)
  assert.ok(Math.abs(contrastRatio(parseColor('#777777'), white) - 4.48) < 0.02);
  // #595959 is exactly 7:1 on white
  const c = contrastRatio(parseColor('#595959'), white);
  assert.ok(c >= 7 && c < 7.05, `got ${c}`);
  assert.equal(relativeLuminance(white), 1);
  assert.equal(relativeLuminance(black), 0);
});

test('translucent colors composite over backdrops', () => {
  const half = parseColor('rgba(0,0,0,0.5)');
  const onWhite = flattenColor(half, parseColor('#fff'));
  assert.ok(Math.abs(onWhite.r - 127.5) < 1);
  const ratio = contrastRatio(onWhite, parseColor('#fff'));
  // 50% black over white => ~#808080 => 4.0:1 region
  assert.ok(ratio > 3.8 && ratio < 4.2, `got ${ratio}`);
});

test('WCAG thresholds and large-text logic', () => {
  assert.equal(requiredContrast('AA', false), 4.5);
  assert.equal(requiredContrast('AA', true), 3);
  assert.equal(requiredContrast('AAA', false), 7);
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(19, 700), true);
  assert.equal(isLargeText(18, 700), false);
  assert.equal(isLargeText(16, 400), false);
});

test('rgbToHex round trips', () => {
  assert.equal(rgbToHex({ r: 255, g: 0, b: 0 }), '#ff0000');
});
