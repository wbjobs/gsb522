import { ARIA_ATTRIBUTES, TOKEN_VALUES, REQUIRED_OWNED, VALID_ROLES } from '../core/aria-data.js';
import { attr, resolveRole, tagOf, openShadowRoot } from '../core/dom-utils.js';

const IDREFS = new Set([
  'aria-activedescendant','aria-controls','aria-describedby','aria-details','aria-errormessage',
  'aria-flowto','aria-labelledby','aria-owns'
]);

const baseRules = [
  {
    id: 'aria-valid-role',
    description: 'role attribute must use a valid, non-abstract ARIA role.',
    wcag: '4.1.2', impact: 'serious',
    run(ctx) {
      for (const el of ctx.elements) {
        const role = resolveRole(el);
        if (role && typeof role === 'object' && role.invalid) {
          ctx.report({
            el, impact: 'serious', wcag: '4.1.2',
            message: `Unknown or abstract ARIA role "${role.invalid}".`,
            fix: role.invalid === 'presentation-like'
              ? 'Use role="presentation" or role="none".'
              : `Replace "${role.invalid}" with a valid ARIA 1.2 role or remove the attribute.`
          });
        }
      }
    }
  },
  {
    id: 'aria-valid-attr',
    description: 'Only valid aria-* attributes may be used.',
    wcag: '4.1.2', impact: 'moderate',
    run(ctx) {
      for (const el of ctx.elements) {
        for (const name of attrs(el)) {
          if (name.startsWith('aria-') && !ARIA_ATTRIBUTES.has(name)) {
            ctx.report({
              el, impact: 'moderate', wcag: '4.1.2',
              message: `Unknown ARIA attribute "${name}".`,
              fix: `Remove it or use the correct spelling from the ARIA specification.`
            });
          }
        }
      }
    }
  },
  {
    id: 'aria-valid-value',
    description: 'Token-type ARIA attributes must hold allowed values.',
    wcag: '4.1.2', impact: 'moderate',
    run(ctx) {
      for (const el of ctx.elements) {
        for (const [name, allowed] of Object.entries(TOKEN_VALUES)) {
          const raw = attr(el, name);
          if (raw == null) continue;
          const values = raw.split(/\s+/);
          const bad = values.find((v) => !allowed.includes(v));
          if (bad) {
            ctx.report({
              el, impact: 'moderate', wcag: '4.1.2',
              message: `"${name}="${raw}"" contains invalid value "${bad}".`,
              fix: `Use one of: ${allowed.join(', ')}.`
            });
          }
        }
        checkNumber(el, 'aria-level', ctx);
        checkNumber(el, 'aria-posinset', ctx);
        checkNumber(el, 'aria-setsize', ctx);
        checkNumber(el, 'aria-valuenow', ctx);
        checkNumber(el, 'aria-valuemax', ctx);
        checkNumber(el, 'aria-valuemin', ctx);
        const max = num(attr(el, 'aria-valuemax'));
        const min = num(attr(el, 'aria-valuemin'));
        const now = num(attr(el, 'aria-valuenow'));
        if (max != null && min != null && max < min) {
          ctx.report({ el, impact: 'moderate', wcag: '4.1.2',
            message: `aria-valuemax (${max}) is less than aria-valuemin (${min}).`,
            fix: 'Ensure valuemin <= valuenow <= valuemax.' });
        }
        if (now != null && max != null && now > max) {
          ctx.report({ el, impact: 'moderate', wcag: '4.1.2',
            message: `aria-valuenow (${now}) is above aria-valuemax (${max}).`, fix: 'Bring valuenow within range.' });
        }
      }
    }
  }
];

function checkNumber(el, name, ctx) {
  const v = attr(el, name);
  if (v == null) return;
  if (Number.isNaN(Number(v))) {
    ctx.report({ el, impact: 'moderate', wcag: '4.1.2',
      message: `"${name}" must be a number but got "${v}".`, fix: 'Provide a numeric value.' });
  }
}

const num = (v) => (v == null || v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));

function attrs(el) {
  const names = el.getAttributeNames ? el.getAttributeNames() : [];
  return [...names];
}

export const ariaRefsRule = {
  id: 'aria-idrefs',
  description: 'ID-referencing ARIA attributes must resolve (including across shadow roots).',
  wcag: '1.3.1 / 4.1.2', impact: 'serious',
  run(ctx) {
    for (const el of ctx.elements) {
      for (const name of IDREFS) {
        const raw = attr(el, name);
        if (!raw) continue;
        for (const id of raw.split(/\s+/)) {
          const owner = el.getRootNode ? el.getRootNode() : ctx.root;
          const found = owner.getElementById ? owner.getElementById(id) : null;
          if (!found) {
            // aria-* id refs never pierce shadow boundaries: a mismatch is real.
            ctx.report({
              el, impact: 'serious', wcag: '4.1.2',
              message: `${name} references id "${id}" which does not exist in this DOM root.`,
              fix: `Add id="${id}" to the target, or point the reference at an element in the same shadow root/document.`
            });
          }
        }
      }
    }
  }
};

export const presentationConflict = {
  id: 'aria-presentation-conflict',
  description: 'Focusable or global-ARIA elements cannot be role=presentation/none.',
  wcag: '4.1.2', impact: 'serious',
  run(ctx) {
    for (const el of ctx.elements) {
      const role = attr(el, 'role');
      if (!role || !['presentation', 'none'].includes(role.trim().split(/\s+/)[0])) continue;
      const focusable = attr(el, 'tabindex') != null || ['a','button','input','select','textarea'].includes(tagOf(el));
      const global = [...ARIA_ATTRIBUTES].some((a) => a.startsWith('aria-') && a !== 'aria-hidden' &&
        !['aria-hidden'].includes(a) && attr(el, a) != null);
      if (focusable) {
        ctx.report({
          el, impact: 'serious', wcag: '4.1.2',
          message: 'role="presentation" is ignored on a focusable element.',
          fix: 'Remove the role, or make the element non-focusable and apply the role to a wrapper.'
        });
      }
    }
  }
};

export const requiredOwnedRule = {
  id: 'aria-required-owned',
  description: 'Composite widgets must own their required child roles.',
  wcag: '1.3.1', impact: 'moderate',
  run(ctx) {
    for (const el of ctx.elements) {
      const role = resolveRole(el);
      const needs = typeof role === 'string' ? REQUIRED_OWNED[role] : null;
      if (!needs) continue;
      const childRoles = new Set();
      for (const child of (el.children || [])) {
        if (child.nodeType !== 1) continue;
        const r = resolveRole(child);
        if (typeof r === 'string') childRoles.add(r);
        const sr = openShadowRoot(child);
        if (sr) for (const inner of sr.children || []) {
          const ir = resolveRole(inner);
          if (typeof ir === 'string') childRoles.add(ir);
        }
      }
      if (![...childRoles].some((r) => needs.includes(r))) {
        ctx.report({
          el, impact: 'moderate', wcag: '1.3.1',
          message: `role="${role}" should contain at least one of: ${needs.join(', ')}.`,
          fix: `Add a child element with role ${needs[0]} (or the matching native element).`
        });
      }
    }
  }
};

export const ariaHiddenFocusable = {
  id: 'aria-hidden-focusable',
  description: 'aria-hidden elements must not contain focusable elements.',
  wcag: '4.1.2', impact: 'serious',
  run(ctx) {
    const FOCUSABLE_NATIVE = ['a','button','input','select','textarea'];
    for (const el of ctx.elements) {
      if (attr(el, 'aria-hidden') !== 'true') continue;
      const offenders = [];
      const selfFocusable = (node) => {
        if (attr(node, 'disabled') != null) return false;
        const ti = attr(node, 'tabindex');
        if (ti != null && Number(ti) >= 0) return true;
        return FOCUSABLE_NATIVE.includes(tagOf(node)) &&
          !(tagOf(node) === 'a' && attr(node, 'href') == null);
      };
      if (selfFocusable(el)) offenders.push(el);
      const stack = [...(el.children || [])];
      while (stack.length) {
        const node = stack.shift();
        if (node.nodeType === 1) {
          if (selfFocusable(node)) offenders.push(node);
          stack.push(...(node.children || []));
        }
      }
      for (const node of offenders) {
        ctx.report({
          el: node, impact: 'serious', wcag: '4.1.2',
          message: node === el
            ? 'Focusable element carries aria-hidden="true".'
            : 'Focusable element is inside an aria-hidden="true" subtree.',
          fix: 'Remove aria-hidden or make the control non-focusable (tabindex="-1"/disabled).'
        });
      }
    }
  }
};

export default [...baseRules, ariaRefsRule, presentationConflict, requiredOwnedRule, ariaHiddenFocusable];
