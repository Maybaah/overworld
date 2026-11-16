import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { steamProxyPlugin } from './server/vitePlugin';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const shared = fileURLToPath(new URL('../shared/model.ts', import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), steamProxyPlugin({ envDir: repoRoot })],
  resolve: { alias: { '@shared': shared } },
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
