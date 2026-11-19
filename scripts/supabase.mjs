import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const USAGE = `Usage:
  node scripts/supabase.mjs migrate
  node scripts/supabase.mjs add-admin <email>

Needs SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN (a personal access token from
https://supabase.com/dashboard/account/tokens) in the environment or in .env.`;

const ref = process.env.SUPABASE_PROJECT_REF?.trim();
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const [command, arg] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(2);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) fail(`Supabase answered ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

if (!command || !['migrate', 'add-admin'].includes(command)) fail(USAGE);
if (!ref || !/^[a-z0-9]{10,40}$/.test(ref)) fail('Set SUPABASE_PROJECT_REF to your project ref.\n\n' + USAGE);
if (!token) fail('Set SUPABASE_ACCESS_TOKEN.\n\n' + USAGE);

if (command === 'migrate') {
  const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    console.log(`Applying ${file}`);
    await query(readFileSync(dir + file, 'utf8'));
  }
  console.log('Done.');
} else {
  const email = (arg ?? '').trim().toLowerCase();
  if (!/^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(email)) fail(USAGE);
  await query(`insert into overworld_private.admins (email) values ('${email}') on conflict do nothing`);
  const rows = await query('select email from overworld_private.admins order by email');
  console.log('Admins:', rows.map((r) => r.email).join(', '));
}
