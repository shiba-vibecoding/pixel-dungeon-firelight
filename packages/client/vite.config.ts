import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** The commit this build is made from, for the about window (and nothing at all outside git). */
function commit(): string {
  try {
    const here = fileURLToPath(new URL('.', import.meta.url));
    return execSync('git rev-parse --short HEAD', { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  // Relative asset paths, so the build works from any folder (GitHub Pages project sites included).
  base: './',
  define: {
    __BUILD__: JSON.stringify({ commit: commit(), date: new Date().toISOString().slice(0, 10) }),
  },
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
