import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any folder (GitHub Pages project sites included).
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
