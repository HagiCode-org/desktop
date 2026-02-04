import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/preload',
    lib: {
      entry: resolve(__dirname, 'src/preload/index.ts'),
      formats: ['es'],
      fileName: 'index.mjs',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'index.mjs',
      },
      external: ['electron'],
    },
  },
  optimizeDeps: {
    exclude: ['electron'],
  },
});
