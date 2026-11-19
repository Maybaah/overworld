import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { steamProxyPlugin } from './server/vitePlugin';

function gitVersion(): string {
  const fromEnv = process.env.APP_VERSION ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function appVersion(): Plugin {
  const version = gitVersion();
  return {
    name: 'overworld-app-version',
    transformIndexHtml: (html) => html.replace('__APP_VERSION__', /^[A-Za-z0-9._-]{1,24}$/.test(version) ? version : ''),
  };
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const shared = fileURLToPath(new URL('../shared/model.ts', import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), steamProxyPlugin({ envDir: repoRoot }), appVersion()],
  resolve: { alias: { '@shared': shared } },
  server: { fs: { allow: ['..'] } },
  // The mosaic worker loads country outlines as a separate chunk, which only ES-module workers allow.
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'scripts/**/*.test.{ts,mjs}'],
  },
});
