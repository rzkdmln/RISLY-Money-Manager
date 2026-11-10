/**
 * RISLY — Action Registry.
 *
 * Menggabungkan semua handler `data-action` per domain menjadi satu
 * dispatcher `handleAction(action, element)`. Digantikan `switch`
 * monolitik di `app.js` (±1.385 baris).
 *
 * Pola: setiap file mengekspor object `{ 'nama-action': (element) => ... }`.
 */

import { uiActions } from './ui.js';
import { authActions } from './auth.js';
import { navigationActions } from './navigation.js';
import { transactionActions } from './transactions.js';
import { recurringActions } from './recurring.js';
import { accountActions } from './accounts.js';
import { categoryActions } from './categories.js';
import { budgetActions } from './budgets.js';
import { calendarActions } from './calendar.js';
import { filterActions } from './filters.js';
import { noteActions } from './notes.js';
import { noteEditorActions } from './note-editor-actions.js';
import { colorActions } from './colors.js';
import { exportActions } from './exports.js';
import { cloudActions } from './cloud.js';

const ACTIONS = {
  ...uiActions,
  ...authActions,
  ...navigationActions,
  ...transactionActions,
  ...recurringActions,
  ...accountActions,
  ...categoryActions,
  ...budgetActions,
  ...calendarActions,
  ...filterActions,
  ...noteActions,
  ...noteEditorActions,
  ...colorActions,
  ...exportActions,
  ...cloudActions,
};

export async function handleAction(action, element) {
  const handler = ACTIONS[action];
  if (!handler) {
    console.warn('Aksi belum ditangani:', action);
    return undefined;
  }
  return handler(element);
}

export { ACTIONS };
