// Uji integrasi terhadap Supabase lokal (`supabase start` lalu `supabase db reset`). Dilewati bila variabel
// SIGAP_UJI_* tidak diisi, karena CI belum menjalankan Supabase. Contoh:
//   SIGAP_UJI_SUPABASE_URL=http://127.0.0.1:54321 SIGAP_UJI_KUNCI_PUBLIK=<anon key> \
//   SIGAP_UJI_EMAIL=<email seed> SIGAP_UJI_PASSWORD=<password seed> npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PenyimpananMateriSupabase } from './penyimpananMateriSupabase.ts';
import { BasisPengetahuanController } from './BasisPengetahuanController.ts';
import { DOKUMEN_KORPUS } from './mock/materiTiruan.ts';

const { SIGAP_UJI_SUPABASE_URL: url = '', SIGAP_UJI_KUNCI_PUBLIK: kunciPublik = '', SIGAP_UJI_EMAIL: email = '', SIGAP_UJI_PASSWORD: password = '' } = process.env;
const lewati = !(url && kunciPublik && email && password) && 'butuh Supabase lokal dan variabel SIGAP_UJI_*';

async function tokenPetugas() {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: kunciPublik, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, 'akun seed petugas bisa login');
  return ((await res.json()) as { access_token: string }).access_token;
}

test('t_f2_1_03 sesi petugas membaca materi seed lewat RLS dengan filter, pencarian, dan paginasi', { skip: lewati }, async () => {
  const kb = new BasisPengetahuanController(new PenyimpananMateriSupabase({ url, kunciPublik, tokenAkses: await tokenPetugas() }));

  const semua = await kb.daftarMateri({ ukuran: 5 });
  assert.ok('materi' in semua);
  assert.equal(semua.total, DOKUMEN_KORPUS.length);
  assert.equal(semua.materi.length, 5);

  const rujukan = DOKUMEN_KORPUS.find((d) => d.rujukanSumber.includes('No.'))!.rujukanSumber;
  const cari = await kb.daftarMateri({ cari: rujukan.toLowerCase(), ukuran: 50 });
  assert.ok('materi' in cari);
  assert.equal(cari.total, DOKUMEN_KORPUS.filter((d) => `${d.judul} ${d.rujukanSumber}`.toLowerCase().includes(rujukan.toLowerCase())).length);
  assert.ok(cari.materi.some((m) => m.rujukan === rujukan));

  const nonaktif = await kb.daftarMateri({ status: 'tidak_aktif' });
  assert.ok('materi' in nonaktif);
  assert.equal(nonaktif.total, 0);

  const jauh = await kb.daftarMateri({ halaman: 999 });
  assert.deepEqual(jauh, { materi: [], total: DOKUMEN_KORPUS.length });
});

test('t_f2_1_03 kata kunci berkarakter filter PostgREST tidak merusak kueri', { skip: lewati }, async () => {
  const kb = new BasisPengetahuanController(new PenyimpananMateriSupabase({ url, kunciPublik, tokenAkses: await tokenPetugas() }));
  const hasil = await kb.daftarMateri({ cari: 'gizi),status.eq.aktif,(judul.ilike.*' });
  assert.ok('materi' in hasil);
});

test('t_f2_1_03 tanpa sesi petugas materi tidak terbaca', { skip: lewati }, async () => {
  const kb = new BasisPengetahuanController(new PenyimpananMateriSupabase({ url, kunciPublik, tokenAkses: kunciPublik }));
  assert.ok('gagal' in (await kb.daftarMateri()));
});

test('t_f2_4_02 graf dari materi Supabase menunjuk materi yang benar-benar tersimpan', { skip: lewati }, async () => {
  const penyimpanan = new PenyimpananMateriSupabase({ url, kunciPublik, tokenAkses: await tokenPetugas() });
  const graf = await new BasisPengetahuanController(penyimpanan).grafPengetahuan();
  assert.ok('simpul' in graf);
  const { baris } = await penyimpanan.daftar({ status: 'aktif', offset: 0, batas: 1000 });
  const perId = new Map(baris.map((m) => [m.id, m]));
  const materi = graf.simpul.filter((n) => !n.hub);
  assert.ok(materi.length > 0);
  for (const n of materi) assert.equal(n.rujukan, perId.get(n.id)?.rujukanSumber, `rujukan simpul ${n.label} sesuai tabel`);
});
