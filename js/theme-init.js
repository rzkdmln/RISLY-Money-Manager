/**
 * RISLY — Tema inisial sebelum first paint.
 *
 * Mengaplikasikan tema tersimpan (light/dark/system) sebelum CSS
 * dimuat sehingga tidak terjadi flash tema yang salah.
 */

(function () {
  try {
    var prefs = JSON.parse(localStorage.getItem('risly.mm.prefs.v1') || '{}') || {};
    var dark =
      prefs.theme === 'dark' ||
      ((!prefs.theme || prefs.theme === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#08101E' : '#F5F7FB');
  } catch (error) {
    /* noop */
  }
})();
