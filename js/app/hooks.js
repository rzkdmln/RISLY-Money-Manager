/**
 * RISLY — App Hooks.
 *
 * Tempat implementasi aplikasi disimpan agar backup.js (leaf) tidak lagi
 * mengimpor dari monolith js/app.js. app.js akan meng-assign implementasi
 * nyata ke objek ini, backup.js memanggil via appHooks.
 */

export const appHooks = {
  enterApplication: async (...args) => {},
  renderApplication: async (...args) => {},
  renderAuth: async (...args) => {},
  signInWithGoogleFlow: async (...args) => null,
};
