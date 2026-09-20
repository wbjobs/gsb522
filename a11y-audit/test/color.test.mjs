import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColorPure, hslToRgb, blendAlpha, relativeLuminance,
  contrastRatio, isLargeText, requiredRatio, meetsContrast,
} from '../src/color.js';

test('parseColorPure: hex 格式', () => {
  assert.deepEqual(parseColorPure('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColorPure('#000000'), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColorPure('#ff000080'), { r: 255, g: 0, b: 0, a: 128 / 255 });
  assert.equal(parseColorPure('#ff00ff').r, 255);
});

test('parseColorPure: rgb/rgba 格式', () => {
  assert.deepEqual(parseColorPure('rgb(255, 0, 0)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColorPure('rgba(0, 128, 255, 0.5)'), { r: 0, g: 128, b: 255, a: 0.5 });
  assert.deepEqual(parseColorPure('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColorPure('rgb(100%, 0%, 0%)'), { r: 255, g: 0, b: 0, a: 1 });
});

test('parseColorPure: hsl 与命名色', () => {
  assert.deepEqual(parseColorPure('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColorPure('hsla(120, 100%, 25%, 0.8)'), { r: 0, g: 128, b: 0, a: 0.8 });
  assert.deepEqual(parseColorPure('white'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(parseColorPure('rebeccapurple').r, 102);
  assert.equal(parseColorPure('not-a-color'), null);
});

test('hslToRgb 边界', () => {
  assert.deepEqual(hslToRgb(0, 0, 1), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hslToRgb(0, 0, 0), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hslToRgb(240, 1, 0.5), { r: 0, g: 0, b: 255 });
});

test('relativeLuminance: 黑 0 白 1', () => {
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
  const white = relativeLuminance({ r: 255, g: 255, b: 255 });
  assert.ok(Math.abs(white - 1) < 1e-9);
});

test('contrastRatio: 黑白 = 21:1，同色 = 1:1', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  assert.ok(Math.abs(contrastRatio(black, white) - 21) < 1e-9);
  assert.equal(contrastRatio(white, black), contrastRatio(black, white));
  assert.equal(contrastRatio(white, white), 1);
});

test('contrastRatio: 已知值 #777 on #fff ≈ 4.48', () => {
  const ratio = contrastRatio({ r: 119, g: 119, b: 119 }, { r: 255, g: 255, b: 255 });
  assert.ok(Math.abs(ratio - 4.48) < 0.01, `实际 ${ratio}`);
});

test('blendAlpha: 半透明黑叠白底', () => {
  const blended = blendAlpha({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(blended, { r: 128, g: 128, b: 128, a: 1 });
  const opaque = blendAlpha({ r: 10, g: 20, b: 30, a: 1 }, { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(opaque, { r: 10, g: 20, b: 30, a: 1 });
});

test('isLargeText 与 requiredRatio', () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(18.66, 700), true);
  assert.equal(isLargeText(18, 'bold'), false);
  assert.equal(isLargeText(16, 400), false);
  assert.equal(requiredRatio('AA', false), 4.5);
  assert.equal(requiredRatio('AA', true), 3);
  assert.equal(requiredRatio('AAA', false), 7);
  assert.equal(requiredRatio('AAA', true), 4.5);
  assert.equal(meetsContrast(4.5, 'AA', false), true);
  assert.equal(meetsContrast(4.49, 'AA', false), false);
});
