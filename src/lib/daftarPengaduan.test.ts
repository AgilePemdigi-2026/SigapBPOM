import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PESAN_PEMANTAUAN } from './PemantauanLayananController.ts';
import {
  PenyimpananDaftarPengaduanTiruan,
  ambilDaftarPengaduan,
  pilihPenyimpananDaftarPengaduan,
  type PengaduanTersimpan,
  type PengaduanTidakLengkap,
  type PenyimpananDaftarPengaduan,
} from './daftarPengaduan.ts';
import { PenyimpananDaftarPengaduanSupabase } from './penyimpananDaftarPengaduanSupabase.ts';

const aduan = (noTiket: string, status: string, tgl: string, namaProduk: string | null = 'Krim Wajah Glowing', kategori: string | null = 'Kosmetik'): PengaduanTersimpan =>
  ({ noTiket, namaProduk, kategori, tglPengaduan: tgl, status });

const CONTOH: PengaduanTersimpan[] = [
  aduan('ADU-20261020-0456', 'belum_ditelaah', '2026-10-20T02:20:00Z'),
  aduan('ADU-20261019-0455', 'selesai', '2026-10-19T03:00:00Z', 'Jamu Pegal Linu', 'Obat Tradisional'),
  aduan('ADU-20261021-0457', 'belum_ditelaah', '2026-10-21T01:00:00Z', 'Keripik Singkong', 'Pangan Olahan'),
  aduan('ADU-20261018-0450', 'sedang_ditelaah', '2026-10-18T04:00:00Z'),
  aduan('ADU-20261017-0449', 'diteruskan', '2026-10-17T04:00:00Z', null, null),
];
const TIDAK_LENGKAP: PengaduanTidakLengkap[] = [{ percakapanId: '9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b', kategori: 'Kosmetik', waktu: '2026-10-21T05:00:00Z' }];

const penyimpanan = () => new PenyimpananDaftarPengaduanTiruan(CONTOH, TIDAK_LENGKAP);

test('t_f7_1_02 filter status menampilkan jumlah per tahap yang benar', async () => {
  const hasil = await ambilDaftarPengaduan(penyimpanan(), {});
  assert.ok(!('gagal' in hasil));
  assert.deepEqual(hasil.filter.map((f) => [f.label, f.jumlah, f.aktif]), [
    ['Semua', 5, true],
    ['Belum Ditelaah', 2, false],
    ['Sedang Ditelaah', 1, false],
    ['Menunggu Pemeriksaan', 0, false],
    ['Tanggapan Disusun', 0, false],
    ['Selesai', 1, false],
    ['Diteruskan ke Instansi Lain', 1, false],
  ]);
  assert.deepEqual(hasil.filter.map((f) => f.tautan).slice(0, 3), ['/pengaduan', '/pengaduan?status=belum_ditelaah', '/pengaduan?status=sedang_ditelaah']);
});

test('t_f7_1_02 filter status menyaring tabel, jumlah per tahap tetap dari semua pengaduan', async () => {
  const hasil = await ambilDaftarPengaduan(penyimpanan(), { status: 'belum_ditelaah' });
  assert.ok(!('gagal' in hasil));
  assert.deepEqual(hasil.pengaduan.map((p) => p.noTiket), ['ADU-20261021-0457', 'ADU-20261020-0456']);
  assert.equal(hasil.filter.find((f) => f.aktif)?.label, 'Belum Ditelaah');
  assert.equal(hasil.filter[0].jumlah, 5);
  // Nilai status yang tidak dikenal kembali ke Semua, bukan diteruskan ke penyimpanan.
  const tidakSah = await ambilDaftarPengaduan(penyimpanan(), { status: "x'; drop" });
  assert.ok(!('gagal' in tidakSah));
  assert.equal(tidakSah.status, '');
  assert.equal(tidakSah.pengaduan.length, 5);
});

test('t_f7_1_02 tabel memuat nomor tiket, produk diadukan, kategori, tanggal pengaduan, dan status, terbaru lebih dulu', async () => {
  const hasil = await ambilDaftarPengaduan(penyimpanan(), {});
  assert.ok(!('gagal' in hasil));
  assert.deepEqual(hasil.pengaduan.map((p) => p.noTiket), ['ADU-20261021-0457', 'ADU-20261020-0456', 'ADU-20261019-0455', 'ADU-20261018-0450', 'ADU-20261017-0449']);
  assert.deepEqual(hasil.pengaduan[1], {
    noTiket: 'ADU-20261020-0456',
    produk: 'Krim Wajah Glowing',
    kategori: 'Kosmetik',
    tanggal: '20 Okt 2026 · 09:20',
    labelStatus: 'Belum Ditelaah',
    tautanTelaah: '/pengaduan/detail?tiket=ADU-20261020-0456',
    tautanKasus: '/pengaduan/detail?tiket=ADU-20261020-0456',
  });
  assert.equal(hasil.pengaduan[4].produk, '—');
  assert.equal(hasil.pengaduan[4].kategori, '—');
});

test('t_f7_1_02 tombol Telaah hanya pada pengaduan Belum Ditelaah', async () => {
  const hasil = await ambilDaftarPengaduan(penyimpanan(), {});
  assert.ok(!('gagal' in hasil));
  for (const p of hasil.pengaduan) {
    assert.equal(p.tautanTelaah !== null, p.labelStatus === 'Belum Ditelaah', p.noTiket);
  }
});

test('t_f7_1_02 pengaduan tidak lengkap ditampilkan terpisah tanpa nomor tiket', async () => {
  const hasil = await ambilDaftarPengaduan(penyimpanan(), { status: 'selesai' });
  assert.ok(!('gagal' in hasil));
  assert.deepEqual(hasil.tidakLengkap, [
    { waktu: '21 Okt 2026 · 12:00', kategori: 'Kosmetik', tautanTranskrip: '/riwayat-percakapan/detail?id=9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b' },
  ]);
  assert.ok(hasil.pengaduan.every((p) => p.noTiket.startsWith('ADU-')));
});

test('t_f7_1_02 penyimpanan gagal menampilkan pesan kamus', async () => {
  const rusak: PenyimpananDaftarPengaduan = { daftar: async () => { throw new Error('Supabase 500'); }, tidakLengkap: async () => [] };
  assert.deepEqual(await ambilDaftarPengaduan(rusak, {}), { gagal: PESAN_PEMANTAUAN.detailGagalDimuat });
});

test('t_f7_1_02 penyimpanan tiruan hanya tanpa token di luar produksi', () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
  assert.ok(pilihPenyimpananDaftarPengaduan(undefined, env, false) instanceof PenyimpananDaftarPengaduanTiruan);
  assert.ok(pilihPenyimpananDaftarPengaduan('token', env, false) instanceof PenyimpananDaftarPengaduanSupabase);
  assert.ok(pilihPenyimpananDaftarPengaduan(undefined, env, true) instanceof PenyimpananDaftarPengaduanSupabase);
});

test('t_f7_1_02 adapter membaca tiket pengaduan tanpa kolom data pribadi, dengan token petugas', async () => {
  const dicatat: { url: URL; auth: string | null }[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    dicatat.push({ url: u, auth: new Headers(init.headers).get('authorization') });
    if (u.pathname.endsWith('/detail_pengaduan_tiket')) {
      return Response.json([{ no_tiket: 'ADU-1', nama_produk_diadukan: 'Krim', tgl_pengaduan: '2026-10-20T02:20:00Z', tgl_terbit: '2026-10-20T02:21:00Z', status_tiket: 'belum_ditelaah', percakapan_id: 'p-1' }]);
    }
    if (u.searchParams.get('status_penyelesaian')) return Response.json([{ id: 'p-9', topik: null, waktu_mulai: '2026-10-21T05:00:00Z' }]);
    return Response.json([{ id: 'p-1', topik: 'Kosmetik' }]);
  }) as typeof globalThis.fetch;
  const adapter = new PenyimpananDaftarPengaduanSupabase({ url: 'https://x.supabase.co/', kunciPublik: 'anon', tokenAkses: 'tok', fetch });

  assert.deepEqual(await adapter.daftar(), [{ noTiket: 'ADU-1', namaProduk: 'Krim', kategori: 'Kosmetik', tglPengaduan: '2026-10-20T02:20:00Z', status: 'belum_ditelaah' }]);
  assert.deepEqual(await adapter.tidakLengkap(), [{ percakapanId: 'p-9', kategori: null, waktu: '2026-10-21T05:00:00Z' }]);

  const [tiket, percakapan, tidakLengkap] = dicatat;
  assert.ok(dicatat.every((d) => d.auth === 'Bearer tok'));
  assert.equal(tiket.url.searchParams.get('jenis_tiket'), 'eq.pengaduan');
  assert.doesNotMatch(tiket.url.searchParams.get('select') ?? '', /pelapor|telp|kronologi/);
  assert.equal(percakapan.url.searchParams.get('id'), 'in.(p-1)');
  assert.equal(tidakLengkap.url.searchParams.get('status_penyelesaian'), 'eq.pengaduan_tidak_lengkap');
  assert.doesNotMatch(tidakLengkap.url.searchParams.get('select') ?? '', /penelepon/);
});
