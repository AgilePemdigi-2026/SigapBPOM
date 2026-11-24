import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GalatProviderLokal, PROVIDER, PESAN_LOKAL_MATI, PemilihProviderSupabase, PemilihProviderTiruan, PeringkasSesuaiProvider, aliranDenganProvider,
  pilihPeringkas, targetHermes,
} from './providerAi.mjs';

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

test('req_4_6_setelah_gagal_tidak_fetch_selama_backoff', async () => {
  const { pemilih, panggilan, atur } = siapkan([new Error('mati'), jawab('lokal')]);
  assert.equal(await pemilih.aktif(), PROVIDER.TIDAK_DIKETAHUI);
  atur(4999);
  assert.equal(await pemilih.aktif(), PROVIDER.TIDAK_DIKETAHUI);
  assert.equal(panggilan.length, 1);
  atur(5000);
  assert.equal(await pemilih.aktif(), 'lokal');
  assert.equal(panggilan.length, 2);
});

test('req_4_6_panggilan_bersamaan_berbagi_satu_fetch', async () => {
  const { pemilih, panggilan } = siapkan([jawab('lokal')]);
  const hasil = await Promise.all([pemilih.aktif(), pemilih.aktif(), pemilih.aktif()]);
  assert.deepEqual(hasil, ['lokal', 'lokal', 'lokal']);
  assert.equal(panggilan.length, 1);
});

// UC-04 Task 5: routing giliran AI ke profil Hermes terpilih.
const PROFIL = {
  cloud: { url: 'http://host.docker.internal:8642', kunci: 'kunci-cloud', model: 'sigap-hermes' },
  lokal: { url: 'http://host.docker.internal:8643', kunci: 'kunci-lokal', model: 'sigap-hermes' },
};

async function kumpulkan(aliran) {
  const keluar = [];
  for await (const p of aliran) keluar.push(p);
  return keluar;
}

/** alir tiruan yang memanggil spy fetch ke URL target, seperti aliranHermes di server.mjs. */
function siapkanAlir(galat) {
  const dipanggil = [];
  const fetch = async (url) => {
    dipanggil.push(url);
    if (galat) throw galat;
    return { ok: true };
  };
  const alir = async function* (target) {
    await fetch(`${target.url}/v1/chat/completions`);
    yield 'Halo.';
  };
  return { alir, dipanggil };
}

test('req_4_6_target_mengikuti_provider', () => {
  const cloud = targetHermes(PROVIDER.CLOUD, PROFIL);
  assert.match(cloud.url, /:8642$/);
  assert.equal(cloud.provider, 'cloud');
  assert.equal(cloud.kunci, 'kunci-cloud');
  const lokal = targetHermes(PROVIDER.LOKAL, PROFIL);
  assert.match(lokal.url, /:8643$/);
  assert.equal(lokal.provider, 'lokal');
  assert.equal(lokal.kunci, 'kunci-lokal');
  assert.equal(targetHermes(PROVIDER.TIDAK_DIKETAHUI, PROFIL), null);
  assert.equal(targetHermes('gpt', PROFIL), null);
});

test('req_4_6_profil_tanpa_url_tidak_pindah_ke_profil_lain', () => {
  assert.equal(targetHermes(PROVIDER.LOKAL, { cloud: PROFIL.cloud, lokal: { url: '', kunci: '', model: 'sigap-hermes' } }), null);
  assert.equal(targetHermes(PROVIDER.CLOUD, { cloud: { url: '', kunci: 'k', model: 'm' }, lokal: PROFIL.lokal }), null);
});

test('req_4_6_aliran_lokal_hanya_memanggil_url_lokal', async () => {
  const { alir, dipanggil } = siapkanAlir();
  assert.deepEqual(await kumpulkan(aliranDenganProvider({ target: targetHermes('lokal', PROFIL), alir })), ['Halo.']);
  assert.deepEqual(dipanggil, ['http://host.docker.internal:8643/v1/chat/completions']);
});

test('req_4_7_lokal_gagal_tanpa_memanggil_cloud', async () => {
  const { alir, dipanggil } = siapkanAlir(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8643'), { code: 'ECONNREFUSED' }));
  await assert.rejects(kumpulkan(aliranDenganProvider({ target: targetHermes('lokal', PROFIL), alir })), GalatProviderLokal);
  assert.ok(dipanggil.every((u) => !u.includes(':8642')), 'cloud tidak pernah dipanggil');
  assert.equal(dipanggil.length, 1);
});

test('req_4_7_no_reply_dianggap_gagal', async () => {
  const alir = async function* () { throw new Error('hermes tanpa jawaban'); };
  await assert.rejects(kumpulkan(aliranDenganProvider({ target: targetHermes('lokal', PROFIL), alir })), (e) => {
    assert.ok(e instanceof GalatProviderLokal);
    assert.equal(e.cause.message, 'hermes tanpa jawaban');
    return true;
  });
});

test('req_4_7_galat_lokal_setelah_sebagian_jawaban', async () => {
  const alir = async function* () { yield 'Kalimat pertama. '; throw new Error('hermes 502'); };
  const keluar = [];
  await assert.rejects(async () => { for await (const p of aliranDenganProvider({ target: targetHermes('lokal', PROFIL), alir })) keluar.push(p); }, GalatProviderLokal);
  assert.deepEqual(keluar, ['Kalimat pertama. ']);
});

test('req_4_6_galat_cloud_tidak_diubah', async () => {
  const asli = new Error('hermes 500');
  const alir = async function* () { throw asli; };
  await assert.rejects(kumpulkan(aliranDenganProvider({ target: targetHermes('cloud', PROFIL), alir })), (e) => e === asli);
});

function peringkasSpy(nama, galat = null) {
  const p = { dipanggil: 0, async ringkas() { p.dipanggil++; if (galat) throw galat; return { ringkasan: nama, token: 7 }; } };
  return p;
}

test('req_4_6_pilih_peringkas_sesuai_provider', () => {
  const cloud = peringkasSpy('cloud'), lokal = peringkasSpy('lokal'), tiruan = peringkasSpy('tiruan');
  assert.equal(pilihPeringkas('cloud', { cloud, lokal, tiruan }), cloud);
  assert.equal(pilihPeringkas('lokal', { cloud, lokal, tiruan }), lokal);
  assert.equal(pilihPeringkas('tidak_diketahui', { cloud, lokal, tiruan }), tiruan);
  assert.equal(pilihPeringkas('gpt', { cloud, lokal, tiruan }), tiruan);
});

test('req_4_7_peringkas_lokal_mati_pakai_tiruan', async () => {
  const cloud = peringkasSpy('cloud'), lokal = peringkasSpy('lokal', new Error('ECONNREFUSED')), tiruan = peringkasSpy('tiruan');
  const peringkas = new PeringkasSesuaiProvider({ pemilih: new PemilihProviderTiruan('lokal'), cloud, lokal, tiruan });
  assert.deepEqual(await peringkas.ringkas('Penelepon: halo'), { ringkasan: 'tiruan', token: 7 });
  assert.equal(lokal.dipanggil, 1);
  assert.equal(cloud.dipanggil, 0, 'cloud tidak pernah dipanggil');
});

test('req_4_6_peringkas_mengikuti_provider_saat_meringkas', async () => {
  const cloud = peringkasSpy('cloud'), lokal = peringkasSpy('lokal'), tiruan = peringkasSpy('tiruan');
  const pemilih = new PemilihProviderTiruan('cloud');
  const peringkas = new PeringkasSesuaiProvider({ pemilih, cloud, lokal, tiruan });
  assert.equal((await peringkas.ringkas('x')).ringkasan, 'cloud');
  pemilih.nilai = 'lokal';
  assert.equal((await peringkas.ringkas('x')).ringkasan, 'lokal');
  pemilih.nilai = 'tidak_diketahui';
  assert.equal((await peringkas.ringkas('x')).ringkasan, 'tiruan');
  assert.deepEqual([cloud.dipanggil, lokal.dipanggil, tiruan.dipanggil], [1, 1, 1]);
});

test('req_4_6_galat_peringkas_cloud_diteruskan', async () => {
  const asli = new Error('ringkasan 500');
  const peringkas = new PeringkasSesuaiProvider({
    pemilih: new PemilihProviderTiruan('cloud'), cloud: peringkasSpy('cloud', asli), lokal: peringkasSpy('lokal'), tiruan: peringkasSpy('tiruan'),
  });
  await assert.rejects(peringkas.ringkas('x'), (e) => e === asli);
});
