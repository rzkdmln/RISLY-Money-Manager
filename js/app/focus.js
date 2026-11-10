/**
 * RISLY — Focus snapshot / restore.
 *
 * Menangkap elemen yang sedang difokuskan sebelum render ulang dan
 * memulainya setelahnya agar posisi kursor input tidak hilang.
 * Diekstrak dari js/app.js (Fase 2).
 */

export function rememberFocus() {
  const active = document.activeElement;
  if (!active?.id) return null;
  return {
    id: active.id,
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
  };
}

export function restoreFocus(snapshot) {
  if (!snapshot?.id) return;
  const node = document.getElementById(snapshot.id);
  if (!node) return;
  node.focus({ preventScroll: true });
  if (snapshot.start !== null && typeof node.setSelectionRange === 'function') {
    try {
      node.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
    } catch { /* not a text field */ }
  }
}
