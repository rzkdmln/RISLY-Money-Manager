import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'risly-unit',
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules', 'dist', 'coverage', 'junk', 'tools'],
    globals: true,
    setupFiles: ['./tests/setup.js'],

  },
});
