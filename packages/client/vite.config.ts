import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any folder (GitHub Pages project sites included).
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    // Native file events on Windows sometimes miss quick successive saves,
    // leaving stale modules in the dev server; polling catches every change.
    watch: { usePolling: true, interval: 150 },
  },
});
