import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export async function writeJson(file: string, data: unknown, pretty = false): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
  await rename(tmp, file);
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

export async function readJsonIfExists<T>(file: string): Promise<T | null> {
  return existsSync(file) ? readJson<T>(file) : null;
}
