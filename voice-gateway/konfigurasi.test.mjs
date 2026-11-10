import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('PROJECT_RULES 4.5 .env.example memuat setiap variabel yang dibaca server.mjs', () => {
  const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  const contoh = readFileSync(new URL('./.env.example', import.meta.url), 'utf8');
  const kunci = [...new Set([...server.matchAll(/env\('([A-Z0-9_]+)'/g)].map((m) => m[1]))];
  assert.ok(kunci.length > 0);
  assert.deepEqual(kunci.filter((k) => !new RegExp(`^#? ?${k}=`, 'm').test(contoh)), []);
});
