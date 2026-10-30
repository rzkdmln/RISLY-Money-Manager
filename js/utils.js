import { APP } from './config.js';

/* -------------------------------------------------------------------------- */
/*  IDs, dates, and general helpers                                           */
/* -------------------------------------------------------------------------- */

export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowISO() {
  return new Date().toISOString();
}

/** Local calendar date as YYYY-MM-DD (never shifted by the UTC offset). */
export function localDateISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO() {
  return localDateISO(new Date());
}

export function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getTime());
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addDaysISO(value, days) {
  const d = parseLocalDate(value) || new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return localDateISO(d);
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Add months while respecting an anchor day (Jan 31 -> Feb 28 -> Mar 31). */
export function addMonthsISO(value, months, anchorDay = null) {
  const d = parseLocalDate(value) || new Date();
  const targetDay = anchorDay || d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + Number(months || 0), 1);
  target.setDate(Math.min(targetDay, daysInMonth(target.getFullYear(), target.getMonth())));
  return localDateISO(target);
}

export function addYearsISO(value, years, anchorDay = null) {
  return addMonthsISO(value, Number(years || 0) * 12, anchorDay);
}

export function advanceDate(value, frequency, interval = 1, anchorDay = null) {
  const step = Math.max(1, Number(interval) || 1);
  switch (frequency) {
    case 'daily':
      return addDaysISO(value, step);
    case 'weekly':
      return addDaysISO(value, step * 7);
    case 'monthly':
      return addMonthsISO(value, step, anchorDay);
    case 'yearly':
      return addYearsISO(value, step, anchorDay);
    default:
      return addMonthsISO(value, step, anchorDay);
  }
}

export function monthKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthFromDateISO(value) {
  return String(value || '').slice(0, 7);
}

export function shiftMonthKey(key, offset) {
  const [year, month] = String(key || monthKey()).split('-').map(Number);
  const d = new Date(year, month - 1 + Number(offset || 0), 1);
  return monthKey(d);
}

export function monthRange(key) {
  const [year, month] = String(key).split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  return { start: localDateISO(first), end: localDateISO(last), year, month, days: last.getDate() };
}

export function formatDate(value, options = {}) {
  const d = parseLocalDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(APP.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(d);
}

export function formatDateLong(value, options = {}) {
  const d = parseLocalDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(APP.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(d);
}

export function formatMonth(key, options = {}) {
  const [year, month] = String(key).split('-').map(Number);
  return new Intl.DateTimeFormat(APP.locale, {
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(new Date(year, (month || 1) - 1, 1));
}

export function formatMonthShort(key) {
  const [year, month] = String(key).split('-').map(Number);
  return new Intl.DateTimeFormat(APP.locale, { month: 'short' }).format(
    new Date(year, (month || 1) - 1, 1),
  );
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(APP.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(APP.locale, { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function relativeDay(value) {
  const target = parseLocalDate(value);
  if (!target) return '';
  const today = parseLocalDate(todayISO());
  const diff = Math.round((target - today) / 86_400_000);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Besok';
  if (diff === -1) return 'Kemarin';
  if (diff > 1 && diff < 7) return `${diff} hari lagi`;
  if (diff < -1 && diff > -7) return `${Math.abs(diff)} hari lalu`;
  return formatDate(value);
}

export function timeAgo(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'Baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return formatDate(d);
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function buildMonthGrid(key, weekStartsOn = 1) {
  const [year, month] = String(key).split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(year, month - 1, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      date: localDateISO(d),
      day: d.getDate(),
      month: d.getMonth() + 1,
      inMonth: d.getMonth() === month - 1,
      weekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: localDateISO(d) === todayISO(),
    });
  }
  return cells;
}

export function weekdayLabels(weekStartsOn = 1, format = 'short') {
  const base = new Date(2024, 0, 7); // Sunday
  const labels = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + ((weekStartsOn + i) % 7));
    labels.push(new Intl.DateTimeFormat(APP.locale, { weekday: format }).format(day));
  }
  return labels;
}

export function dayLabel(value, options = {}) {
  const d = parseLocalDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(APP.locale, { weekday: 'long', ...options }).format(d);
}

/* -------------------------------------------------------------------------- */
/*  Number & currency formatting                                              */
/* -------------------------------------------------------------------------- */

let privacyHidden = false;

export function setPrivacyHidden(hidden) {
  privacyHidden = Boolean(hidden);
}

export function isPrivacyHidden() {
  return privacyHidden;
}

export function toNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatNumber(value, options = {}) {
  const n = safeNumber(value);
  return new Intl.NumberFormat(APP.locale, { maximumFractionDigits: 0, ...options }).format(n);
}

export function formatCurrency(value, options = {}) {
  const { compact = false, sign = false, hide = privacyHidden, decimals = false } = options;
  const n = safeNumber(value);
  if (hide) return 'Rp ••••••';
  if (compact) {
    const abs = Math.abs(n);
    let text;
    if (abs >= 1_000_000_000) text = `${new Intl.NumberFormat(APP.locale, { maximumFractionDigits: 1 }).format(abs / 1_000_000_000)} M`;
    else if (abs >= 1_000_000) text = `${new Intl.NumberFormat(APP.locale, { maximumFractionDigits: 1 }).format(abs / 1_000_000)} jt`;
    else if (abs >= 1_000) text = `${new Intl.NumberFormat(APP.locale, { maximumFractionDigits: 0 }).format(abs / 1_000)} rb`;
    else text = new Intl.NumberFormat(APP.locale, { maximumFractionDigits: 0 }).format(abs);
    return `${n < 0 ? '-' : sign && n > 0 ? '+' : ''}Rp ${text}`;
  }
  const formatter = new Intl.NumberFormat(APP.locale, {
    maximumFractionDigits: decimals ? 2 : 0,
    minimumFractionDigits: decimals ? 2 : 0,
  });
  return `${n < 0 ? '-Rp' : sign && n > 0 ? '+Rp' : 'Rp'} ${formatter.format(Math.abs(n))}`;
}

export function formatCompact(value) {
  return formatCurrency(value, { compact: true });
}

export function formatPercent(value, decimals = 0) {
  return `${new Intl.NumberFormat(APP.locale, { maximumFractionDigits: decimals }).format(safeNumber(value))}%`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sum(values) {
  return values.reduce((total, value) => total + safeNumber(value), 0);
}

export function roundAmount(value) {
  return Math.round(safeNumber(value));
}

/* -------------------------------------------------------------------------- */
/*  Safe expression calculator                                                */
/* -------------------------------------------------------------------------- */

function tokenizeExpression(input) {
  const source = String(input || '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/,/g, '.')
    .replace(/\s+/g, '');
  if (!source) return [];
  if (!/^[0-9+\-*/().]+$/.test(source)) throw new Error('Invalid character');
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/[0-9.]/.test(char)) {
      let raw = char;
      i += 1;
      while (i < source.length && /[0-9.]/.test(source[i])) {
        raw += source[i];
        i += 1;
      }
      if ((raw.match(/\./g) || []).length > 1) throw new Error('Invalid number');
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error('Invalid number');
      tokens.push({ type: 'number', value: n });
      continue;
    }
    if ('+-*/()'.includes(char)) {
      tokens.push({ type: 'op', value: char });
      i += 1;
      continue;
    }
    throw new Error('Invalid character');
  }
  return tokens;
}

/** Evaluate + - * / and parentheses without eval/Function. */
export function evaluateExpression(input) {
  const tokens = tokenizeExpression(input);
  if (!tokens.length) return 0;
  let index = 0;

  function peek() {
    return tokens[index];
  }

  function consume(value) {
    const token = tokens[index];
    if (!token || token.value !== value) throw new Error('Unexpected token');
    index += 1;
    return token;
  }

  function parseExpression() {
    let value = parseTerm();
    while (peek() && (peek().value === '+' || peek().value === '-')) {
      const op = tokens[index].value;
      index += 1;
      const right = parseTerm();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() && (peek().value === '*' || peek().value === '/')) {
      const op = tokens[index].value;
      index += 1;
      const right = parseFactor();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }

  function parseFactor() {
    const token = peek();
    if (!token) throw new Error('Unexpected end');
    if (token.value === '+') {
      index += 1;
      return parseFactor();
    }
    if (token.value === '-') {
      index += 1;
      return -parseFactor();
    }
    if (token.value === '(') {
      index += 1;
      const value = parseExpression();
      consume(')');
      return value;
    }
    if (token.type === 'number') {
      index += 1;
      return token.value;
    }
    throw new Error('Unexpected token');
  }

  const result = parseExpression();
  if (index !== tokens.length) throw new Error('Unexpected token');
  if (!Number.isFinite(result)) throw new Error('Invalid result');
  return result;
}

export function expressionResult(input) {
  try {
    const value = evaluateExpression(input);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  HTML safety                                                               */
/* -------------------------------------------------------------------------- */

export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, '&#096;');
}

export function stripHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

const ALLOWED_NOTE_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'div', 'p', 'span',
  'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'pre', 'code',
]);

const DROP_NOTE_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'textarea', 'select', 'button', 'img', 'video', 'audio', 'link', 'meta', 'base',
]);

/**
 * Whitelist-based sanitiser for sticky-note HTML. All attributes are removed.
 * This prevents accidentally stored HTML from executing after a cloud sync.
 */
export function sanitizeNoteHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const walk = (parent) => {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (DROP_NOTE_TAGS.has(tag)) {
        node.remove();
        return;
      }
      if (!ALLOWED_NOTE_TAGS.has(tag)) {
        walk(node);
        const fragment = document.createDocumentFragment();
        while (node.firstChild) fragment.appendChild(node.firstChild);
        node.replaceWith(fragment);
        return;
      }
      [...node.attributes].forEach((attr) => node.removeAttribute(attr.name));
      if (tag === 'div' || tag === 'p') {
        // Normalise empty blocks coming from contenteditable.
        if (node.innerHTML === '<br>') node.innerHTML = '';
      }
      walk(node);
    });
  };
  walk(template.content);
  return template.innerHTML.trim();
}

export function plainTextPreview(html, max = 220) {
  const text = stripHTML(html);
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/* -------------------------------------------------------------------------- */
/*  Collections, files, misc                                                  */
/* -------------------------------------------------------------------------- */

export function deepClone(value) {
  if (globalThis.structuredClone) return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function debounce(fn, wait = 250) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export function throttle(fn, wait = 250) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      timer = null;
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}

export function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

export function sortBy(items, getValue, direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);
    if (av === bv) return 0;
    return av > bv ? factor : -factor;
  });
}

export function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

export function getInitials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadJSON(data, filename) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), filename);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca file'));
    reader.readAsText(file);
  });
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function toDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDateTimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fileSafe(value) {
  return String(value || 'risly')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'risly';
}

export function countWords(text) {
  const cleaned = String(text || '').trim();
  return cleaned ? cleaned.split(/\s+/).length : 0;
}

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function normalizeSearch(value) {
  return String(value || '').toLocaleLowerCase(APP.locale).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function includesSearch(haystack, needle) {
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
