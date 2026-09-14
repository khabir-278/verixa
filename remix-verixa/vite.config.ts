import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const rootDir = path.resolve(__dirname, '.');
  let realRootDir = rootDir;
  try {
    realRootDir = fs.realpathSync(rootDir);
  } catch {}

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      fs: {
        strict: false,
        allow: [
          rootDir,
          realRootDir,
          'C:/remix-verixa',
          'C:/verixa/remix-verixa',
        ],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/data/**', '**/*.json', '**/tests/**', '**/*.log', '**/scratch/**'],
      },
    },
  };
});

