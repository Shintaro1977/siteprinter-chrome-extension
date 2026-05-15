import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  const isRelease = mode === 'release';

  return {
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        preview: resolve(__dirname, 'src/preview/preview.html'),
        progress: resolve(__dirname, 'src/progress/progress.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.js'),
        content: resolve(__dirname, 'src/content/content.js'),
        confirmed: resolve(__dirname, 'src/confirmed/confirmed.js'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') {
            return 'background/[name].js';
          }
          if (chunkInfo.name === 'content') {
            return 'content/[name].js';
          }
          if (chunkInfo.name === 'confirmed') {
            return 'confirmed/[name].js';
          }
          return '[name]/[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return '[name]/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
    target: 'esnext',
    minify: isRelease ? 'terser' : false,
    ...(isRelease && {
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
        },
        mangle: {
          toplevel: true,
        },
        format: {
          comments: false,
        },
      },
    }),
  },
  plugins: [
    {
      name: 'strip-remote-urls',
      renderChunk(code) {
        // jsPDFのpdfobjectnewwindow機能（未使用）に含まれるCDN URLを除去する。
        // MV3ではリモートコード参照があるとChromeウェブストアに拒否される。
        return code.replace(
          'https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js',
          ''
        );
      },
    },
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: '.',
        },
        {
          src: 'assets/icons/*',
          dest: 'assets/icons',
        },
        {
          src: 'src/assets/fonts/*',
          dest: 'assets/fonts',
        },
        {
          src: '_locales',
          dest: '.',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  };
});
