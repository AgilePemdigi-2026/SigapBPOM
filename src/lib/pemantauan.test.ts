import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pilihPenyimpanan } from './pemantauan.ts';
import { PenyimpananPemantauanSupabase } from './penyimpananPemantauanSupabase.ts';
import { PenyimpananPemantauanTiruan } from './mock/pemantauanTiruan.ts';

const ENV = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'kunci-anon' };

test('t_f5_1_02 dengan sesi Supabase, data pemantauan dibaca dari Supabase memakai token petugas', () => {
  const penyimpanan = pilihPenyimpanan('token-petugas', ENV);
  assert.ok(penyimpanan instanceof PenyimpananPemantauanSupabase);
  assert.equal(penyimpanan.tokenAkses, 'token-petugas');
  assert.equal(penyimpanan.kunciPublik, 'kunci-anon');
});

test('t_f5_1_02 tanpa token atau tanpa konfigurasi Supabase memakai penyimpanan tiruan', () => {
  assert.ok(pilihPenyimpanan(undefined, ENV) instanceof PenyimpananPemantauanTiruan);
  assert.ok(pilihPenyimpanan('token-petugas', {}) instanceof PenyimpananPemantauanTiruan);
});
