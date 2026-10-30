import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PESAN_PENGADUAN, PengaduanController, type PenyimpananPengaduan } from './PengaduanController.ts';
import { PenyimpananPemantauanTiruan, contohPemantauan } from './mock/pemantauanTiruan.ts';
import { PenyimpananPemantauanSupabase } from './penyimpananPemantauanSupabase.ts';

const SEKARANG = new Date('2026-10-30T03:00:00Z');
const pengaduan = () => new PengaduanController(new PenyimpananPemantauanTiruan(contohPemantauan(SEKARANG)));

test('t_f5_3_03 REQ-4.4 detail tampil sesuai tiket dengan data tersamar dan tautan transkrip', async () => {
  const d = await pengaduan().detailPengaduan('adu-20261030-0001 ');
  assert.ok(!('gagal' in d));
  assert.equal(d.noTiket, 'ADU-20261030-0001');
  assert.equal(d.jenis, 'Pengaduan');
  assert.equal(d.labelStatus, 'Belum Ditelaah');
  assert.equal(d.ringkasan, 'Keracunan setelah makan keripik kemasan tanpa label izin edar');
  assert.equal(d.jenisLayanan, 'Pengaduan');
  assert.equal(d.topik, 'Pangan Olahan');
  assert.equal(d.namaPelapor, 'S***');
  assert.equal(d.noTelp, '0813****4521');
  assert.equal(d.tautanTranskrip, '/riwayat-percakapan/detail?id=p-3');
  assert.match(d.tglTerbit, /WIB$/);
});

test('t_f5_3_03 tiket tidak ditemukan menampilkan pesan error kamus pesan', async () => {
  assert.deepEqual(await pengaduan().detailPengaduan('ADU-20261030-9999'), { gagal: 'Tiket tidak ditemukan.' });
  assert.deepEqual(await pengaduan().detailPengaduan(null), { gagal: PESAN_PENGADUAN.tidakDitemukan });
  // Isian tidak sah tidak pernah diteruskan ke penyimpanan.
  let dipanggil = false;
  const penyimpanan: PenyimpananPengaduan = { detail: async () => ((dipanggil = true), null) };
  assert.deepEqual(await new PengaduanController(penyimpanan).detailPengaduan("ADU-1' or 1=1"), { gagal: PESAN_PENGADUAN.tidakDitemukan });
  assert.equal(dipanggil, false);
});

test('t_f5_3_03 error jaringan menampilkan pesan gagal memuat dari kamus', async () => {
  const rusak: PenyimpananPengaduan = { detail: async () => { throw new Error('fetch failed'); } };
  assert.deepEqual(await new PengaduanController(rusak).detailPengaduan('ESK-20261030-0001'), { gagal: PESAN_PENGADUAN.gagalDimuat });
});

test('t_f5_3_03 NFR-13 nomor dan nama yang tidak tersamar tidak ditampilkan', async () => {
  const data = contohPemantauan(SEKARANG);
  data.percakapan[2].noTelp = '081345674521';
  data.percakapan[2].namaPelapor = 'Siti Aminah';
  const d = await new PengaduanController(new PenyimpananPemantauanTiruan(data)).detailPengaduan('ADU-20261030-0001');
  assert.ok(!('gagal' in d));
  assert.equal(d.noTelp, '—');
  assert.equal(d.namaPelapor, '—');
});

test('t_f5_3_03 adapter Supabase membaca tiket beserta percakapan dan penelepon tersamar', async () => {
  const path: string[] = [];
  const fetchPalsu = (async (u: string) => {
    const url = new URL(u);
    path.push(url.pathname);
    if (url.pathname.endsWith('/tiket')) {
      assert.equal(url.searchParams.get('no_tiket'), 'eq.ESK-20261030-0001');
      return Response.json([{ no_tiket: 'ESK-20261030-0001', jenis: 'eskalasi', status: 'sedang_ditelaah', ringkasan: 'Obat batuk', tgl_terbit: '2026-10-30T01:30:00Z', percakapan_id: 'c1', percakapan: { waktu_mulai: '2026-10-30T01:25:00Z', jenis_interaksi: 'informasi_produk', topik: 'Obat', penelepon_id: 'pn1' } }]);
    }
    return Response.json([{ id: 'pn1', nama_pelapor: null, no_telp: '0821****0098' }]);
  }) as unknown as typeof fetch;
  const c = new PengaduanController(new PenyimpananPemantauanSupabase({ url: 'http://sb', kunciPublik: 'anon', tokenAkses: 'tok', fetch: fetchPalsu }));
  const d = await c.detailPengaduan('ESK-20261030-0001');
  assert.ok(!('gagal' in d));
  assert.equal(d.labelStatus, 'Sedang Ditelaah');
  assert.equal(d.noTelp, '0821****0098');
  assert.deepEqual(path, ['/rest/v1/tiket', '/rest/v1/penelepon_tersamar']);
});
