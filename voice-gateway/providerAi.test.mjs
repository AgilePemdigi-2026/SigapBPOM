import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER, PESAN_LOKAL_MATI, PemilihProviderSupabase, PemilihProviderTiruan } from './providerAi.mjs';

const jawab = (provider, status = 200) => ({ ok: status < 400, status, json: async () => ({ status: 'success', data: { provider } }) });

function siapkan(respons, { mulai = 0 } = {}) {
  const panggilan = [];
  let waktu = mulai;
  const fetch = async (url, opsi) => {
    panggilan.push({ url, opsi });
    const r = respons.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  const pemilih = new PemilihProviderSupabase({ url: 'http://sb.test/', kunci: 'rahasia', fetch, now: () => waktu });
  return { pemilih, panggilan, atur: (t) => { waktu = t; } };
}

test('req_4_6_membaca_provider_dari_supabase', async () => {
  const { pemilih, panggilan } = siapkan([jawab('lokal')]);
  assert.equal(await pemilih.aktif(), PROVIDER.LOKAL);
  assert.equal(panggilan[0].url, 'http://sb.test/functions/v1/provider-ai');
  assert.equal(panggilan[0].opsi.method, 'POST');
  assert.equal(panggilan[0].opsi.headers['x-sigap-kunci'], 'rahasia');
});

test('req_4_6_cache_5_detik', async () => {
  const { pemilih, panggilan, atur } = siapkan([jawab('lokal'), jawab('cloud')]);
  assert.equal(await pemilih.aktif(), 'lokal');
  atur(4999);
  assert.equal(await pemilih.aktif(), 'lokal');
  assert.equal(panggilan.length, 1);
  atur(5000);
  assert.equal(await pemilih.aktif(), 'cloud');
  assert.equal(panggilan.length, 2);
});

test('req_4_6_galat_baca_memakai_nilai_terakhir', async () => {
  const { pemilih, atur } = siapkan([jawab('lokal'), new Error('jaringan putus')]);
  assert.equal(await pemilih.aktif(), 'lokal');
  atur(6000);
  assert.equal(await pemilih.aktif(), 'lokal');
});

test('req_4_6_belum_pernah_terbaca_tidak_diketahui', async () => {
  const { pemilih } = siapkan([jawab('cloud', 500)]);
  assert.equal(await pemilih.aktif(), PROVIDER.TIDAK_DIKETAHUI);
});

test('req_4_6_nilai_di_luar_enum_dianggap_gagal', async () => {
  const awal = siapkan([jawab('gpt')]);
  assert.equal(await awal.pemilih.aktif(), PROVIDER.TIDAK_DIKETAHUI);
  const susulan = siapkan([jawab('lokal'), jawab('gpt')]);
  assert.equal(await susulan.pemilih.aktif(), 'lokal');
  susulan.atur(6000);
  assert.equal(await susulan.pemilih.aktif(), 'lokal');
});

test('req_4_6_tiruan_dan_pesan', async () => {
  assert.equal(await new PemilihProviderTiruan().aktif(), 'cloud');
  assert.equal(await new PemilihProviderTiruan('lokal').aktif(), 'lokal');
  assert.match(PESAN_LOKAL_MATI, /^Mohon maaf, perangkat AI lokal sedang tidak aktif\./);
});
