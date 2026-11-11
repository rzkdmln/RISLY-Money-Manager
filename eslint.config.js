import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2022,
      globals: {
        // Browser / DOM globals
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        crypto: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        structuredClone: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        Notification: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        History: 'readonly',
        Storage: 'readonly',
        Node: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        CryptoKey: 'readonly',
        CSS: 'readonly',
        Image: 'readonly',
        process: 'readonly',
        require: 'readonly',
        // Service worker globals (sw.js)
        self: 'readonly',
        caches: 'readonly',
        skipWaiting: 'readonly',
        clients: 'readonly',
        // Test globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Core quality rules from the plan
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-implicit-globals': 'error',

      // Matikan rules yang terlalu bising pada kode exist (akan dibersihkan bertahap)
      'no-undef': 'off',
      'no-unused-vars': 'off',

      // Import rules. import/extensions dimatikan karena kode exist menggunakan
      // ekstensi .js pada semua impor.
      'import/no-cycle': 'error',
      'import/no-unresolved': 'off', // same-origin ESM, resolved at runtime
      'import/extensions': 'off',

      // Console: allow warn/error/info, disallow log/debug
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['tools/**/*.{js,mjs}'],
    rules: {
      // Tools adalah file scratch; matikan no-console dan no-unused-vars
      'no-console': 'off',
      'no-unused-vars': 'off',
    },
  },
  prettier,
];
