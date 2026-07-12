import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Disable HMR via DISABLE_HMR env var
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when HMR is off
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
