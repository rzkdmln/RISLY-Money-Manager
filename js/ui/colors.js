/**
 * Colour helpers for the harmony-based picker.
 *
 * The palette is generated from a single base colour with classic colour-wheel
 * rules (analogous, complementary, split, triadic, tetradic, monochromatic).
 */
import { escapeAttr } from '../core/utils.js';

export const COLOR_HARMONY_MODES = Object.freeze([
  { id: 'analogous', label: 'Analog' },
  { id: 'complementary', label: 'Komplemen' },
  { id: 'split', label: 'Split' },
  { id: 'triadic', label: 'Triad' },
  { id: 'tetradic', label: 'Tetrad' },
  { id: 'monochromatic', label: 'Mono' },
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.split('').map((part) => part + part).join('')}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toUpperCase();
  return '';
}

export function hexToHsl(value) {
  const hex = normalizeHex(value) || '#3B82F6';
  const number = Number.parseInt(hex.slice(1), 16);
  const red = ((number >> 16) & 255) / 255;
  const green = ((number >> 8) & 255) / 255;
  const blue = (number & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

export function hslToHex(hue, saturation, lightness) {
  const h = ((Number(hue) % 360) + 360) % 360;
  const s = clamp(Number(saturation), 0, 100) / 100;
  const l = clamp(Number(lightness), 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = h / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (segment < 1) [red, green, blue] = [chroma, x, 0];
  else if (segment < 2) [red, green, blue] = [x, chroma, 0];
  else if (segment < 3) [red, green, blue] = [0, chroma, x];
  else if (segment < 4) [red, green, blue] = [0, x, chroma];
  else if (segment < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  const match = l - chroma / 2;
  const toHex = (channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase();
}

export function harmonyColors(baseHex, mode = 'analogous') {
  const base = normalizeHex(baseHex) || '#3B82F6';
  const { h, s, l } = hexToHsl(base);
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100);
  const lightness = clamp(l, 0, 100);
  // Harmonious variations look better when they keep a little chroma.
  const chroma = clamp(Math.max(saturation, 30), 12, 92);
  const tone = clamp(lightness, 22, 82);
  const make = (offset, sat = chroma, light = tone) => hslToHex(hue + offset, sat, clamp(light, 8, 92));

  let colors;
  switch (mode) {
    case 'complementary':
      colors = [
        make(0), make(180),
        make(0, chroma, tone + 14), make(180, chroma, tone + 14),
        make(0, chroma, tone - 14), make(180, chroma, tone - 14),
        make(12, chroma - 8), make(192, chroma - 8),
      ];
      break;
    case 'split':
      colors = [
        make(0), make(150), make(210),
        make(165), make(195),
        make(0, chroma, tone + 14),
        make(150, chroma, tone - 14),
        make(210, chroma, tone + 14),
      ];
      break;
    case 'triadic':
      colors = [
        make(0), make(120), make(240),
        make(0, chroma, tone + 14),
        make(120, chroma, tone + 14),
        make(240, chroma, tone + 14),
        make(0, chroma, tone - 14),
        make(120, chroma, tone - 14),
      ];
      break;
    case 'tetradic':
      colors = [
        make(0), make(90), make(180), make(270),
        make(0, chroma, tone + 14),
        make(90, chroma, tone - 14),
        make(180, chroma, tone + 14),
        make(270, chroma, tone - 14),
      ];
      break;
    case 'monochromatic':
      colors = [
        make(0, chroma, tone - 28),
        make(0, chroma, tone - 14),
        make(0, chroma, tone),
        make(0, chroma, tone + 14),
        make(0, chroma, tone + 28),
        make(0, clamp(chroma + 14, 10, 94), tone),
        make(0, clamp(chroma - 14, 8, 94), tone),
        make(0, chroma, tone - 20),
      ];
      break;
    case 'analogous':
    default:
      colors = [
        make(0), make(-40), make(-20), make(20), make(40),
        make(0, chroma, tone + 14),
        make(-20, chroma, tone - 14),
        make(20, chroma, tone + 14),
      ];
      break;
  }
  return [...new Set(colors.filter(Boolean))];
}

export function harmonySwatchMarkup(baseHex, mode, selectedHex) {
  const selected = normalizeHex(selectedHex);
  return harmonyColors(baseHex, mode).map((color) => {
    const active = selected && color.toLowerCase() === selected.toLowerCase() ? ' is-active' : '';
    return `<button type="button" class="color-swatch${active}" style="--pick-color:${escapeAttr(color)}" data-action="pick-color" data-color="${escapeAttr(color)}" aria-label="Warna ${escapeAttr(color)}"></button>`;
  }).join('');
}

export function quickSwatchMarkup(colors, selectedHex) {
  const selected = normalizeHex(selectedHex);
  return [...new Set(colors.filter(Boolean))].map((raw) => {
    const color = normalizeHex(raw) || raw;
  }).join('');
}

/* -------------------------------------------------------------------------- */
/*  Color field helpers                                                       */
/* -------------------------------------------------------------------------- */

function sameColor(first, second) {
  return String(first || '').toLowerCase() === String(second || '').toLowerCase();
}

export function applyColorFieldValue(field, color) {
  if (!field || !color) return;
  const hidden = field.querySelector('input[name="color"]');
  if (hidden) hidden.value = color;
  const chip = field.querySelector('.color-trigger-chip');
  if (chip) chip.style.setProperty('--pick-color', color);
  const label = field.querySelector('[data-color-label]');
  if (label) label.textContent = color;
  field.querySelectorAll('.color-swatch, .color-dot').forEach((dot) => {
    dot.classList.toggle('is-active', sameColor(dot.dataset.color, color));
  });
  const preview = field.closest('form')?.querySelector('.category-preview');
  if (preview) preview.style.setProperty('--preview-color', color);
}

export function refreshColorField(field) {
  if (!field) return;
  const custom = field.querySelector('[data-color-custom]');
  const hidden = field.querySelector('input[name="color"]');
  const base = field.dataset.colorBase || custom?.value || hidden?.value || '#3B82F6';
  const selected = hidden?.value || base;
  const mode = field.dataset.colorHarmony || 'analogous';
  const swatches = field.querySelector('[data-color-swatches]');
  if (swatches) swatches.innerHTML = harmonySwatchMarkup(base, mode, selected);
  applyColorFieldValue(field, selected);
}

export function setColorFieldBase(field, color) {
  if (!field || !color) return;
  field.dataset.colorBase = color;
  const custom = field.querySelector('[data-color-custom]');
  if (custom && !sameColor(custom.value, color)) custom.value = color;
  const hidden = field.querySelector('input[name="color"]');
  if (hidden) hidden.value = color;
  refreshColorField(field);
}
