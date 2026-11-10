/**
 * RISLY — Calendar Actions.
 * Domain: calendar
 */

import { openModal } from '../../ui/ui.js';
import { ui } from '../../ui/ui.js';
import { renderApplication } from '../runtime.js';
import { shiftMonthKey, monthKey } from '../../core/utils.js';
import { dayDetailView } from '../../views/transactions.js';

export const calendarActions = {
  'calendar-prev': () => {
    ui.calendarMonth = shiftMonthKey(ui.calendarMonth || monthKey(), -1);
    renderApplication();
  },
  'calendar-next': () => {
    ui.calendarMonth = shiftMonthKey(ui.calendarMonth || monthKey(), 1);
    renderApplication();
  },
  'calendar-today': () => {
    ui.calendarMonth = monthKey();
    renderApplication();
  },
  'calendar-day': (element) => {
    openModal({
      size: 'md',
      className: 'form-modal',
      html: dayDetailView(element.dataset.date),
    });
  },
};
