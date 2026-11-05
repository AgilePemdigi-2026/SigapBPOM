import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BasisPengetahuanController, PESAN_MATERI, UKURAN_HALAMAN_MAKS, susunGraf, type MateriTersimpan, type PenyimpananMateri } from './BasisPengetahuanController.ts';
import { PenyimpananMateriTiruan } from './mock/materiTiruan.ts';
import { PenyimpananMateriSupabase } from './penyimpananMateriSupabase.ts';

const materi = (id: string, judul: string, kategori: string, rujukanSumber: string, status: MateriTersimpan['status'] = 'aktif'): MateriTersimpan =>
  ({ id, judul, kategori, rujukanSumber, status, diperbaruiPada: `2026-10-${id.padStart(2, '0')}T00:00:00+07:00` });

const CONTOH = [
  materi('1', 'Izin Edar Suplemen', 'Suplemen Kesehatan', 'Peraturan BPOM No. 17 Tahun 2019'),
  materi('2', 'Label Pangan Olahan', 'Pangan Olahan', 'Peraturan BPOM No. 31 Tahun 2018'),
  materi('3', 'Kosmetik Bermerkuri', 'Kosmetik', 'Penjelasan Publik'),
  materi('4', 'Penarikan Sirup', 'Obat', 'Penjelasan Publik', 'tidak_aktif'),
];

const basis = () => new BasisPengetahuanController(new PenyimpananMateriTiruan(CONTOH));

test('t_f2_1_03 daftar materi mengembalikan bentuk tabel halaman Basis Pengetahuan', async () => {
  const hasil = await basis().daftarMateri({ ukuran: 10 });
  assert.ok('materi' in hasil);
  assert.equal(hasil.total, 4);
  assert.deepEqual(hasil.materi[0], { id: '1', judul: 'Izin Edar Suplemen', kategori: 'Suplemen Kesehatan', rujukan: 'Peraturan BPOM No. 17 Tahun 2019', tgl: '01 Okt 2026', aktif: true });
  assert.equal(hasil.materi[3].aktif, false);
});

test('t_f2_1_03 filter status, pencarian judul atau rujukan, dan paginasi', async () => {
  const aktif = await basis().daftarMateri({ status: 'tidak_aktif' });
  assert.ok('materi' in aktif);
  assert.deepEqual(aktif.materi.map((m) => m.id), ['4']);

  const cari = await basis().daftarMateri({ cari: '  penjelasan publik ' });
  assert.ok('materi' in cari);
  assert.deepEqual(cari.materi.map((m) => m.id), ['3', '4']);

  const halaman2 = await basis().daftarMateri({ ukuran: 3, halaman: 2 });
  assert.ok('materi' in halaman2);
  assert.equal(halaman2.total, 4);
  assert.deepEqual(halaman2.materi.map((m) => m.id), ['4']);
});

test('t_f2_1_03 kueri tidak sah dinormalkan, bukan diteruskan apa adanya', async () => {
  const dicatat: unknown[] = [];
  const penyimpanan: PenyimpananMateri = { daftar: async (k) => (dicatat.push(k), { baris: [], total: 0 }), potongan: async () => ({}), nonaktifkan: async () => false };
  await new BasisPengetahuanController(penyimpanan).daftarMateri({ status: 'hapus', halaman: -3, ukuran: 99999, cari: 'x'.repeat(500) });
  assert.deepEqual(dicatat[0], { status: undefined, cari: 'x'.repeat(100), offset: 0, batas: UKURAN_HALAMAN_MAKS });
});

test('t_f2_1_03 error jaringan menghasilkan pesan gagal memuat dari kamus', async () => {
  const rusak: PenyimpananMateri = { daftar: async () => { throw new Error('fetch failed'); }, potongan: async () => ({}), nonaktifkan: async () => false };
  const kb = new BasisPengetahuanController(rusak);
  assert.deepEqual(await kb.daftarMateri(), { gagal: PESAN_MATERI.gagalDimuat });
  assert.deepEqual(await kb.semuaMateri(), { gagal: PESAN_MATERI.gagalDimuat });
  assert.deepEqual(await kb.grafPengetahuan(), { gagal: PESAN_MATERI.gagalDimuat });
});

test('t_f2_1_03 halaman dan graf membaca seluruh materi per 1000 baris, tidak terpotong batas PostgREST', async () => {
  const KORPUS = UKURAN_HALAMAN_MAKS + 32;
  const diminta: string[] = [];
  // Meniru PostgREST Supabase: paling banyak 1000 baris per permintaan, total di Content-Range.
  const fetchPostgrest = (async (url: string) => {
    if (url.includes('materi_potongan')) return Response.json([]);
    const p = new URL(url).searchParams;
    diminta.push(`${p.get('offset')}+${p.get('limit')}`);
    const awal = Number(p.get('offset'));
    const akhir = Math.min(KORPUS, awal + Math.min(UKURAN_HALAMAN_MAKS, Number(p.get('limit'))));
    const baris = Array.from({ length: akhir - awal }, (_, i) => ({
      id: `m${awal + i}`,
      judul: `Materi ${awal + i}`,
      // Kategori Kosmetik hanya ada di baris terakhir, setelah batas 1000.
      kategori: awal + i === KORPUS - 1 ? 'Kosmetik' : 'Pangan Olahan',
      rujukan_sumber: 'Penjelasan Publik',
      status: 'aktif',
      diperbarui_pada: '2026-10-01T00:00:00+07:00',
    }));
    return Response.json(baris, { headers: { 'Content-Range': `${awal}-${akhir - 1}/${KORPUS}` } });
  }) as unknown as typeof fetch;
  const kb = new BasisPengetahuanController(new PenyimpananMateriSupabase({ url: 'https://contoh.supabase.co', kunciPublik: 'publik', tokenAkses: 'token-petugas', fetch: fetchPostgrest }));

  const semua = await kb.semuaMateri();
  assert.ok('materi' in semua);
  assert.equal(semua.total, KORPUS);
  assert.equal(new Set(semua.materi.map((m) => m.id)).size, KORPUS);
  assert.deepEqual(diminta, ['0+1000', '1000+1000']);

  const graf = await kb.grafPengetahuan();
  assert.ok('simpul' in graf);
  assert.ok(graf.simpul.some((n) => n.id === 'kategori:Kosmetik'), 'kategori di luar 1000 baris pertama tetap masuk graf');
});

test('t_f2_4_02 graf hanya memuat materi aktif, tersambung ke kategori dan rujukan bersama', async () => {
  const graf = await basis().grafPengetahuan();
  assert.ok('simpul' in graf);
  const ids = new Set(graf.simpul.map((n) => n.id));
  assert.ok(!ids.has('4'), 'materi tidak aktif tidak masuk graf');
  assert.equal(graf.simpul.filter((n) => n.hub).length, 3);
  for (const [a, b] of graf.sisi) assert.ok(ids.has(a) && ids.has(b), `sisi ${a}-${b} menunjuk simpul yang ada`);
  assert.ok(graf.sisi.some(([a, b]) => a === 'kategori:Kosmetik' && b === '3'));

  const suplemen = graf.simpul.find((n) => n.id === '1')!;
  assert.equal(suplemen.rujukan, 'Peraturan BPOM No. 17 Tahun 2019');
  assert.equal(suplemen.links, 1);
  for (const n of graf.simpul) assert.ok(n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 100, `${n.id} di dalam kanvas`);
});

test('t_f2_4_02 detail simpul memuat potongan terindeks dan menghitung keterkaitan', () => {
  const graf = susunGraf([CONTOH[2], materi('5', 'Kosmetik Ilegal', 'Kosmetik', 'Penjelasan Publik')], { '3': ['Merkuri berbahaya bagi kulit.', 'Kedua', 'Ketiga', 'Keempat'] });
  const kosmetik = graf.simpul.find((n) => n.id === '3')!;
  assert.deepEqual(kosmetik.bagian, ['Merkuri berbahaya bagi kulit.', 'Kedua', 'Ketiga']);
  assert.equal(kosmetik.links, 2, 'tersambung ke kategori dan materi dengan rujukan yang sama');
  assert.ok(graf.sisi.some(([a, b]) => a === '3' && b === '5'));
});

test('t_f2_4_02 req_7_4 simpul topik menampilkan potongan terindeks dan rujukan sumber materinya, bukan judul materi', () => {
  const graf = susunGraf(
    [CONTOH[2], materi('5', 'Kosmetik Ilegal', 'Kosmetik', 'Penjelasan Publik'), materi('6', 'Kosmetik Impor', 'Kosmetik', 'Peraturan BPOM No. 23 Tahun 2019')],
    { '3': ['Merkuri berbahaya bagi kulit.', 'Kedua'], '6': ['Notifikasi kosmetik impor.'] },
  );
  const topik = graf.simpul.find((n) => n.id === 'kategori:Kosmetik')!;
  assert.deepEqual(topik.bagian, ['Merkuri berbahaya bagi kulit.', 'Notifikasi kosmetik impor.']);
  assert.equal(topik.rujukan, 'Penjelasan Publik, Peraturan BPOM No. 23 Tahun 2019');

  const tanpaPotongan = susunGraf([CONTOH[0]], {}).simpul.find((n) => n.hub)!;
  assert.deepEqual(tanpaPotongan.bagian, [], 'tanpa potongan terindeks daftarnya kosong, bukan judul materi');
});

test('req_7_3 nonaktifkan materi mengubah status tanpa menghapus dan mengeluarkannya dari graf', async () => {
  const kb = new BasisPengetahuanController(new PenyimpananMateriTiruan(CONTOH.map((m) => ({ ...m }))));
  assert.deepEqual(await kb.nonaktifkanMateri(' 3 '), { kode: 200, pesan: PESAN_MATERI.dinonaktifkan });

  const tidakAktif = await kb.daftarMateri({ status: 'tidak_aktif' });
  assert.ok('materi' in tidakAktif);
  assert.deepEqual(tidakAktif.materi.map((m) => m.id).sort(), ['3', '4'], 'materi tetap ada di filter Tidak aktif (BR-5)');
  const semua = await kb.daftarMateri();
  assert.ok('materi' in semua);
  assert.equal(semua.total, 4);

  const graf = await kb.grafPengetahuan();
  assert.ok('simpul' in graf);
  assert.ok(!graf.simpul.some((n) => n.id === '3'), 'materi tidak aktif tidak lagi dipakai sebagai sumber');
});

test('req_7_3 id tidak sah 400, tidak dikenal 404, galat penyimpanan 500, semuanya dengan pesan gagal', async () => {
  const kb = new BasisPengetahuanController(new PenyimpananMateriTiruan(CONTOH.map((m) => ({ ...m }))));
  const pesan = PESAN_MATERI.gagalDinonaktifkan;
  assert.deepEqual(await kb.nonaktifkanMateri(''), { kode: 400, pesan });
  assert.deepEqual(await kb.nonaktifkanMateri(undefined), { kode: 400, pesan });
  assert.deepEqual(await kb.nonaktifkanMateri('x'.repeat(65)), { kode: 400, pesan });
  assert.deepEqual(await kb.nonaktifkanMateri('tidak-ada'), { kode: 404, pesan });
  const rusak: PenyimpananMateri = { daftar: async () => ({ baris: [], total: 0 }), potongan: async () => ({}), nonaktifkan: async () => { throw new Error('fetch failed'); } };
  assert.deepEqual(await new BasisPengetahuanController(rusak).nonaktifkanMateri('1'), { kode: 500, pesan });
});

test('req_7_3 adapter Supabase mengirim PATCH status lewat token sesi, tanpa DELETE dan tanpa isian pengubah', async () => {
  const dicatat: { url: string; init: RequestInit }[] = [];
  const fetchTiruan = (async (url: string, init: RequestInit) => {
    dicatat.push({ url, init });
    return new Response(JSON.stringify(url.includes('tidak-ada') ? [] : [{ id: 'a' }]), { status: 200 });
  }) as unknown as typeof fetch;
  const supa = new PenyimpananMateriSupabase({ url: 'https://contoh.supabase.co/', kunciPublik: 'publik', tokenAkses: 'token-petugas', fetch: fetchTiruan });

  assert.equal(await supa.nonaktifkan('a'), true);
  assert.equal(await supa.nonaktifkan('tidak-ada'), false);
  const { url, init } = dicatat[0];
  assert.equal(init.method, 'PATCH');
  assert.equal(url, 'https://contoh.supabase.co/rest/v1/materi_pengetahuan?id=eq.a&select=id');
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer token-petugas');
  assert.deepEqual(JSON.parse(init.body as string), { status: 'tidak_aktif' });
});

