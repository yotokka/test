import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' — чтобы собранный сайт открывался из любой папки и со статического хостинга.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
