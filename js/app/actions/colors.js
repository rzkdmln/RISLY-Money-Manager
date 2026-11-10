/**
 * RISLY — Color Actions.
 * Domain: colors
 */

import { applyColorFieldValue, refreshColorField } from '../../ui/colors.js';

export const colorActions = {
  'toggle-color-picker': (element) => {
    const field = element.closest('[data-color-field]');
    const panel = field?.querySelector('[data-color-panel]');
    if (!panel) return;
    const open = panel.hasAttribute('hidden');
    if (open) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
    element.setAttribute('aria-expanded', String(open));
  },
  'color-harmony': (element) => {
    const field = element.closest('[data-color-field]');
    if (!field) return;
    field.dataset.colorHarmony = element.dataset.harmony || 'analogous';
    field
      .querySelectorAll('[data-action="color-harmony"]')
      .forEach((button) => {
        button.classList.toggle('is-active', button === element);
      });
    refreshColorField(field);
  },
  'pick-color': (element) => {
    const form = element.closest('form');
    if (!form) return;
    const color = element.dataset.color;
    const field = element.closest('[data-color-field]');
    if (field) {
      applyColorFieldValue(field, color);
    } else {
      const hidden = form.querySelector('input[name="color"]');
      if (hidden) hidden.value = color;
      form
        .querySelectorAll('.color-dot, .color-swatch')
        .forEach((dot) => {
          dot.classList.toggle('is-active', dot === element);
        });
      const preview = form.querySelector('.category-preview');
      if (preview)
        preview.style.setProperty('--preview-color', color);
    }
  },
};
