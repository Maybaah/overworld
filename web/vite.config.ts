import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { steamProxyPlugin } from './server/vitePlugin.ts';

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

function dropSampleData(): Plugin {
  let outDir = '';
  let dataBase = '';
  return {
    name: 'overworld-drop-sample-data',
    apply: 'build',
    configResolved(config) {
      dataBase = String(config.env.VITE_DATA_BASE ?? '');
      outDir = config.build.outDir.startsWith('/') || /^[A-Za-z]:/.test(config.build.outDir) ? config.build.outDir : `${config.root}/${config.build.outDir}`;
    },
    closeBundle() {
      if (!dataBase.includes('data-fixture')) rmSync(`${outDir}/data-fixture`, { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), steamProxyPlugin({ envDir: repoRoot }), appVersion(), dropSampleData()],
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
