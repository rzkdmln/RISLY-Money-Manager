import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'risly-unit',
    environment: 'jsdom',
    include: ['tests/core/**/*.test.js', 'tests/rules/**/*.test.js'],
    exclude: ['node_modules', 'dist', 'coverage', 'junk', 'tools', 'tests/e2e'],
    globals: true,
    setupFiles: ['./tests/setup.js'],
  },
});
