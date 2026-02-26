import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, __dirname, '');

  return {
    plugins: [react(), tailwindcss()],
    envDir: __dirname,
    base: './',
    root: path.resolve(__dirname, './src/renderer'),
    publicDir: path.resolve(__dirname, './src/renderer/public'),
    resolve: {
      alias: {
        '@types': path.resolve(__dirname, './src/types'),
        '@types/*': path.resolve(__dirname, './src/types/*'),
        '@types/agent-cli': path.resolve(__dirname, './src/types/agent-cli.ts'),
        '@': path.resolve(__dirname, './src/renderer'),
        '@/*': path.resolve(__dirname, './src/renderer/*'),
        '@assets': path.resolve(__dirname, './src/renderer/assets'),
        '@assets/*': path.resolve(__dirname, './src/renderer/assets/*'),
      },
    },
    assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.webp'],
    build: {
      outDir: path.resolve(__dirname, 'dist/renderer'),
      emptyOutDir: true,
      assetsDir: 'assets',
    },
    server: {
      port: 36598,
      strictPort: true,
    },
    // Expose env variables to the renderer process
    define: {
      __APPINSIGHTS_CONNECTION_STRING__: JSON.stringify(env.VITE_APPINSIGHTS_CONNECTION_STRING || ''),
    },
  };
});
