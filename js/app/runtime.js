/**
 * RISLY — runtime re-exports.
 *
 * Leaf module that re-exports the app shell's composition functions so that
 * leaf modules (e.g. js/app/modals.js) can depend on them without importing
 * js/app.js directly. Kept minimal in Phase 1; Phase 2 (hooks.js) will own
 * the composition boundary and break the app.js <-> backup.js cycle.
 */

export { renderApplication } from '../app.js';
