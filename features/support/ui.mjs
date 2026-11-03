// Skenario @ui (ADR 0002): skenario SRS Lampiran F dijalankan lewat browser terhadap aplikasi yang sedang berjalan,
// seperti Behat dengan Mink. Browser hanya dibuka bila ada skenario @ui, jadi `npm run test:bdd` tidak membutuhkannya.
import { execFileSync } from 'node:child_process';
import { After, AfterAll, Before, setDefaultTimeout } from '@cucumber/cucumber';

setDefaultTimeout(30_000);

export const URL_DASAR = (process.env.SIGAP_UI_URL || 'http://localhost:4321').replace(/\/$/, '');
// Akun uji SRS Tabel B.4 dari supabase/seed.sql (hanya Supabase lokal).
export const AKUN_UJI = { email: 'petugas@halobpom.go.id', password: 'halobpom2026' };

/** Menjalankan SQL di Supabase lokal (`supabase db query --local`, satu pernyataan per panggilan) untuk data uji. */
export function sqlLokal(...pernyataan) {
  for (const q of pernyataan) execFileSync('supabase', ['db', 'query', '--local', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

let browser = null;

Before({ tags: '@ui' }, async function () {
  if (!browser) {
    const { chromium } = await import('playwright');
    // Bawaan memakai Google Chrome yang terpasang; PW_CHANNEL=chromium memakai Chromium dari `npx playwright install chromium`.
    const channel = process.env.PW_CHANNEL || 'chrome';
    browser = await chromium.launch({ channel: channel === 'chromium' ? undefined : channel, headless: process.env.PW_HEADED !== '1' });
  }
  // Konteks baru per skenario: cookie, sessionStorage, dan izin mikrofon tidak terbawa antarskenario. Mikrofon tidak
  // diizinkan, sehingga panel suara memakai kolom ketik untuk langkah "I say".
  this.konteks = await browser.newContext({ locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
  this.page = await this.konteks.newPage();
  // Konfirmasi seperti "Tandai ... tidak aktif?" disetujui, sama seperti petugas menekan OK.
  this.page.on('dialog', (d) => d.accept().catch(() => {}));
  // Penguncian login dari skenario sebelumnya tidak boleh terbawa.
  sqlLokal('update public.petugas set gagal_login = 0, terkunci_sampai = null');
});

// Skenario gagal meninggalkan tangkapan layar di test-results/bdd-ui untuk ditelusuri.
After({ tags: '@ui' }, async function ({ pickle, result }) {
  if (result?.status === 'FAILED' && this.page) {
    const nama = pickle.name.replace(/[^\w-]+/g, '-').slice(0, 80);
    await this.page.screenshot({ path: `test-results/bdd-ui/${nama}.png`, fullPage: true }).catch(() => {});
  }
  await this.konteks?.close();
});

// Materi yang dibuat atau dinonaktifkan skenario UC-07 dihapus lagi agar skenario bisa diulang.
After({ tags: '@uc-07' }, function () {
  const judul = "('Ketentuan Izin Edar Suplemen Kesehatan', 'Ketentuan Label Pangan Olahan 2018')";
  sqlLokal(
    `delete from public.materi_potongan where materi_id in (select id from public.materi_pengetahuan where judul in ${judul})`,
    `delete from public.materi_pengetahuan where judul in ${judul}`,
  );
});

AfterAll(async () => {
  await browser?.close();
});
