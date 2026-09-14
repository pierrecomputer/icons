import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Dev-only config for the local playground. The published package is still
// built with `tsc`; nothing here ships.
export default defineConfig({
  root: 'playground',
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve to source so edits to icons hot-reload without a build step.
      '@pierre/icons': fileURLToPath(
        new URL('./src/index.ts', import.meta.url)
      ),
    },
  },
  server: {
    port: 5273,
  },
});
