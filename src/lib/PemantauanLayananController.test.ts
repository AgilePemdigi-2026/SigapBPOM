import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PESAN_PEMANTAUAN,
  PemantauanLayananController,
  PenyimpananPemantauanMock,
  ringkasPanggilan,
  type DataRingkasanLayanan,
  type PemeriksaKesehatanAgent,
} from './PemantauanLayananController.ts';
import { PemeriksaKesehatanTiruan, PenyimpananPemantauanTiruan, contohPemantauan, type DataPemantauan } from './mock/pemantauanTiruan.ts';
import { PemeriksaKesehatanGateway } from './kesehatanAgentGateway.ts';
import { PenyimpananPemantauanSupabase } from './penyimpananPemantauanSupabase.ts';

test('req_4_1 ringkasan layanan mengembalikan statistik default dalam state awal', async () => {
  const mockStorage = new PenyimpananPemantauanMock();
  const controller = new PemantauanLayananController(mockStorage);

  const ringkasan = await controller.ambilRingkasan();
  assert.equal(ringkasan.statistik.panggilanHariIni, 0);
  assert.equal(ringkasan.statistik.jawabanOtomatisAi, 0);
  assert.equal(ringkasan.statistik.tiketEskalasiBaru, 0);
  assert.equal(ringkasan.statistik.pengaduanSelesai, 0);
  assert.equal(ringkasan.statistik.panggilanBerjalan, 0);
  assert.deepEqual(ringkasan.kategori, []);
  assert.deepEqual(ringkasan.kasusPerluTindakLanjut, []);
});

test('req_4_1 ringkasan layanan mengembalikan 5 metrik statistik sesuai data penyimpanan', async () => {
  const dummy: DataRingkasanLayanan = {
    statistik: {
      panggilanHariIni: 42,
      jawabanOtomatisAi: 35,
      tiketEskalasiBaru: 5,
      pengaduanSelesai: 8,
      panggilanBerjalan: 2,
    },
    kategori: [
      { kategori: 'Obat', jumlah: 20, persentase: 50.0 },
      { kategori: 'Makanan', jumlah: 12, persentase: 30.0 },
      { kategori: 'Kosmetik', jumlah: 8, persentase: 20.0 },
    ],
    kasusPerluTindakLanjut: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        noTiket: 'ESK-20261102-0001',
        jenis: 'eskalasi',
        ringkasan: 'Pertanyaan interaksi obat',
        status: 'belum_ditelaah',
        tglTerbit: '2026-11-02T10:00:00Z',
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        noTiket: 'ADU-20261102-0001',
        jenis: 'pengaduan',
        ringkasan: 'Reaksi alergi kosmetik',
        status: 'belum_ditelaah',
        tglTerbit: '2026-11-02T11:30:00Z',
      },
    ],
  };

  const mockStorage = new PenyimpananPemantauanMock({ ringkasan: dummy });
  const controller = new PemantauanLayananController(mockStorage);

  const ringkasan = await controller.ambilRingkasan();
  assert.equal(ringkasan.statistik.panggilanHariIni, 42);
  assert.equal(ringkasan.statistik.jawabanOtomatisAi, 35);
  assert.equal(ringkasan.statistik.tiketEskalasiBaru, 5);
  assert.equal(ringkasan.statistik.pengaduanSelesai, 8);
  assert.equal(ringkasan.statistik.panggilanBerjalan, 2);

  // Verifikasi kategori
  assert.equal(ringkasan.kategori.length, 3);
  assert.equal(ringkasan.kategori[0].kategori, 'Obat');
  assert.equal(ringkasan.kategori[0].persentase, 50.0);

  // Verifikasi kasus perlu tindak lanjut
  assert.equal(ringkasan.kasusPerluTindakLanjut.length, 2);
  assert.equal(ringkasan.kasusPerluTindakLanjut[0].noTiket, 'ESK-20261102-0001');
  assert.equal(ringkasan.kasusPerluTindakLanjut[0].status, 'belum_ditelaah');

  // Verifikasi method ambilStatistik
  const stat = await controller.ambilStatistik();
  assert.equal(stat.panggilanHariIni, 42);
  assert.equal(stat.jawabanOtomatisAi, 35);
});

test('req_4_2 ambilPanggilanAktif mengembalikan daftar panggilan atau array kosong', async () => {
  const mockStorage = new PenyimpananPemantauanMock({
    panggilanAktif: [
      {
        id: 'call-1',
        noTelp: '0812****7890',
        jenisLayanan: 'informasi_produk',
        topik: 'Obat',
        waktuMulai: '2026-11-02T13:00:00Z',
        durasiDetik: 45,
        tahapAi: 'cek_registrasi',
      },
    ],
  });
  const controller = new PemantauanLayananController(mockStorage);

  const panggilan = await controller.ambilPanggilanAktif();
  assert.equal(panggilan.length, 1);
  assert.equal(panggilan[0].id, 'call-1');
  assert.equal(panggilan[0].durasiDetik, 45);
});

test('req_4_3 ambilAntreanTiket mengembalikan daftar antrean tiket beserta data pribadi tersamar', async () => {
  const mockStorage = new PenyimpananPemantauanMock({
    antreanTiket: [
      {
        id: 'tiket-1',
        noTiket: 'ADU-20261102-0001',
        jenis: 'pengaduan',
        ringkasan: 'Iritasi kulit',
        status: 'belum_ditelaah',
        waktuMasuk: '2026-11-02T13:10:00Z',
        noTelpTersamar: '0812****7890',
        namaPelaporTersamar: 'B***',
      },
    ],
  });
  const controller = new PemantauanLayananController(mockStorage);

  const antrean = await controller.ambilAntreanTiket();
  assert.equal(antrean.length, 1);
  assert.equal(antrean[0].noTiket, 'ADU-20261102-0001');
  assert.equal(antrean[0].noTelpTersamar, '0812****7890');
  assert.equal(antrean[0].namaPelaporTersamar, 'B***');
});

test('req_4_4 bukaKasus mengembalikan detail kasus pengaduan dengan data pribadi tersamar', async () => {
  const mockStorage = new PenyimpananPemantauanMock({
    detailKasus: [
      {
        tiketId: 'tiket-1',
        noTiket: 'ADU-20261102-0088',
        jenis: 'pengaduan',
        status: 'belum_ditelaah',
        ringkasan: 'Krim pemutih menyebabkan iritasi',
        tglTerbit: '2026-11-02T10:00:00Z',
        percakapanId: 'percakapan-1',
        pengaduanId: 'pengaduan-1',
        namaProduk: 'Krim Wajah Glowing',
        kronologi: 'Kulit merah dan bengkak setelah pemakaian',
        kelengkapan: true,
        tglPengaduan: '2026-11-02T10:00:00Z',
        namaPelaporTersamar: 'B***',
        noTelpTersamar: '0812****7890',
      },
    ],
  });
  const controller = new PemantauanLayananController(mockStorage);

  const detail = await controller.bukaKasus('ADU-20261102-0088');
  assert.ok(detail);
  assert.equal(detail.noTiket, 'ADU-20261102-0088');
  assert.equal(detail.namaProduk, 'Krim Wajah Glowing');
  assert.equal(detail.noTelpTersamar, '0812****7890');

  const tidakAda = await controller.bukaKasus('ADU-99999999-9999');
  assert.equal(tidakAda, null);
});

// --- Halaman UC-04 di atas control (T-F5.1-02, T-F5.2-01, T-F5.3-03, T-F5.4-01) ---

// 30 Okt 2026 10.00 WIB.
const SEKARANG = new Date('2026-10-30T03:00:00Z');

const pantau = (data: DataPemantauan = contohPemantauan(SEKARANG), kesehatan: PemeriksaKesehatanAgent = new PemeriksaKesehatanTiruan()) =>
  new PemantauanLayananController(new PenyimpananPemantauanTiruan(data, () => SEKARANG), kesehatan);

const supabasePalsu = (tanggapi: (url: URL, init: RequestInit) => Response) => {
  const dipanggil: { url: URL; init: RequestInit }[] = [];
  const fetchPalsu = (async (u: string, init: RequestInit) => {
    const url = new URL(u);
    dipanggil.push({ url, init });
    return tanggapi(url, init);
  }) as unknown as typeof fetch;
  return { dipanggil, penyimpanan: new PenyimpananPemantauanSupabase({ url: 'http://sb/', kunciPublik: 'anon', tokenAkses: 'tok', fetch: fetchPalsu }) };
};

test('t_f5_1_02 REQ-4.1 adapter tiruan mengembalikan statistik sesuai data dummy', async () => {
  const r = await pantau().ringkasanLayanan(SEKARANG);
  assert.deepEqual(r.statistik, { panggilanHariIni: 5, jawabanOtomatisAi: 1, tiketEskalasiBaru: 1, pengaduanSelesai: 1, panggilanBerjalan: 2 });
  assert.equal(r.tiketBelumDitelaah, 2);
  // p-6 (30 jam lalu) dan p-7 (3 hari lalu) masih dalam tujuh hari terakhir; p-2 belum punya topik.
  assert.deepEqual(r.kategori, [
    { label: 'Kosmetik', jumlah: 3, persen: 50 },
    { label: 'Obat', jumlah: 1, persen: 17 },
    { label: 'Pangan Olahan', jumlah: 1, persen: 17 },
    { label: 'Suplemen Kesehatan', jumlah: 1, persen: 17 },
  ]);
});

test('t_f5_1_02 REQ-4.1 kasus perlu tindak lanjut hanya tiket belum ditelaah, terbaru lebih dulu', async () => {
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

test('t_f5_1_02 adapter Supabase membaca ringkasan lewat RPC dengan token sesi petugas', async () => {
  const { dipanggil, penyimpanan } = supabasePalsu(() =>
    Response.json({
      statistik: { panggilan_hari_ini: 7, jawaban_otomatis_ai: 4, tiket_eskalasi_baru: 2, pengaduan_selesai: 1, panggilan_berjalan: 3 },
      kategori: [{ kategori: 'Obat', jumlah: 2, persentase: 66.67 }, { kategori: 'Kosmetik', jumlah: 1, persentase: 33.33 }],
      kasus_perlu_tindak_lanjut: [{ id: 't1', no_tiket: 'ESK-20261030-0001', jenis: 'eskalasi', ringkasan: null, status: 'belum_ditelaah', tgl_terbit: '2026-10-30T02:00:00Z', percakapan_id: 'c1' }],
    }),
  );
  const r = await new PemantauanLayananController(penyimpanan).ringkasanLayanan(SEKARANG);
  assert.deepEqual(r.statistik, { panggilanHariIni: 7, jawabanOtomatisAi: 4, tiketEskalasiBaru: 2, pengaduanSelesai: 1, panggilanBerjalan: 3 });
  assert.deepEqual(r.kategori.map((k) => k.persen), [67, 33]);
  assert.deepEqual(r.kasus.map((k) => [k.noTiket, k.ringkasan, k.menunggu]), [['ESK-20261030-0001', '', '1 jam']]);
  assert.equal(dipanggil.length, 1);
  assert.equal(dipanggil[0].url.pathname, '/rest/v1/rpc/ambil_ringkasan_layanan');
  assert.equal(dipanggil[0].init.method, 'POST');
  assert.equal((dipanggil[0].init.headers as Record<string, string>).Authorization, 'Bearer tok');
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

test('t_f5_2_01 adapter Supabase membaca panggilan berjalan dengan nomor dari penelepon_tersamar', async () => {
  const { dipanggil, penyimpanan } = supabasePalsu((url) =>
    url.pathname.endsWith('/percakapan')
      ? Response.json([{ id: 'c1', penelepon_id: 'pn1', jenis_interaksi: 'informasi_produk', topik: 'Obat', waktu_mulai: '2026-10-30T02:59:00Z', tahap_ai: 'memproses' }])
      : Response.json([{ id: 'pn1', no_telp: '0821****0098' }]),
  );
  const [p] = await new PemantauanLayananController(penyimpanan).panggilanBerjalan();
  assert.deepEqual(p, { id: 'c1', noTelp: '0821****0098', jenis: 'Informasi Produk', topik: 'Obat', waktuMulai: '2026-10-30T02:59:00Z', tahap: 'Memproses' });
  assert.equal(dipanggil[0].url.searchParams.get('status_penyelesaian'), 'eq.berjalan');
  assert.deepEqual(dipanggil.map((d) => d.url.pathname), ['/rest/v1/percakapan', '/rest/v1/penelepon_tersamar']);
});

test('t_f5_3_03 REQ-4.4 detail tampil sesuai tiket dengan data pengaduan tersamar dan tautan transkrip', async () => {
  const d = await pantau().detailKasus('adu-20261030-0001 ');
  assert.ok(!('gagal' in d));
  assert.equal(d.noTiket, 'ADU-20261030-0001');
  assert.equal(d.jenis, 'Pengaduan');
  assert.equal(d.labelStatus, 'Belum Ditelaah');
  assert.equal(d.namaProduk, 'Keripik Singkong Pedas');
  assert.equal(d.kelengkapan, 'Lengkap');
  assert.equal(d.namaPelapor, 'S***');
  assert.equal(d.noTelp, '0813****4521');
  assert.equal(d.tautanTranskrip, '/riwayat-percakapan/detail?id=p-3');
  assert.match(d.tglTerbit, /WIB$/);
});

test('t_f5_3_03 tiket tidak ditemukan menampilkan pesan error kamus pesan', async () => {
  assert.deepEqual(await pantau().detailKasus('ADU-20261030-9999'), { gagal: 'Tiket tidak ditemukan.' });
  assert.deepEqual(await pantau().detailKasus(null), { gagal: PESAN_PEMANTAUAN.tiketTidakDitemukan });
  // Isian tidak sah tidak pernah diteruskan ke penyimpanan.
  let dipanggil = false;
  const penyimpanan = new PenyimpananPemantauanMock();
  penyimpanan.ambilDetailKasus = async () => ((dipanggil = true), null);
  assert.deepEqual(await new PemantauanLayananController(penyimpanan).detailKasus("ADU-1' or 1=1"), { gagal: PESAN_PEMANTAUAN.tiketTidakDitemukan });
  assert.equal(dipanggil, false);
});

test('t_f5_3_03 error jaringan menampilkan pesan gagal memuat dari kamus', async () => {
  const penyimpanan = new PenyimpananPemantauanMock();
  penyimpanan.ambilDetailKasus = async () => { throw new Error('fetch failed'); };
  assert.deepEqual(await new PemantauanLayananController(penyimpanan).detailKasus('ESK-20261030-0001'), { gagal: PESAN_PEMANTAUAN.detailGagalDimuat });
});

test('t_f5_3_03 NFR-13 nomor dan nama yang tidak tersamar tidak ditampilkan', async () => {
  const data = contohPemantauan(SEKARANG);
  data.percakapan[2].noTelp = '081345674521';
  data.percakapan[2].namaPelapor = 'Siti Aminah';
  const d = await pantau(data).detailKasus('ADU-20261030-0001');
  assert.ok(!('gagal' in d));
  assert.equal(d.noTelp, '—');
  assert.equal(d.namaPelapor, '—');
});

test('t_f5_3_03 adapter Supabase membaca detail lewat RPC; tiket tidak ada menjadi null', async () => {
  const { dipanggil, penyimpanan } = supabasePalsu((_, init) => {
    const { p_no_tiket } = JSON.parse(String(init.body));
    if (p_no_tiket !== 'ESK-20261030-0001') return Response.json({ code: 'P0002', message: 'Tiket tidak ditemukan' }, { status: 400 });
    return Response.json({
      tiket_id: 't1', no_tiket: 'ESK-20261030-0001', jenis_tiket: 'eskalasi', status_tiket: 'sedang_ditelaah', ringkasan: 'Obat batuk', tgl_terbit: '2026-10-30T01:30:00Z',
      percakapan_id: 'c1', pengaduan_id: null, nama_produk: null, nama_produk_diadukan: null, kronologi: null, kelengkapan: null, tgl_pengaduan: null,
      nama_pelapor_tersamar: null, no_telp_tersamar: '0821****0098',
    });
  });
  const c = new PemantauanLayananController(penyimpanan);
  const d = await c.detailKasus('ESK-20261030-0001');
  assert.ok(!('gagal' in d));
  assert.equal(d.labelStatus, 'Sedang Ditelaah');
  assert.equal(d.noTelp, '0821****0098');
  assert.equal(d.namaProduk, '—');
  assert.equal(dipanggil[0].url.pathname, '/rest/v1/rpc/ambil_detail_pengaduan_tiket');
  assert.deepEqual(await c.detailKasus('ESK-20261030-0002'), { gagal: PESAN_PEMANTAUAN.tiketTidakDitemukan });

  const rusak = supabasePalsu(() => new Response('bad gateway', { status: 502 }));
  assert.deepEqual(await new PemantauanLayananController(rusak.penyimpanan).detailKasus('ESK-20261030-0001'), { gagal: PESAN_PEMANTAUAN.detailGagalDimuat });
});

test('t_f5_3_02 REQ-4.3 antrean memuat kolom tabel, belum ditelaah di urutan teratas, dan tautan Buka Kasus', async () => {
  const penyimpanan = new PenyimpananPemantauanMock({
    antreanTiket: [
      { id: 't3', noTiket: 'ADU-20261030-0003', jenis: 'pengaduan', ringkasan: 'Krim iritasi', status: 'selesai', waktuMasuk: '2026-10-30T02:50:00Z', percakapanId: 'c3' },
      { id: 't1', noTiket: 'ESK-20261030-0001', jenis: 'eskalasi', ringkasan: '', status: 'belum_ditelaah', waktuMasuk: '2026-10-30T01:00:00Z' },
      { id: 't2', noTiket: 'ADU-20261030-0002', jenis: 'pengaduan', ringkasan: 'Keripik tanpa izin edar', status: 'belum_ditelaah', waktuMasuk: '2026-10-30T02:00:00Z', percakapanId: 'c2' },
    ],
  });
  const r = await new PemantauanLayananController(penyimpanan).antreanTiket();
  assert.ok('tiket' in r);
  assert.deepEqual(r.tiket.map((t) => [t.noTiket, t.labelStatus]), [
    ['ADU-20261030-0002', 'Belum Ditelaah'],
    ['ESK-20261030-0001', 'Belum Ditelaah'],
    ['ADU-20261030-0003', 'Selesai'],
  ]);
  const { waktuMasuk, ...kolom } = r.tiket[0];
  assert.match(waktuMasuk, /^30 Okt 2026,? 09:00 WIB$/);
  assert.deepEqual(kolom, {
    noTiket: 'ADU-20261030-0002',
    ringkasan: 'Keripik tanpa izin edar',
    jenis: 'Pengaduan',
    labelStatus: 'Belum Ditelaah',
    tautanKasus: '/pengaduan/detail?tiket=ADU-20261030-0002',
    tautanTranskrip: '/riwayat-percakapan/detail?id=c2',
  });
  assert.equal(r.tiket[1].jenis, 'Eskalasi AI');
  assert.equal(r.tiket[1].ringkasan, '—');
  assert.equal(r.tiket[1].tautanTranskrip, null);
  // Adapter tiruan untuk pengembangan lokal mengisi antrean dari tiket contoh.
  const tiruan = await pantau().antreanTiket();
  assert.ok('tiket' in tiruan);
  assert.deepEqual(tiruan.tiket.map((t) => t.noTiket), ['ADU-20261030-0001', 'ESK-20261030-0001', 'ADU-20261027-0003']);
});

test('t_f5_3_02 antrean kosong dan penyimpanan gagal dibedakan', async () => {
  assert.deepEqual(await new PemantauanLayananController(new PenyimpananPemantauanMock()).antreanTiket(), { tiket: [] });
  const rusak = supabasePalsu(() => new Response('bad gateway', { status: 502 }));
  assert.deepEqual(await new PemantauanLayananController(rusak.penyimpanan).antreanTiket(), { gagal: PESAN_PEMANTAUAN.detailGagalDimuat });
});

test('t_f5_3_02 adapter Supabase membaca antrean_tiket_petugas tanpa kolom data pribadi', async () => {
  const { dipanggil, penyimpanan } = supabasePalsu(() =>
    Response.json([
      { tiket_id: 't1', no_tiket: 'ESK-20261030-0001', jenis_tiket: 'eskalasi', ringkasan: null, status_tiket: 'sedang_ditelaah', waktu_masuk: '2026-10-30T01:30:00+00:00', percakapan_id: 'c1' },
    ]),
  );
  assert.deepEqual(await penyimpanan.ambilAntreanTiket(), [
    { id: 't1', noTiket: 'ESK-20261030-0001', jenis: 'eskalasi', ringkasan: '', status: 'sedang_ditelaah', waktuMasuk: '2026-10-30T01:30:00+00:00', percakapanId: 'c1' },
  ]);
  assert.equal(dipanggil[0].url.pathname, '/rest/v1/antrean_tiket_petugas');
  assert.equal(dipanggil[0].url.searchParams.get('select'), 'tiket_id,no_tiket,jenis_tiket,ringkasan,status_tiket,waktu_masuk,percakapan_id');
  assert.equal((dipanggil[0].init.headers as Record<string, string>).Authorization, 'Bearer tok');
});

test('t_f5_4_01 komponen down tampil sebagai gangguan', async () => {
  const r = await pantau().pantauAgent();
  assert.deepEqual(r.komponen.map((k) => [k.nama, k.status]), [
    ['Voice Gateway', 'Normal'],
    ['Hermes', 'Normal'],
    ['STT/TTS', 'Normal'],
    ['cekbpom', 'Gangguan'],
  ]);
});

test('t_f5_4_01 gateway tidak terjangkau membuat semua komponen gangguan', async () => {
  const mati: PemeriksaKesehatanAgent = { periksa: async () => { throw new Error('ECONNREFUSED'); } };
  const r = await pantau(undefined, mati).pantauAgent();
  assert.ok(r.komponen.length === 4 && r.komponen.every((k) => k.status === 'Gangguan'));
});

test('t_f5_4_01 log tool terbaru tampil berurutan tanpa argumen tool', async () => {
  const data = contohPemantauan(SEKARANG);
  data.logTool.reverse();
  const r = await pantau(data).pantauAgent();
  assert.deepEqual(r.log.map((l) => l.id), [4, 3, 2, 1]);
  assert.deepEqual(Object.keys(r.log[0]).sort(), ['durasiMs', 'hasil', 'id', 'namaTool', 'waktu']);
  assert.equal(r.log[3].hasil, 'Gagal');
  assert.equal(r.rataLatensiToolMs, Math.round((640 + 1820 + 410 + 5000) / 4));
});

test('t_f5_4_01 adapter Supabase membaca log_tool terbaru lebih dulu', async () => {
  const { dipanggil, penyimpanan } = supabasePalsu(() => Response.json([{ id: 9, nama_tool: 'cek_registrasi_bpom', durasi_ms: 700, berhasil: true, waktu: '2026-10-30T02:59:00Z' }]));
  const r = await new PemantauanLayananController(penyimpanan).pantauAgent();
  assert.deepEqual(r.log.map((l) => [l.id, l.namaTool, l.hasil]), [[9, 'cek_registrasi_bpom', 'Berhasil']]);
  assert.equal(dipanggil[0].url.pathname, '/rest/v1/log_tool');
  assert.equal(dipanggil[0].url.searchParams.get('select'), 'id,nama_tool,durasi_ms,berhasil,waktu');
});

test('t_f5_4_01 adapter gateway membaca /voice/kesehatan dan mengukur latensinya', async () => {
  const dipanggil: string[] = [];
  let t = 1000;
  const balasan = (siap: unknown) => (async (url: string) => {
    dipanggil.push(url);
    t += 25;
    return Response.json({ status: 'success', message: 'OK', data: { siap, korpus: 10, katalog: { status: 'ok' } } });
  }) as unknown as typeof fetch;
  const siap = await new PemeriksaKesehatanGateway({ url: 'http://gw:8787/', fetch: balasan(true), now: () => t }).periksa();
  assert.deepEqual(dipanggil, ['http://gw:8787/voice/kesehatan']);
  assert.deepEqual(siap, [
    { nama: 'Voice Gateway', sehat: true, latensiMs: 25 },
    { nama: 'Hermes', sehat: true, latensiMs: null },
    { nama: 'STT/TTS', sehat: true, latensiMs: null },
  ]);
  const belumSiap = await new PemeriksaKesehatanGateway({ url: 'http://gw:8787', fetch: balasan('ya'), now: () => t }).periksa();
  assert.deepEqual(belumSiap.map((k) => k.sehat), [true, false, false]);
});

test('t_f5_4_01 adapter gateway membaca kondisi cekbpom dari pencarian terakhir gateway', async () => {
  const dengan = (cekbpom: unknown) =>
    new PemeriksaKesehatanGateway({ url: 'http://gw', fetch: (async () => Response.json({ data: { siap: true, cekbpom } })) as unknown as typeof fetch });
  const cek = async (cekbpom: unknown) => (await dengan(cekbpom).periksa()).find((k) => k.nama === 'cekbpom');
  assert.deepEqual(await cek({ aktif: true, sehat: true, latensiMs: 640 }), { nama: 'cekbpom', sehat: true, latensiMs: 640 });
  assert.deepEqual(await cek({ aktif: true, sehat: false, latensiMs: 5000 }), { nama: 'cekbpom', sehat: false, latensiMs: 5000 });
  assert.deepEqual(await cek({ aktif: false }), { nama: 'cekbpom', sehat: false, latensiMs: null });
  assert.equal(await cek({ aktif: true }), undefined, 'belum ada pencarian: diserahkan ke log tool');
  assert.equal(await cek(undefined), undefined, 'gateway lama tanpa field cekbpom');
});

test('t_f5_4_01 adapter gateway melempar galat bila gateway menjawab error', async () => {
  const gagal = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(new PemeriksaKesehatanGateway({ url: 'http://gw:8787', fetch: gagal }).periksa());
});

test('t_f5_4_01 kondisi cekbpom diambil dari pemanggilan cek registrasi terakhir', async () => {
  const gateway: PemeriksaKesehatanAgent = { periksa: async () => [{ nama: 'Voice Gateway', sehat: true, latensiMs: 9 }] };
  const data = contohPemantauan(SEKARANG);
  const terbaru = data.logTool.filter((l) => l.namaTool === 'cek_registrasi_bpom').sort((a, b) => b.waktu.localeCompare(a.waktu))[0];
  const r = await pantau(data, gateway).pantauAgent();
  const cek = r.komponen.find((k) => k.nama === 'cekbpom');
  assert.deepEqual(cek, { nama: 'cekbpom', status: terbaru.berhasil ? 'Normal' : 'Gangguan', latensiMs: terbaru.durasiMs });
  const tanpaLog = await pantau({ ...data, logTool: [] }, gateway).pantauAgent();
  assert.equal(tanpaLog.komponen.find((k) => k.nama === 'cekbpom')?.status, 'Gangguan');
});
