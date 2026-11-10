/**
 * RISLY — Custom UI Actions.
 * Domain: ui
 */

export const uiActions = {
  'switch-networth': (element) => {
    const targetId = element.dataset.target === 'family' ? 'family' : 'personal';

    ['personal', 'family'].forEach((key) => {
      const node = document.getElementById(`networth-${key}`);
      if (!node) return;
      const active = key === targetId;
      node.classList.toggle('hidden', !active);
      node.classList.toggle('block', active);
    });

    const container = element.parentElement;
    const buttons = container.querySelectorAll('button');
    buttons.forEach((b) => {
      b.classList.remove('bg-white/20', 'text-white', 'shadow-sm');
      b.classList.add('text-white/70');
      b.setAttribute('aria-pressed', 'false');
    });

    element.classList.remove('text-white/70');
    element.classList.add('bg-white/20', 'text-white', 'shadow-sm');
    element.setAttribute('aria-pressed', 'true');
  },
};
