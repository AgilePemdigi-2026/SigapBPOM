import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PESAN_PEMANTAUAN, PemantauanLayananController, awalHariWib, ringkasPanggilan } from './PemantauanLayananController.ts';
import { PemeriksaKesehatanTiruan, PenyimpananPemantauanTiruan, contohPemantauan, type DataPemantauan } from './mock/pemantauanTiruan.ts';
import { PemeriksaKesehatanGateway } from './kesehatanAgentGateway.ts';
import { PenyimpananPemantauanSupabase } from './penyimpananPemantauanSupabase.ts';

// 30 Okt 2026 10.00 WIB.
const SEKARANG = new Date('2026-10-30T03:00:00Z');

const pantau = (data: DataPemantauan = contohPemantauan(SEKARANG), kesehatan = new PemeriksaKesehatanTiruan()) =>
  new PemantauanLayananController(new PenyimpananPemantauanTiruan(data), kesehatan);

test('t_f5_1_02 awal hari dihitung di zona Asia/Jakarta', () => {
  assert.equal(awalHariWib(new Date('2026-10-29T18:30:00Z')), '2026-10-30T00:00:00+07:00');
  assert.equal(awalHariWib(new Date('2026-10-29T16:30:00Z')), '2026-10-29T00:00:00+07:00');
});

test('t_f5_1_02 REQ-4.1 adapter tiruan mengembalikan statistik sesuai data dummy', async () => {
  const r = await pantau().ringkasanLayanan(SEKARANG);
  assert.deepEqual(
    { ...r.statistik, kategori: undefined },
    { panggilanHariIni: 5, dijawabAi: 1, tiketEskalasiBaru: 1, tiketBelumDitelaah: 2, pengaduanSelesai: 1, panggilanBerjalan: 2, kategori: undefined },
  );
  // p-6 (30 jam lalu) dan p-7 (3 hari lalu) masih dalam tujuh hari terakhir; p-2 belum punya topik.
  assert.deepEqual(r.kategori, [
    { label: 'Kosmetik', persen: 50 },
    { label: 'Obat', persen: 17 },
    { label: 'Pangan Olahan', persen: 17 },
    { label: 'Suplemen Kesehatan', persen: 17 },
  ]);
});

test('t_f5_1_02 REQ-4.1 kasus perlu tindak lanjut hanya tiket belum ditelaah, terbaru lebih dulu, dengan tautan Buka Kasus', async () => {
  const r = await pantau().ringkasanLayanan(SEKARANG);
  assert.deepEqual(r.kasus.map((k) => [k.noTiket, k.jenis, k.menunggu]), [
    ['ADU-20261030-0001', 'Pengaduan', '38 menit'],
    ['ESK-20261030-0001', 'Eskalasi AI', '1 jam'],
  ]);
});

test('t_f5_1_02 tanpa data, ringkasan tetap jalan dengan angka nol', async () => {
  const r = await pantau({ percakapan: [], tiket: [], logTool: [] }).ringkasanLayanan(SEKARANG);
  assert.equal(r.statistik.panggilanHariIni, 0);
  assert.deepEqual(r.kategori, []);
  assert.deepEqual(r.kasus, []);
});

test('t_f5_2_01 REQ-4.2 daftar berubah saat panggilan mulai dan berakhir', async () => {
  const data: DataPemantauan = { percakapan: [], tiket: [], logTool: [] };
  const c = pantau(data);
  assert.deepEqual(await c.panggilanBerjalan(), []);

  data.percakapan.push({ id: 'a', noTelp: '0812****7890', namaPelapor: null, waktuMulai: '2026-10-30T02:58:00Z', jenisInteraksi: 'pengaduan', status: 'berjalan', tahapAi: 'menjawab', topik: 'Kosmetik' });
  assert.deepEqual(await c.panggilanBerjalan(), [
    { id: 'a', noTelp: '0812****7890', jenis: 'Pengaduan', topik: 'Kosmetik', waktuMulai: '2026-10-30T02:58:00Z', tahap: 'Menjawab' },
  ]);

  data.percakapan[0].status = 'tiket_terbit';
  assert.deepEqual(await c.panggilanBerjalan(), []);
});

test('t_f5_2_01 REQ-4.2 pesan kosong persis kamus pesan', () => {
  assert.equal(PESAN_PEMANTAUAN.tidakAdaPanggilan, 'Tidak ada panggilan berjalan saat ini.');
});

test('t_f5_2_01 NFR-13 nomor telepon utuh tidak pernah diteruskan ke halaman', async () => {
  const data = contohPemantauan(SEKARANG);
  data.percakapan[0].noTelp = '081234567890';
  const [p] = await pantau(data).panggilanBerjalan();
  assert.equal(p.noTelp, '—');
});

test('t_f5_2_01 kartu ringkasan panggilan: aktif, rata-rata, terlama, pemakaian saluran', () => {
  const p = (menit: number) => ({ id: String(menit), noTelp: '', jenis: '', topik: '', tahap: '', waktuMulai: new Date(SEKARANG.getTime() - menit * 60_000).toISOString() });
  assert.deepEqual(ringkasPanggilan([p(1), p(3)], SEKARANG, 10), { aktif: 2, rataDurasiDetik: 120, terlamaDetik: 180, pemakaianSaluranPersen: 20 });
  assert.deepEqual(ringkasPanggilan([], SEKARANG, 10), { aktif: 0, rataDurasiDetik: 0, terlamaDetik: 0, pemakaianSaluranPersen: 0 });
});

test('t_f5_1_02 adapter Supabase menghitung statistik lewat REST dengan token sesi petugas', async () => {
  const dipanggil: { url: URL; method: string; auth: string }[] = [];
  const fetchPalsu = (async (u: string, init: RequestInit) => {
    const url = new URL(u);
    dipanggil.push({ url, method: init.method ?? 'GET', auth: (init.headers as Record<string, string>).Authorization });
    if (init.method === 'HEAD') return new Response(null, { headers: { 'content-range': `*/${url.pathname.endsWith('tiket') ? 2 : 7}` } });
    return Response.json([{ topik: 'Obat' }, { topik: 'Obat' }, { topik: 'Kosmetik' }]);
  }) as unknown as typeof fetch;
  const s = await new PenyimpananPemantauanSupabase({ url: 'http://sb', kunciPublik: 'anon', tokenAkses: 'tok', fetch: fetchPalsu }).statistik(SEKARANG);
  assert.deepEqual(s, {
    panggilanHariIni: 7,
    dijawabAi: 7,
    tiketEskalasiBaru: 2,
    tiketBelumDitelaah: 2,
    pengaduanSelesai: 2,
    panggilanBerjalan: 7,
    kategori: [{ kategori: 'Obat', jumlah: 2 }, { kategori: 'Kosmetik', jumlah: 1 }],
  });
  assert.ok(dipanggil.every((d) => d.auth === 'Bearer tok'));
  assert.equal(dipanggil[0].url.searchParams.get('waktu_mulai'), 'gte.2026-10-30T00:00:00+07:00');
});
