// Tes unit & alur untuk StepperPenanganan (T-F7.2-02, UC-06, SRS 3.1.10, REQ-6.1 - REQ-6.6, BR-2, BR-3).
// Menguji setiap jalur SRS: Basic Path, Alternative Path 1, Alternative Path 2, dan Exception Path 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  StepperPenangananFlow,
  KlienPenangananApiMock,
  formatTanggalIso,
  hitungStatusTahap,
  PESAN_TELAAH_TERSIMPAN,
  PESAN_BUKAN_KEWENANGAN,
  PESAN_JADWAL_TERSIMPAN,
  PESAN_TANGGAPAN_TERSIMPAN,
  PESAN_TUTUP_TIKET,
  PESAN_TUTUP_TANPA_TANGGAPAN,
  OPSI_TINDAK_LANJUT,
} from '../../lib/stepperPenanganan.ts';

const TIKET_UJI = 'ADU-20261110-0001';

test('uc_06 basic path: telaah dokumen -> susun tanggapan -> tutup tiket dengan pesan dan status benar', async () => {
  const mockApi = new KlienPenangananApiMock('belum_ditelaah', 'Belum Ditelaah');
  const flow = new StepperPenangananFlow(mockApi, TIKET_UJI, 'belum_ditelaah', 'Belum Ditelaah');

  // Tahap awal: Telaah aktif
  assert.equal(flow.state.status, 'belum_ditelaah');
  assert.equal(flow.state.labelStatus, 'Belum Ditelaah');
  assert.equal(flow.state.tahapAktif, 'Telaah');
  assert.equal(flow.state.statusTahap.Telaah, 'aktif');

  // 1. Simpan Telaah Dokumen (Langkah 5-7 SRS 4.6.2 Basic Path)
  const resTelaah = await flow.simpanTelaah('Telaah Dokumen', 'Label produk tidak mencantumkan nomor izin edar.');
  assert.equal(resTelaah.status, 'success');
  assert.equal(resTelaah.message, PESAN_TELAAH_TERSIMPAN);
  assert.equal(flow.state.pesanTerakhir, 'Hasil telaah tersimpan.');
  assert.equal(flow.state.status, 'sedang_ditelaah');
  assert.equal(flow.state.labelStatus, 'Sedang Ditelaah');
  // Stepper: Telaah selesai, Jadwal dilewati, Susun Tanggapan aktif
  assert.equal(flow.state.statusTahap.Telaah, 'selesai');
  assert.equal(flow.state.statusTahap['Jadwal Pemeriksaan'], 'dilewati');
  assert.equal(flow.state.statusTahap['Susun Tanggapan'], 'aktif');
  assert.equal(flow.state.tahapAktif, 'Susun Tanggapan');

  // 2. Simpan Tanggapan Resmi (Langkah 10-11 SRS 4.6.2 Basic Path)
  const resTanggapan = await flow.simpanTanggapan('Produk telah ditelaah dan pelaku usaha diberi peringatan tertulis.');
  assert.equal(resTanggapan.status, 'success');
  assert.equal(resTanggapan.message, PESAN_TANGGAPAN_TERSIMPAN);
  assert.equal(flow.state.pesanTerakhir, 'Tanggapan tersimpan.');
  assert.equal(flow.state.status, 'tanggapan_disusun');
  assert.equal(flow.state.labelStatus, 'Tanggapan Disusun');
  assert.equal(flow.state.statusTahap['Susun Tanggapan'], 'selesai');
  assert.equal(flow.state.statusTahap.Selesai, 'aktif');

  // 3. Tutup Tiket (Langkah 14-17 SRS 4.6.2 Basic Path)
  const resTutup = await flow.tutupTiket();
  assert.equal(resTutup.status, 'success');
  assert.equal(resTutup.message, PESAN_TUTUP_TIKET);
  assert.equal(flow.state.pesanTerakhir, 'Tiket ditutup.');
  assert.equal(flow.state.status, 'selesai');
  assert.equal(flow.state.labelStatus, 'Selesai');
  assert.equal(flow.state.statusTahap.Selesai, 'selesai');
  assert.equal(flow.state.tahapAktif, 'Selesai');
});

test('uc_06 alternative path 1: telaah bukan kewenangan bpom meneruskan pengaduan dan menghentikan penanganan (BR-3)', async () => {
  const mockApi = new KlienPenangananApiMock('belum_ditelaah', 'Belum Ditelaah');
  const flow = new StepperPenangananFlow(mockApi, TIKET_UJI, 'belum_ditelaah', 'Belum Ditelaah');

  // Langkah 5-7 SRS 4.6.2 Alternative Path 1
  const resTelaah = await flow.simpanTelaah('Bukan Kewenangan BPOM', 'Produk berupa alat elektronik, bukan kewenangan BPOM.');
  assert.equal(resTelaah.status, 'success');
  assert.equal(resTelaah.message, PESAN_BUKAN_KEWENANGAN);
  assert.equal(flow.state.pesanTerakhir, 'Pengaduan diteruskan ke instansi lain.');
  assert.equal(flow.state.status, 'diteruskan');
  assert.equal(flow.state.labelStatus, 'Diteruskan ke Instansi Lain');

  // Sesuai BR-3, tahap selanjutnya dilewati karena pengaduan sudah diteruskan
  assert.equal(flow.state.statusTahap.Telaah, 'selesai');
  assert.equal(flow.state.statusTahap['Jadwal Pemeriksaan'], 'dilewati');
  assert.equal(flow.state.statusTahap['Susun Tanggapan'], 'dilewati');
  assert.equal(flow.state.statusTahap.Selesai, 'dilewati');
});

test('uc_06 alternative path 2: telaah perlu pemeriksaan lapangan menampilkan jadwal lalu menunggu pemeriksaan', async () => {
  const mockApi = new KlienPenangananApiMock('belum_ditelaah', 'Belum Ditelaah');
  const flow = new StepperPenangananFlow(mockApi, TIKET_UJI, 'belum_ditelaah', 'Belum Ditelaah');

  // Langkah 5-7 SRS 4.6.2 Alternative Path 2
  const resTelaah = await flow.simpanTelaah('Perlu Pemeriksaan Lapangan', 'Perlu pemeriksaan sarana produksi.');
  assert.equal(resTelaah.status, 'success');
  assert.equal(resTelaah.message, PESAN_TELAAH_TERSIMPAN);
  assert.equal(flow.state.pesanTerakhir, 'Hasil telaah tersimpan.');
  assert.equal(flow.state.jadwalDibutuhkan, true);
  assert.equal(flow.state.statusTahap['Jadwal Pemeriksaan'], 'aktif');
  assert.equal(flow.state.tahapAktif, 'Jadwal Pemeriksaan');

  // Langkah 9-11 SRS 4.6.2 Alternative Path 2
  const resJadwal = await flow.simpanJadwal('15-10-2026', 'Balai Besar POM di Surabaya');
  assert.equal(resJadwal.status, 'success');
  assert.equal(resJadwal.message, PESAN_JADWAL_TERSIMPAN);
  assert.equal(flow.state.pesanTerakhir, 'Jadwal pemeriksaan tersimpan.');
  assert.equal(flow.state.status, 'menunggu_pemeriksaan');
  assert.equal(flow.state.labelStatus, 'Menunggu Pemeriksaan');
  assert.equal(flow.state.statusTahap['Jadwal Pemeriksaan'], 'selesai');
  assert.equal(flow.state.statusTahap['Susun Tanggapan'], 'aktif');
  assert.equal(flow.state.tahapAktif, 'Susun Tanggapan');
});

test('uc_06 exception path 1: tutup tiket tanpa tanggapan ditolak dengan pesan kamus dan status tidak berubah (BR-2)', async () => {
  const mockApi = new KlienPenangananApiMock('sedang_ditelaah', 'Sedang Ditelaah');
  mockApi.punyaTanggapan = false;
  const flow = new StepperPenangananFlow(mockApi, TIKET_UJI, 'sedang_ditelaah', 'Sedang Ditelaah');

  assert.equal(flow.state.status, 'sedang_ditelaah');
  assert.equal(flow.state.labelStatus, 'Sedang Ditelaah');

  // Langkah 10-11 SRS 4.6.2 Exception Path 1: tekan Tutup Tiket sebelum mengisi tanggapan
  const resTutup = await flow.tutupTiket();
  assert.equal(resTutup.status, 'error');
  assert.equal(resTutup.message, PESAN_TUTUP_TANPA_TANGGAPAN);
  assert.equal(flow.state.pesanTerakhir, 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.');

  // Status tiket TIDAK berubah (tidak menjadi 'selesai')
  assert.equal(flow.state.status, 'sedang_ditelaah');
  assert.equal(flow.state.labelStatus, 'Sedang Ditelaah');
  assert.notEqual(flow.state.status, 'selesai');
});

test('formatTanggalIso mengonversi format DD-MM-YYYY dan DD/MM/YYYY menjadi YYYY-MM-DD', () => {
  assert.equal(formatTanggalIso('15-10-2026'), '2026-10-15');
  assert.equal(formatTanggalIso('15/10/2026'), '2026-10-15');
  assert.equal(formatTanggalIso('2026-10-15'), '2026-10-15');
});

test('komponen StepperPenanganan memuat elemen bernama dan teks kamus pesan yang tepat', () => {
  const komponen = readFileSync(new URL('../../components/StepperPenanganan.astro', import.meta.url), 'utf8');

  // Identitas elemen bernama untuk acceptance test
  assert.match(komponen, /data-name="StepperPenanganan"/);
  assert.match(komponen, /data-name="FormulirJadwalPemeriksaan"/);

  // Label tombol dan field Lampiran B
  assert.match(komponen, /Tindak Lanjut/);
  assert.match(komponen, /Catatan Tindak Lanjut/);
  assert.match(komponen, /Tanggal Pemeriksaan/);
  assert.match(komponen, /Unit Pelaksana/);
  assert.match(komponen, /Tanggapan/);
  assert.match(komponen, /Simpan Telaah/);
  assert.match(komponen, /Simpan Jadwal/);
  assert.match(komponen, /Simpan Tanggapan/);
  assert.match(komponen, /Tutup Tiket/);

  // Opsi tindak lanjut
  for (const opsi of OPSI_TINDAK_LANJUT) {
    assert.match(komponen, new RegExp(opsi));
  }

  // Unit pelaksana contoh di SRS
  assert.match(komponen, /Balai Besar POM di Surabaya/);
});

test('halaman Detail Pengaduan memuat StepperPenanganan dan StatusPengaduan', () => {
  const halaman = readFileSync(new URL('./detail.astro', import.meta.url), 'utf8');
  assert.match(halaman, /<StepperPenanganan/);
  assert.match(halaman, /data-name="StatusPengaduan"/);
});

test('skrip klien StepperPenanganan mengimpor semua simbol runtime yang dipakainya', () => {
  const komponen = readFileSync(new URL('../../components/StepperPenanganan.astro', import.meta.url), 'utf8');
  const scriptMatch = komponen.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Blok <script> klien harus ada');
  const skrip = scriptMatch[1];

  const importMatch = skrip.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\.\/lib\/stepperPenanganan['"]/);
  assert.ok(importMatch, 'Skrip klien harus mengimpor dari ../lib/stepperPenanganan');
  const impor = importMatch[1];

  for (const simbol of ['DAFTAR_TAHAP', 'formatTanggalIso', 'hitungStatusTahap', 'tentukanTahapAktif']) {
    if (skrip.includes(simbol)) {
      assert.match(impor, new RegExp(`\\b${simbol}\\b`), `Simbol ${simbol} dipakai di skrip klien tetapi belum diimpor`);
    }
  }
});
