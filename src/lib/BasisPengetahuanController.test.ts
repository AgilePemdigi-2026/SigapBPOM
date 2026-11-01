import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BasisPengetahuanController, PESAN_MATERI, UKURAN_HALAMAN_MAKS, susunGraf, type MateriTersimpan, type PenyimpananMateri } from './BasisPengetahuanController.ts';
import { PenyimpananMateriTiruan } from './mock/materiTiruan.ts';

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
  const penyimpanan: PenyimpananMateri = { daftar: async (k) => (dicatat.push(k), { baris: [], total: 0 }), potongan: async () => ({}) };
  await new BasisPengetahuanController(penyimpanan).daftarMateri({ status: 'hapus', halaman: -3, ukuran: 99999, cari: 'x'.repeat(500) });
  assert.deepEqual(dicatat[0], { status: undefined, cari: 'x'.repeat(100), offset: 0, batas: UKURAN_HALAMAN_MAKS });
});

test('t_f2_1_03 error jaringan menghasilkan pesan gagal memuat dari kamus', async () => {
  const rusak: PenyimpananMateri = { daftar: async () => { throw new Error('fetch failed'); }, potongan: async () => ({}) };
  const kb = new BasisPengetahuanController(rusak);
  assert.deepEqual(await kb.daftarMateri(), { gagal: PESAN_MATERI.gagalDimuat });
  assert.deepEqual(await kb.grafPengetahuan(), { gagal: PESAN_MATERI.gagalDimuat });
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
