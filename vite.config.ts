import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 собирает весь сайт в один HTML-файл (скрипты, стили и шрифты встроены) — удобно для
// просмотра без сервера или публикации одной страницей. Обычная сборка — папка dist/.
const single = process.env.SINGLE === '1';

// base: './' — чтобы собранный сайт открывался из любой папки и со статического хостинга.
export default defineConfig({
  base: './',
  plugins: single ? [react(), viteSingleFile()] : [react()],
  build: single ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000 } : {},
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
