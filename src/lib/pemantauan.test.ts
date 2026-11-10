import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pilihKesehatan, pilihPenyimpanan } from './pemantauan.ts';
import { PenyimpananPemantauanSupabase } from './penyimpananPemantauanSupabase.ts';
import { PemeriksaKesehatanTiruan, PenyimpananPemantauanMock } from './mock/pemantauanTiruan.ts';
import { PemeriksaKesehatanGateway } from './kesehatanAgentGateway.ts';
import { KOMPONEN_AGENT, PemantauanLayananController } from './PemantauanLayananController.ts';

const ENV = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'kunci-anon' };

test('t_f5_1_02 dengan sesi Supabase, data pemantauan dibaca dari Supabase memakai token petugas', () => {
  const penyimpanan = pilihPenyimpanan('token-petugas', ENV);
  assert.ok(penyimpanan instanceof PenyimpananPemantauanSupabase);
  assert.equal(penyimpanan.tokenAkses, 'token-petugas');
  assert.equal(penyimpanan.kunciPublik, 'kunci-anon');
});

test('t_f5_4_01 dengan VOICE_GATEWAY_URL kesehatan dibaca dari gateway, juga di produksi', () => {
  const kesehatan = pilihKesehatan({ VOICE_GATEWAY_URL: 'http://voice:8090' }, true);
  assert.ok(kesehatan instanceof PemeriksaKesehatanGateway);
  assert.equal(kesehatan.url, 'http://voice:8090');
});

test('t_f5_4_01 produksi tanpa VOICE_GATEWAY_URL tidak memakai kesehatan tiruan; semua komponen gangguan tanpa latensi', async () => {
  assert.ok(pilihKesehatan({}, false) instanceof PemeriksaKesehatanTiruan);
  const kesehatan = pilihKesehatan({}, true);
  assert.equal(kesehatan, undefined);
  const { komponen } = await new PemantauanLayananController(new PenyimpananPemantauanMock(), kesehatan).pantauAgent();
  assert.deepEqual(komponen, KOMPONEN_AGENT.map((nama) => ({ nama, status: 'Gangguan', latensiMs: null })));
});
