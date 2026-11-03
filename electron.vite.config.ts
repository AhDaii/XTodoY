import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const shared = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: {
    resolve: { alias: shared },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      // 沙箱中的 preload 不能 require 本地文件，每个入口必须独立打包、不拆共享 chunk
      isolatedEntries: true,
      rollupOptions: {
        input: {
          main: resolve('src/preload/main.ts'),
          floating: resolve('src/preload/floating.ts'),
        },
        // 沙箱中的 preload 必须是 CommonJS
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/main') } },
    plugins: [react(), tailwindcss()],
    build: {
      minify: true,
      rollupOptions: {
        input: {
          main: resolve('src/renderer/main/index.html'),
          floating: resolve('src/renderer/floating/index.html'),
        },
      },
    },
  },
});
