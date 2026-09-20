import contrast from './contrast.js';
import aria from './aria.js';
import names from './names.js';
import structure from './structure.js';
import keyboard from './keyboard.js';

export const ALL_RULES = [
  contrast,
  ...aria,
  ...names,
  ...structure,
  ...keyboard
];

export function buildRuleMap(rules = ALL_RULES) {
  const map = new Map();
  for (const rule of rules) map.set(rule.id, rule);
  return map;
}
