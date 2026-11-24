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

test('Dockerfile menyalin setiap modul .mjs yang terjangkau lewat import relatif dari server.mjs', () => {
  const dir = new URL('./', import.meta.url);
  const terjangkau = new Set();
  const antre = ['server.mjs'];
  while (antre.length) {
    const nama = antre.pop();
    if (terjangkau.has(nama)) continue;
    terjangkau.add(nama);
    const sumber = readFileSync(new URL(nama, dir), 'utf8');
    for (const m of sumber.matchAll(/(?:from|import)\s*\(?\s*['"]\.\/([^'"]+\.mjs)['"]/g)) antre.push(m[1]);
  }
  assert.ok(terjangkau.size > 1);
  const dockerfile = readFileSync(new URL('./Dockerfile', dir), 'utf8');
  const disalin = new Set([...dockerfile.matchAll(/voice-gateway\/([\w.-]+\.mjs)/g)].map((m) => m[1]));
  assert.deepEqual([...terjangkau].filter((n) => !disalin.has(n)), []);
});
