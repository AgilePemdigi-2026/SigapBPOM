// Waktu muat halaman dashboard (NFR-3, ADR 0005): loadEventEnd tiap halaman sesudah login petugas, jaringan 10 Mbps, cache mati.
//   SIGAP_EMAIL=<email petugas> SIGAP_PASSWORD=<password> node scripts/ukur-muat-dashboard.ts
// SIGAP_UI_URL (bawaan http://localhost:4321), ULANG (bawaan 5), PW_CHANNEL seperti features/support/ui.mjs.
import { chromium } from 'playwright';
import { NAV } from '../src/lib/data.ts';

/** NFR-3: setiap halaman dashboard termuat paling lambat 3 detik pada koneksi 10 Mbps. */
const BATAS_NFR_3_MS = 3000;
const MBPS_NFR_3 = 10;

const URL_DASAR = (process.env.SIGAP_UI_URL || 'http://localhost:4321').replace(/\/$/, '');
const { SIGAP_EMAIL: email, SIGAP_PASSWORD: password } = process.env;
if (!email || !password) {
  console.error('Isi SIGAP_EMAIL dan SIGAP_PASSWORD dengan akun petugas.');
  process.exit(1);
}
const ULANG = Number(process.env.ULANG || 5);
const HALAMAN = [...NAV.map((n) => n.href), '/pantau-ai-agent'];

const channel = process.env.PW_CHANNEL || 'chrome';
const browser = await chromium.launch({ channel: channel === 'chromium' ? undefined : channel });
try {
  const page = await browser.newPage();
  // Login lewat formulir seperti petugas, supaya cookie sesi diatur browser sendiri (Secure di build produksi).
  await page.goto(`${URL_DASAR}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();
  await page.waitForURL((u) => u.pathname === '/ringkasan');

  const cdp = await page.context().newCDPSession(page);
  const bytePerDetik = (MBPS_NFR_3 * 1e6) / 8;
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: bytePerDetik, uploadThroughput: bytePerDetik });

  const hasil = [];
  for (const path of HALAMAN) {
    const ms: number[] = [];
    for (let i = 0; i < ULANG; i++) {
      await page.goto(`${URL_DASAR}${path}`, { waitUntil: 'load' });
      if (new URL(page.url()).pathname === '/login') throw new Error(`${path} dialihkan ke /login: sesi petugas tidak aktif`);
      await page.waitForFunction(() => ((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.loadEventEnd ?? 0) > 0);
      ms.push(await page.evaluate(() => Math.round((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).loadEventEnd)));
    }
    ms.sort((a, b) => a - b);
    hasil.push({ halaman: path, median: ms[Math.floor(ms.length / 2)], maks: ms.at(-1), lulus: (ms.at(-1) ?? Infinity) <= BATAS_NFR_3_MS });
  }
  console.info(JSON.stringify({ url: URL_DASAR, mbps: MBPS_NFR_3, ulang: ULANG, batas_ms: BATAS_NFR_3_MS, hasil }, null, 2));
  if (hasil.some((h) => !h.lulus)) process.exitCode = 1;
} finally {
  await browser.close();
}
