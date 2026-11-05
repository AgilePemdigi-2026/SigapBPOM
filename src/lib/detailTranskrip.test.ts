import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PESAN_CATATAN_TERSIMPAN,
  PESAN_CATATAN_WAJIB_DIISI,
  PenyimpananTranskripMock,
  TranskripController,
  type BarisRiwayatPercakapan,
  type UcapanTranskrip,
} from './TranskripController.ts';
import { PESAN_DETAIL_TRANSKRIP, bacaDetailTranskrip, pilihPenyimpananTranskrip, samarkanNomorDiTeks, simpanCatatan } from './detailTranskrip.ts';
import { PenyimpananTranskripPetugasSupabase } from './penyimpananTranskripPetugasSupabase.ts';
import { PESAN_SISTEM } from './sesiSupabase.ts';

const ID = '9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b';
// Nomor telepon Indonesia yang tidak tersamar (NFR-13), misalnya 081234567890.
const NOMOR_UTUH = /(?<!\d)(?:\+?62|0)8\d{8,11}(?!\d)/;

const percakapan: BarisRiwayatPercakapan = {
  id: ID,
  percakapanId: ID,
  waktuMulai: '2026-10-20T02:15:00Z',
  waktuSelesai: '2026-10-20T02:18:00Z',
  jenisInteraksi: 'pengaduan',
  ringkasan: 'Krim Wajah Glowing, iritasi kulit setelah dua hari pemakaian',
  statusPenyelesaian: 'tiket_terbit',
  noTiket: 'ADU-20261020-0456',
  noTelp: '0812****7890',
  noTelpTersamar: '0812****7890',
  namaPelaporTersamar: 'B***',
};

const ucapan = (urutan: number, pembicara: UcapanTranskrip['pembicara'], teks: string, detikKe: number): UcapanTranskrip =>
  ({ id: urutan, percakapanId: ID, urutan, pembicara, teks, detikKe });

// Sengaja tidak berurutan: urutan tampil ditentukan kolom `urutan`, bukan urutan baris dari penyimpanan.
const TRANSKRIP = [
  ucapan(3, 'sistem', 'Pengaduan Anda telah dicatat dengan nomor tiket ADU-20261020-0456. Tindak lanjut akan dikirim melalui SMS.', 15),
  ucapan(1, 'sistem', 'Silakan sebutkan nama produk, kronologi kejadian, nama, dan nomor telepon Anda.', 0),
  ucapan(2, 'penelepon', 'Krim Wajah Glowing membuat kulit saya iritasi. Nama saya B*** S******, nomor telepon 0812****7890.', 6),
];

const controller = (transkrip = TRANSKRIP) =>
  new TranskripController(new PenyimpananTranskripMock({ riwayat: [percakapan], transkrip: { [ID]: transkrip }, catatan: {} }));

test('t_f6_2_02 req_5_2 TranskripPercakapan urut sesuai urutan dengan stempel waktu', async () => {
  const hasil = await bacaDetailTranskrip(controller(), ID);
  assert.ok('detail' in hasil);
  assert.deepEqual(hasil.detail.ucapan.map((u) => [u.urutan, u.stempel, u.pembicara]), [
    [1, '00:00', 'CS AI'],
    [2, '00:06', 'Penelepon'],
    [3, '00:15', 'CS AI'],
  ]);
});

test('t_f6_2_02 req_5_2 RingkasanPercakapan memuat ringkasan dan label status penyelesaian', async () => {
  const hasil = await bacaDetailTranskrip(controller(), ID);
  assert.ok('detail' in hasil);
  assert.equal(hasil.detail.ringkasan, 'Krim Wajah Glowing, iritasi kulit setelah dua hari pemakaian');
  assert.equal(hasil.detail.labelStatus, 'tiket terbit');
  assert.equal(hasil.detail.jenis, 'Pengaduan');
  assert.equal(hasil.detail.waktu, '20 Okt 2026 · 09:15');
});

test('t_f6_2_02 nfr_13 data pribadi tersamar: nomor utuh di teks disamarkan, nilai tersamar dibiarkan', async () => {
  const bocor = [...TRANSKRIP, ucapan(4, 'penelepon', 'Hubungi saya di 0812-3456-7890 atau +6281234567890.', 20)];
  const hasil = await bacaDetailTranskrip(controller(bocor), ID);
  assert.ok('detail' in hasil);
  const teks = hasil.detail.ucapan.map((u) => u.teks).join('\n');
  assert.doesNotMatch(teks.replace(/[\s-]/g, ''), NOMOR_UTUH);
  assert.ok(teks.includes('B*** S******'));
  assert.equal(hasil.detail.ucapan[3].teks, 'Hubungi saya di 0812****7890 atau 0812****7890.');
  assert.equal(samarkanNomorDiTeks('nomor saya 0812****7890'), 'nomor saya 0812****7890');
  assert.equal(samarkanNomorDiTeks('kode ADU-20261020-0456 tetap utuh'), 'kode ADU-20261020-0456 tetap utuh');
});

test('t_f6_2_02 percakapan tidak ada atau id tidak sah memberi 404, penyimpanan gagal memberi 503', async () => {
  assert.deepEqual(await bacaDetailTranskrip(controller(), '1b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b'), { gagal: PESAN_DETAIL_TRANSKRIP.gagalDimuat, kode: 404 });
  assert.deepEqual(await bacaDetailTranskrip(controller(), "x' or 1=1"), { gagal: PESAN_DETAIL_TRANSKRIP.gagalDimuat, kode: 404 });
  assert.deepEqual(await bacaDetailTranskrip(controller(), null), { gagal: PESAN_DETAIL_TRANSKRIP.gagalDimuat, kode: 404 });
  const rusak = new PenyimpananTranskripMock({ riwayat: [percakapan] });
  rusak.ambilTranskrip = async () => { throw new Error('Supabase 500'); };
  assert.deepEqual(await bacaDetailTranskrip(new TranskripController(rusak), ID), { gagal: PESAN_DETAIL_TRANSKRIP.gagalDimuat, kode: 503 });
});

test('t_f6_2_02 req_5_4 catatan kosong menampilkan pesan wajib diisi persis kamus dan tidak tersimpan', async () => {
  const c = controller();
  for (const isi of ['', '   \n ', null]) {
    assert.deepEqual(await simpanCatatan(c, ID, isi), { berhasil: false, pesan: 'Catatan pemeriksaan wajib diisi.' });
  }
  assert.equal(PESAN_CATATAN_WAJIB_DIISI, 'Catatan pemeriksaan wajib diisi.');
  assert.deepEqual(await c.ambilCatatanPemeriksaan(ID), []);
});

test('t_f6_2_02 req_5_3 catatan tersimpan pada percakapan terkait dengan pesan persis kamus', async () => {
  const c = controller();
  assert.deepEqual(await simpanCatatan(c, ID, '  Perlu verifikasi ulang data pelapor '), { berhasil: true, pesan: 'Catatan pemeriksaan tersimpan.' });
  assert.equal(PESAN_CATATAN_TERSIMPAN, 'Catatan pemeriksaan tersimpan.');
  assert.deepEqual((await c.ambilCatatanPemeriksaan(ID)).map((x) => x.isi), ['Perlu verifikasi ulang data pelapor']);
});

test('t_f6_2_02 simpan catatan gagal di server memberi pesan sistem, tanpa detail teknis', async () => {
  const rusak = new PenyimpananTranskripMock({ riwayat: [percakapan] });
  rusak.simpanCatatan = async () => { throw new Error('Supabase 500 pada rpc/simpan_catatan_pemeriksaan'); };
  assert.deepEqual(await simpanCatatan(new TranskripController(rusak), ID, 'isi'), { berhasil: false, pesan: PESAN_SISTEM });
  assert.deepEqual(await simpanCatatan(controller(), 'bukan-uuid', 'isi'), { berhasil: false, pesan: PESAN_SISTEM });
});

test('t_f6_2_02 penyimpanan tiruan hanya tanpa token di luar produksi', () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
  assert.ok(pilihPenyimpananTranskrip(undefined, env, false) instanceof PenyimpananTranskripMock);
  assert.ok(pilihPenyimpananTranskrip('token', env, false) instanceof PenyimpananTranskripPetugasSupabase);
  assert.ok(pilihPenyimpananTranskrip(undefined, env, true) instanceof PenyimpananTranskripPetugasSupabase);
});

type Permintaan = { url: string; method: string; body?: unknown; auth: string | null };

function supabaseTiruan(jawab: (p: Permintaan) => Response) {
  const dicatat: Permintaan[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const p = { url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.get('authorization') };
    dicatat.push(p);
    return jawab(p);
  }) as typeof globalThis.fetch;
  return { dicatat, adapter: new PenyimpananTranskripPetugasSupabase({ url: 'https://x.supabase.co/', kunciPublik: 'anon', tokenAkses: 'tok', fetch }) };
}

test('t_f6_2_02 adapter membaca view tersamar dengan token petugas dan memetakan kolom', async () => {
  const { dicatat, adapter } = supabaseTiruan((p) => {
    if (p.url.includes('/riwayat_percakapan')) {
      return Response.json([{ id: ID, percakapan_id: ID, waktu_mulai: percakapan.waktuMulai, waktu_selesai: null, jenis_interaksi: 'pengaduan', ringkasan: 'R', status_penyelesaian: 'tiket_terbit', no_tiket: null, no_telp: '0812****7890', no_telp_tersamar: '0812****7890', nama_pelapor_tersamar: 'B***' }]);
    }
    if (p.url.includes('/ucapan_petugas')) return Response.json([{ id: 7, percakapan_id: ID, urutan: 1, pembicara: 'penelepon', teks: 'Halo', detik_ke: 3 }]);
    return Response.json([{ id: 'c1', percakapan_id: ID, petugas_id: 'p1', petugas_nama: 'Petugas', isi: 'Cek', waktu: '2026-10-20T03:00:00Z' }]);
  });
  const detail = await new TranskripController(adapter).ambilDetailTranskrip(ID);
  assert.equal(detail?.percakapan.statusPenyelesaian, 'tiket_terbit');
  assert.equal(detail?.percakapan.namaPelaporTersamar, 'B***');
  assert.deepEqual(detail?.ucapan, [{ id: 7, percakapanId: ID, urutan: 1, pembicara: 'penelepon', teks: 'Halo', detikKe: 3 }]);
  assert.equal(detail?.catatanPemeriksaan?.[0].isi, 'Cek');

  const [riwayat, transkrip, catatan] = dicatat;
  assert.ok(dicatat.every((p) => p.auth === 'Bearer tok'));
  assert.equal(new URL(riwayat.url).searchParams.get('id'), `eq.${ID}`);
  assert.match(transkrip.url, /^https:\/\/x\.supabase\.co\/rest\/v1\/ucapan_petugas\?/);
  assert.equal(new URL(transkrip.url).searchParams.get('order'), 'urutan.asc');
  assert.deepEqual([catatan.method, new URL(catatan.url).pathname, catatan.body], ['POST', '/rest/v1/rpc/ambil_catatan_pemeriksaan', { p_percakapan_id: ID }]);
});

test('t_f6_2_02 adapter menyimpan catatan lewat RPC dan memetakan penolakan catatan kosong ke pesan kamus', async () => {
  const { dicatat, adapter } = supabaseTiruan((p) =>
    p.body && (p.body as { p_catatan: string }).p_catatan === 'kosong'
      ? Response.json({ code: '22023', message: 'Catatan pemeriksaan wajib diisi.' }, { status: 400 })
      : Response.json('c-baru'),
  );
  assert.deepEqual(await adapter.simpanCatatan(ID, 'Cek ulang'), { id: 'c-baru', pesan: PESAN_CATATAN_TERSIMPAN });
  assert.deepEqual([new URL(dicatat[0].url).pathname, dicatat[0].body], ['/rest/v1/rpc/simpan_catatan_pemeriksaan', { p_percakapan_id: ID, p_catatan: 'Cek ulang' }]);
  await assert.rejects(adapter.simpanCatatan(ID, 'kosong'), { message: PESAN_CATATAN_WAJIB_DIISI });
});
