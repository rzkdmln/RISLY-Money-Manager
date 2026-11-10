/**
 * RISLY — Import Submissions.
 * Domain: import
 */

import { submitImport } from '../../import.js';
import { renderApplication } from '../../app.js';

export const importSubmissions = {
  'import-transactions': async (form) => {
    const imported = await submitImport(form);
    renderApplication();
  },
};
