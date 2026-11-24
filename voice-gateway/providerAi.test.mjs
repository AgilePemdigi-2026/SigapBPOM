import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GalatProviderLokal, PROVIDER, PemeriksaOllama, batasWaktuLokal, PESAN_LOKAL_MATI, PemilihProviderSupabase, PemilihProviderTiruan, PeringkasSesuaiProvider, aliranDenganProvider,
  pilihPeringkas, providerPalingKetat, targetHermes,
} from './providerAi.mjs';
import { PeringkasHermes, PeringkasPercakapan, PeringkasTiruan } from './ringkasan.mjs';
import { PengirimTranskripTiruan } from './transkrip.mjs';

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

// Fix round 1: provider paling ketat per panggilan, ringkasan kosong lokal, batas waktu lokal.
test('req_4_6_provider_paling_ketat', () => {
  assert.equal(providerPalingKetat(null, 'cloud'), 'cloud');
  assert.equal(providerPalingKetat('cloud', 'cloud'), 'cloud');
  assert.equal(providerPalingKetat('cloud', 'lokal'), 'lokal');
  assert.equal(providerPalingKetat('lokal', 'cloud'), 'lokal');
  assert.equal(providerPalingKetat('tidak_diketahui', 'cloud'), 'tidak_diketahui');
  assert.equal(providerPalingKetat('lokal', 'tidak_diketahui'), 'tidak_diketahui');
  assert.equal(providerPalingKetat('tidak_diketahui', 'lokal'), 'lokal');
  assert.equal(providerPalingKetat(null, 'gpt'), 'tidak_diketahui');
});

test('req_4_6_target_membawa_batas_waktu_profil', () => {
  const profil = { cloud: PROFIL.cloud, lokal: { ...PROFIL.lokal, batasWaktuMs: 20_000 } };
  assert.equal(targetHermes('lokal', profil).batasWaktuMs, 20_000);
  assert.equal(targetHermes('cloud', profil).batasWaktuMs, undefined);
});

const ID_PANGGILAN = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

/** PeringkasPercakapan lengkap dengan PeringkasHermes nyata untuk kedua profil; fetch global diganti spy. */
async function ringkasPanggilan({ providerGiliran, providerAkhir, jawabanLokal = 'Ringkasan dari lokal.' }) {
  const dipanggil = [];
  const fetchAsli = globalThis.fetch;
  globalThis.fetch = async (url) => {
    dipanggil.push(String(url));
    const isi = String(url).includes(':8643') ? jawabanLokal : 'Ringkasan dari cloud.';
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: isi } }], usage: { total_tokens: 10 } }) };
  };
  try {
    const pemilih = new PemilihProviderTiruan(providerGiliran[0]);
    const pengirim = new PengirimTranskripTiruan();
    const p = new PeringkasPercakapan({
      peringkas: new PeringkasSesuaiProvider({
        pemilih,
        cloud: new PeringkasHermes({ url: PROFIL.cloud.url, kunci: 'c', model: 'm' }),
        lokal: new PeringkasHermes({ url: PROFIL.lokal.url, kunci: 'l', model: 'm' }),
        tiruan: new PeringkasTiruan(),
      }),
      pengirim,
    });
    p.tercatat(ID_PANGGILAN);
    for (const nilai of providerGiliran) {
      p.catatProvider(ID_PANGGILAN, nilai);
      p.giliran(ID_PANGGILAN, '1.1.1.1', 'Apa syarat label pangan?', 'Jawaban.');
    }
    pemilih.nilai = providerAkhir;
    const ringkasan = await p.akhiri(ID_PANGGILAN);
    return { ringkasan, dipanggil };
  } finally {
    globalThis.fetch = fetchAsli;
  }
}

test('req_4_6_ringkasan_panggilan_lokal_tidak_ke_cloud_walau_provider_berganti', async () => {
  const { ringkasan, dipanggil } = await ringkasPanggilan({ providerGiliran: ['lokal'], providerAkhir: 'cloud' });
  assert.ok(dipanggil.every((u) => !u.includes(':8642')), 'cloud tidak pernah dipanggil');
  assert.deepEqual(dipanggil, ['http://host.docker.internal:8643/v1/chat/completions']);
  assert.equal(ringkasan, 'Ringkasan dari lokal.');
});

test('req_4_6_ringkasan_panggilan_campuran_tidak_ke_cloud', async () => {
  const { dipanggil } = await ringkasPanggilan({ providerGiliran: ['cloud', 'lokal', 'cloud'], providerAkhir: 'cloud' });
  assert.ok(dipanggil.every((u) => !u.includes(':8642')));
  const tanpaProvider = await ringkasPanggilan({ providerGiliran: ['cloud', 'tidak_diketahui'], providerAkhir: 'cloud' });
  assert.deepEqual(tanpaProvider.dipanggil, [], 'provider tidak diketahui memakai tiruan tanpa AI');
  assert.match(tanpaProvider.ringkasan, /^Penelepon menanyakan: /);
});

test('req_4_6_ringkasan_panggilan_cloud_memakai_cloud', async () => {
  const { ringkasan, dipanggil } = await ringkasPanggilan({ providerGiliran: ['cloud', 'cloud'], providerAkhir: 'cloud' });
  assert.deepEqual(dipanggil, ['http://host.docker.internal:8642/v1/chat/completions']);
  assert.equal(ringkasan, 'Ringkasan dari cloud.');
});

test('req_4_7_ringkasan_lokal_no_reply_pakai_tiruan', async () => {
  const { ringkasan, dipanggil } = await ringkasPanggilan({
    providerGiliran: ['lokal'], providerAkhir: 'lokal', jawabanLokal: '⚠️ No reply: every provider failed',
  });
  assert.ok(dipanggil.every((u) => !u.includes(':8642')));
  assert.match(ringkasan, /^Penelepon menanyakan: /);
});

test('req_4_7_peringkas_lokal_ringkasan_kosong_pakai_tiruan', async () => {
  const cloud = peringkasSpy('cloud'), tiruan = peringkasSpy('tiruan');
  const lokal = { dipanggil: 0, async ringkas() { lokal.dipanggil++; return { ringkasan: '', token: 5 }; } };
  const peringkas = new PeringkasSesuaiProvider({ pemilih: new PemilihProviderTiruan('lokal'), cloud, lokal, tiruan });
  assert.equal((await peringkas.ringkas('x')).ringkasan, 'tiruan');
  assert.equal(cloud.dipanggil, 0);
});

test('req_4_6_modul_provider_ikut_image_docker', () => {
  assert.match(readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8'), /voice-gateway\/providerAi\.mjs/);
});

test('req_4_7_probe_ollama_sehat', async () => {
  const panggilan = [];
  let t = 1000;
  const fetch = async (url, opsi) => { panggilan.push({ url, opsi }); t += 42; return { ok: true, status: 200 }; };
  const pemeriksa = new PemeriksaOllama({ url: 'http://ollama:11434/', fetch, now: () => t });
  assert.equal(pemeriksa.kondisi(), null, 'belum pernah diperiksa');
  await pemeriksa.periksaSekali();
  assert.equal(panggilan[0].url, 'http://ollama:11434/api/tags');
  assert.deepEqual(pemeriksa.kondisi(), { sehat: true, latensiMs: 42, waktu: 1042 });
});

test('req_4_7_probe_ollama_status_galat_atau_putus_mati', async () => {
  const dengan = (balas) => new PemeriksaOllama({ url: 'http://o', fetch: async () => { if (balas instanceof Error) throw balas; return balas; }, now: () => 5 });
  const a = dengan({ ok: false, status: 500 });
  await a.periksaSekali();
  assert.equal(a.kondisi().sehat, false);
  const b = dengan(new Error('ECONNREFUSED'));
  await b.periksaSekali();
  assert.deepEqual(b.kondisi(), { sehat: false, latensiMs: null, waktu: 5 });
});

test('req_4_7_probe_ollama_timeout_mati', async () => {
  let sinyal;
  const fetch = (url, opsi) => new Promise((_, tolak) => {
    sinyal = opsi.signal;
    opsi.signal.addEventListener('abort', () => tolak(opsi.signal.reason));
  });
  const pemeriksa = new PemeriksaOllama({ url: 'http://o', fetch, batasMs: 20 });
  await pemeriksa.periksaSekali();
  assert.ok(sinyal.aborted);
  assert.equal(pemeriksa.kondisi().sehat, false);
  assert.equal(pemeriksa.kondisi().latensiMs, null);
});

test('req_4_7_tanpa_ollama_url_null', async () => {
  let dipanggil = 0;
  const pemeriksa = new PemeriksaOllama({ url: '', fetch: async () => { dipanggil++; return { ok: true }; } });
  await pemeriksa.periksaSekali();
  pemeriksa.mulai();
  pemeriksa.berhenti();
  assert.equal(pemeriksa.kondisi(), null);
  assert.equal(dipanggil, 0);
});

test('req_4_7_probe_ollama_mulai_berkala_dan_berhenti', async () => {
  let dipanggil = 0;
  const pemeriksa = new PemeriksaOllama({ url: 'http://o', fetch: async () => { dipanggil++; return { ok: true }; }, intervalMs: 10 });
  assert.equal(dipanggil, 0, 'tidak berjalan sebelum mulai');
  pemeriksa.mulai();
  await new Promise((r) => setTimeout(r, 60));
  pemeriksa.berhenti();
  const sesudah = dipanggil;
  assert.ok(sesudah >= 2);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(dipanggil, sesudah);
});

test('req_4_7_batas_waktu_lokal_tidak_sah_pakai_bawaan', () => {
  assert.equal(batasWaktuLokal('abc'), 20000);
  assert.equal(batasWaktuLokal('0'), 20000);
  assert.equal(batasWaktuLokal('-5'), 20000);
  assert.equal(batasWaktuLokal('Infinity'), 20000);
  assert.equal(batasWaktuLokal('15000'), 15000);
});
