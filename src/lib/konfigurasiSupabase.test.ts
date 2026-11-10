import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bacaKonfigurasiSupabase } from './konfigurasiSupabase.ts';

test('kunci anon dengan titik tersalin sebagai bullet dikembalikan ke titik', () => {
  const k = bacaKonfigurasiSupabase({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_ANON_KEY: ' aaa•bbb•ccc ' });
  assert.deepEqual(k, { url: 'https://x.supabase.co', kunciAnon: 'aaa.bbb.ccc' });
});

test('tanpa URL atau kunci, konfigurasi kosong', () => {
  assert.equal(bacaKonfigurasiSupabase({ SUPABASE_URL: 'https://x.supabase.co' }), null);
  assert.equal(bacaKonfigurasiSupabase({ SUPABASE_ANON_KEY: 'a.b.c' }), null);
});
