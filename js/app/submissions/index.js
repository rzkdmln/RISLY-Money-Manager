/**
 * RISLY — Submission Registry.
 *
 * Menggabungkan semua handler `data-form` menjadi satu dispatcher
 * `submitForm(form)`. Digantikan `switch` monolitik di `app.js` (±80 baris
 * + 15 handler).
 *
 * Pola: setiap file mengekspor object `{ 'nama-form': (form) => ... }`.
 * `submitForm` memanggil `clearFormError(form)` terlebih dahulu, lalu
 * men-delegasikan ke handler yang sesuai.
 */

import { clearFormError } from '../../ui.js';
import { authSubmissions } from './auth.js';
import { transactionSubmissions } from './transaction.js';
import { recurringSubmissions } from './recurring.js';
import { goalSubmissions } from './goal.js';
import { accountSubmissions } from './account.js';
import { categorySubmissions } from './category.js';
import { profileSubmissions } from './profile.js';
import { noteSubmissions } from './note.js';
import { budgetSubmissions } from './budget.js';
import { householdSubmissions } from './household.js';
import { settingsSubmissions } from './settings.js';
import { workspaceSubmissions } from './workspace.js';
import { cloudSubmissions } from './cloud.js';
import { importSubmissions } from './import.js';

const SUBMISSIONS = {
  ...authSubmissions,
  ...transactionSubmissions,
  ...recurringSubmissions,
  ...goalSubmissions,
  ...accountSubmissions,
  ...categorySubmissions,
  ...profileSubmissions,
  ...noteSubmissions,
  ...budgetSubmissions,
  ...householdSubmissions,
  ...settingsSubmissions,
  ...workspaceSubmissions,
  ...cloudSubmissions,
  ...importSubmissions,
};

export async function submitForm(form) {
  clearFormError(form);
  const type = form.dataset.form;
  const handler = SUBMISSIONS[type];
  if (!handler) {
    console.warn('Form belum ditangani:', type);
    return;
  }
  return handler(form);
}

export { SUBMISSIONS };
