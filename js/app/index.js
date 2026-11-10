/**
 * RISLY — Application Entry Point.
 *
 * Replaces js/app.js as the module loaded by index.html (Phase 5).
 * Re-exports the public API expected by index.html, backup.js, and other modules.
 */

export { renderApplication, renderAuth } from './runtime.js';
export { enterApplication } from './session.js';
export { signInWithGoogleFlow } from './auth-flow.js';

import { appHooks } from './hooks.js';
import { renderApplication, renderAuth } from './runtime.js';
import { enterApplication } from './session.js';
import { signInWithGoogleFlow } from './auth-flow.js';

Object.assign(appHooks, {
  enterApplication,
  renderApplication,
  renderAuth,
  signInWithGoogleFlow,
});

/**
 * Boot the application.
 */
import { boot } from './boot.js';
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
