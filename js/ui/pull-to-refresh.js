/**
 * RISLY Money Manager — custom pull-to-refresh.
 *
 * Native pull-to-refresh is unavailable in iOS standalone PWAs and is
 * disabled here by `overscroll-behavior-y: none`, so the gesture is
 * implemented manually. It is bound once on `document`, which means it
 * works on every screen — including the login / lock screen — without
 * needing to be re-attached after each render.
 */

const THRESHOLD = 72;       // pull distance (px) that triggers a refresh
const MAX_PULL = 120;       // maximum visual travel of the indicator
const RESISTANCE = 0.55;    // finger movement → indicator movement
const HIDDEN_OFFSET = 64;   // pushes the pill above the viewport
const START_SLOP = 8;       // ignore tiny jitters before "pulling"
const HORIZONTAL_SLOP = 8;  // cancel when the gesture is mostly sideways

let indicator = null;
let label = null;

let startX = 0;
let startY = 0;
let pull = 0;
let tracking = false;
let pulling = false;
let refreshing = false;

function isAtTop() {
  const scrolled = window.scrollY
    || document.documentElement.scrollTop
    || document.body.scrollTop
    || 0;
  return scrolled <= 0;
}

function isBlocked() {
  return refreshing
    || document.body.classList.contains('modal-open')
    || document.body.classList.contains('account-drag-active');
}

function ensureIndicator() {
  if (indicator) return;
  indicator = document.createElement('div');
  indicator.className = 'pull-refresh';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.innerHTML = '<span class="pull-refresh-spinner" aria-hidden="true"></span><span class="pull-refresh-label">Tarik untuk menyegarkan</span>';
  document.body.appendChild(indicator);
  label = indicator.querySelector('.pull-refresh-label');
}

function applyPull(value) {
  pull = Math.max(0, Math.min(MAX_PULL, value));
  ensureIndicator();
  indicator.style.transform = `translate(-50%, ${pull - HIDDEN_OFFSET}px)`;
  indicator.classList.toggle('is-visible', pull > 0);
  indicator.classList.toggle('is-ready', pull >= THRESHOLD);
  if (label) {
    label.textContent = pull >= THRESHOLD ? 'Lepaskan untuk menyegarkan' : 'Tarik untuk menyegarkan';
  }
}

function resetPull() {
  if (!indicator) return;
  indicator.style.transform = `translate(-50%, ${-HIDDEN_OFFSET}px)`;
  indicator.classList.remove('is-visible', 'is-ready', 'is-refreshing');
  if (label) label.textContent = 'Tarik untuk menyegarkan';
}

function triggerRefresh() {
  refreshing = true;
  pulling = false;
  ensureIndicator();
  indicator.style.transform = 'translate(-50%, 0)';
  indicator.classList.add('is-visible', 'is-refreshing');
  indicator.classList.remove('is-ready');
  if (label) label.textContent = 'Menyegarkan…';
  try { navigator.vibrate?.(12); } catch { /* not supported */ }
  // Give the spinner a beat to be seen before the page reloads.
  setTimeout(() => location.reload(), 420);
  // Safety net: if the reload is blocked, don't leave the pill spinning forever.
  setTimeout(() => {
    refreshing = false;
    resetPull();
  }, 2_500);
}

function onTouchStart(event) {
  if (isBlocked() || event.touches.length !== 1 || !isAtTop()) return;
  const touch = event.touches[0];
  startX = touch.clientX;
  startY = touch.clientY;
  pull = 0;
  tracking = true;
  pulling = false;
}

function onTouchMove(event) {
  if (!tracking || isBlocked()) return;
  if (event.touches.length !== 1) {
    if (!pulling) tracking = false;
    return;
  }
  if (!isAtTop()) {
    if (!pulling) tracking = false;
    return;
  }

  const touch = event.touches[0];
  const dy = touch.clientY - startY;
  const dx = touch.clientX - startX;

  if (!pulling) {
    if (dy <= 0) return;
    if (Math.abs(dx) > Math.abs(dy) + HORIZONTAL_SLOP) {
      tracking = false;
      return;
    }
    if (dy < START_SLOP) return;
    pulling = true;
  }

  if (event.cancelable) event.preventDefault();
  applyPull(dy * RESISTANCE);
}

function onTouchEnd() {
  if (!tracking) return;
  tracking = false;
  if (pulling && pull >= THRESHOLD) {
    triggerRefresh();
    return;
  }
  if (pulling) resetPull();
  pulling = false;
}

/** Attach the pull-to-refresh gesture. Safe to call more than once. */
export function initPullToRefresh() {
  if (typeof window === 'undefined' || window.__rislyPullToRefresh) return;
  window.__rislyPullToRefresh = true;

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
}
