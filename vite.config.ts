import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the same build works on GitHub Pages (served from /<repo>/) and locally.
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
