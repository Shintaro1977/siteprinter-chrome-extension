import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  root: 'website',
  build: {
    outDir: resolve(__dirname, 'dist-website'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'website/index.html'),
        terms: resolve(__dirname, 'website/terms/index.html'),
      },
    },
  },
});
