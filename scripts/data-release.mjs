import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage:
  node scripts/data-release.mjs upload     pack web/public/data and upload it to the "data" release
  node scripts/data-release.mjs download   replace web/public/data with the copy from that release

Needs the GitHub CLI (gh), signed in, or GH_TOKEN in the environment.`;

const TAG = 'data';
const ARCHIVE = 'overworld-data.tar.gz';
const root = fileURLToPath(new URL('..', import.meta.url));
const [command] = process.argv.slice(2);

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function must(cmd, args) {
  const status = run(cmd, args);
  if (status !== 0) {
    console.error(`${cmd} ${args.join(' ')} failed with exit code ${status}`);
    process.exit(status);
  }
}

if (command === 'upload') {
  if (!existsSync(`${root}web/public/data/games.json`)) {
    console.error('web/public/data is missing or incomplete. Run the pipeline, sprites and layouts first.');
    process.exit(2);
  }
  mkdirSync(`${root}dist`, { recursive: true });
  must('tar', ['-czf', `dist/${ARCHIVE}`, '-C', 'web/public', 'data']);
  if (run('gh', ['release', 'view', TAG], { stdio: 'ignore' }) !== 0) {
    must('gh', ['release', 'create', TAG, '--title', 'Site data', '--notes', 'Built game data for deploys. Replaced by npm run data:upload.', '--latest=false']);
  }
  must('gh', ['release', 'upload', TAG, `dist/${ARCHIVE}`, '--clobber']);
  rmSync(`${root}dist/${ARCHIVE}`, { force: true });
} else if (command === 'download') {
  mkdirSync(`${root}dist`, { recursive: true });
  must('gh', ['release', 'download', TAG, '--pattern', ARCHIVE, '--dir', 'dist', '--clobber']);
  rmSync(`${root}web/public/data`, { recursive: true, force: true });
  must('tar', ['-xzf', `dist/${ARCHIVE}`, '-C', 'web/public']);
  rmSync(`${root}dist/${ARCHIVE}`, { force: true });
} else {
  console.error(USAGE);
  process.exit(2);
}
