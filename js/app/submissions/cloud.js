/**
 * RISLY — Cloud Submissions.
 * Domain: cloud
 */

import {
  connectCloudFromForm,
} from '../../app.js';
import { store } from '../../store.js';
import { ui, toast, closeModal } from '../../ui.js';
import { renderApplication, renderAuth } from '../../app.js';

export const cloudSubmissions = {
  cloud: async (form) => {
    await connectCloudFromForm(form);
  },
  'auth-cloud': async (form) => {
    await connectCloudFromForm(form);
  },
};
