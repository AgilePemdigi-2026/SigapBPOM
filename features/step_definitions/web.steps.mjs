// Langkah web gaya Behat/Mink untuk skenario SRS Lampiran F (@ui). Kalimatnya dipakai apa adanya dari SRS.
// Panel suara tidak bisa didengar atau diajak bicara oleh browser uji, jadi:
// - "I should hear ..." memeriksa kalimat agen di transkrip panel, karena setiap kalimat yang diucapkan juga ditampilkan;
// - "I say ..." mengetik ucapan di kolom ketik panel, yang diproses gateway dengan alur yang sama seperti ucapan suara;
// - nomor tiket contoh di SRS (mis. ADU-0456) dicocokkan dengan nomor tiket yang benar-benar terbit (ADU-YYYYMMDD-NNNN).
import { randomUUID } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import { AKUN_UJI, URL_DASAR, sqlLokal } from '../support/ui.mjs';

const TUNGGU_MS = 15_000;
const regexTeks = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const elemen = (page, nama) => page.locator(`[data-name="${nama}"]`).filter({ visible: true }).first();

async function tunggu(locator, keterangan) {
  try {
    await locator.waitFor({ state: 'visible', timeout: TUNGGU_MS });
  } catch {
    throw new Error(`Tidak terlihat dalam ${TUNGGU_MS / 1000} detik: ${keterangan}`);
  }
}

// Tombol dicari menurut nama persis, lalu tautan, lalu tombol yang namanya diawali teks itu (mis. "2: Pengaduan Produk").
// Karakter non-huruf di awal nama diabaikan: ikon font ikut masuk nama aksesibel lewat CSS ::before, dan teks beberapa
// span tergabung tanpa spasi (mis. "Telepon CS AILayanan suara"). Bila ada dialog terbuka (panel suara, formulir materi),
// tombol dicari di dalamnya lebih dulu, karena halaman di belakangnya masih terlihat.
async function tekan(page, nama, dalam = null) {
  const awalan = new RegExp(`^[^\\p{L}\\p{N}]*${regexTeks(nama)}`, 'u');
  const kandidat = (l) => [
    l.getByRole('button', { name: nama, exact: true }),
    l.getByRole('link', { name: nama, exact: true }),
    l.getByRole('button', { name: awalan }),
    l.getByRole('link', { name: awalan }),
  ].map((x) => x.filter({ visible: true }));
  const batas = Date.now() + TUNGGU_MS;
  while (Date.now() < batas) {
    const dialog = page.locator('dialog[open], [role="dialog"][aria-modal="true"]').filter({ visible: true });
    const lingkup = dalam ? [dalam] : (await dialog.count()) ? [dialog.last(), page] : [page];
    for (const l of lingkup) for (const x of kandidat(l)) if (await x.count()) return x.first().click();
    await page.waitForTimeout(200);
  }
  throw new Error(`Tombol atau tautan "${nama}" tidak ditemukan`);
}

// Kolom dicari di dialog yang terbuka lebih dulu, dengan label persis sebelum label yang memuat teks itu; tanpa ini
// "Rujukan Sumber" juga cocok dengan kotak pencarian "Cari judul materi atau rujukan sumber" di belakang dialog.
async function isi(page, label, nilai) {
  const dialog = page.locator('dialog[open], [role="dialog"][aria-modal="true"]').filter({ visible: true });
  const lingkup = (await dialog.count()) ? [dialog.last(), page] : [page];
  for (const l of lingkup) {
    for (const exact of [true, false]) {
      const kolom = l.getByLabel(label, { exact }).and(page.locator('input, textarea, select')).filter({ visible: true });
      if (await kolom.count()) return kolom.first().fill(nilai);
    }
  }
  throw new Error(`Kolom "${label}" tidak ditemukan`);
}

async function masuk(page, email, password) {
  await page.goto(`${URL_DASAR}/login`);
  await isi(page, 'Email', email);
  await isi(page, 'Password', password);
  await tekan(page, 'Login');
}

Given('I am on the {string} page', async function (path) {
  await this.page.goto(`${URL_DASAR}${path}`);
});

When('I go to {string}', async function (path) {
  await this.page.goto(`${URL_DASAR}${path}`);
});

Given('I am logged in as a HaloBPOM officer', async function () {
  await masuk(this.page, AKUN_UJI.email, AKUN_UJI.password);
  await this.page.waitForURL((u) => u.pathname === '/ringkasan', { timeout: TUNGGU_MS });
});

Given('I have failed to log in two times in a row', async function () {
  for (let i = 0; i < 2; i++) {
    await isi(this.page, 'Email', AKUN_UJI.email);
    await isi(this.page, 'Password', 'salahpassword');
    await tekan(this.page, 'Login');
    await tunggu(this.page.getByText(`Percobaan gagal ${i + 1} dari 3`), `percobaan gagal ke-${i + 1}`);
  }
});

When('I fill in {string} with {string}', async function (label, nilai) {
  await isi(this.page, label, nilai);
});

When('I press {string}', async function (nama) {
  await tekan(this.page, nama);
});

When('I follow {string}', async function (nama) {
  const tautan = this.page.getByRole('link', { name: nama, exact: true }).filter({ visible: true }).first();
  await tunggu(tautan, `tautan "${nama}"`);
  await tautan.click();
});

When('I press {string} on the material {string}', async function (tombol, judul) {
  const baris = this.page.locator('tr, li, .row').filter({ hasText: judul }).filter({ visible: true }).first();
  await tunggu(baris, `materi "${judul}"`);
  await tekan(this.page, tombol, baris);
});

When('I press {string} on the graph', async function (simpul) {
  const graf = elemen(this.page, 'GrafPengetahuan');
  await tunggu(graf, 'GrafPengetahuan');
  await graf.getByText(simpul, { exact: true }).first().click();
});

When('I say {string}', async function (ucapan) {
  const kolom = elemen(this.page, 'PanelPercakapanSuara').locator('[data-input]');
  await kolom.fill(ucapan);
  await kolom.press('Enter');
});

Then('I should be on {string}', async function (path) {
  await this.page.waitForURL((u) => u.pathname === path, { timeout: TUNGGU_MS });
});

Then('I should see the message {string}', async function (pesan) {
  await tunggu(this.page.getByText(pesan).filter({ visible: true }).first(), `pesan "${pesan}"`);
});

Then('I should see the {string} element', async function (nama) {
  await tunggu(elemen(this.page, nama), `elemen ${nama}`);
});

Then('I should see {string} in the {string} element', async function (teks, nama) {
  const el = this.page.locator(`[data-name="${nama}"]`).filter({ visible: true }).filter({ hasText: teks }).first();
  await tunggu(el, `"${teks}" di elemen ${nama}`);
});

Then('I should hear {string}', async function (kalimat) {
  const pola = new RegExp(regexTeks(kalimat).replace(/ADU-\d+/g, 'ADU-[0-9-]+'));
  const transkrip = this.page.locator('[data-name="TranskripPercakapan"]').filter({ visible: true }).filter({ hasText: pola }).first();
  await tunggu(transkrip, `kalimat agen "${kalimat}" di TranskripPercakapan`);
});

// Data awal di Supabase lokal, lewat RPC yang sama dengan Voice Gateway.
Given('there is an active call', function () {
  sqlLokal(`select public.laporkan_panggilan_aktif('${randomUUID()}', 'informasi_produk', 'Informasi produk', 'memproses')`);
});

Given('there is no active call', function () {
  sqlLokal("select public.akhiri_panggilan_aktif(id) from public.percakapan where status_penyelesaian = 'berjalan'");
});

Given('there is a complaint ticket waiting for review', function () {
  const id = randomUUID();
  sqlLokal(
    `select public.laporkan_panggilan_aktif('${id}', 'pengaduan', 'Pengaduan produk', 'mendengar')`,
    `select public.terbitkan_tiket_pengaduan('${id}', 'Krim Wajah Glowing', 'Krim Wajah Glowing membuat kulit saya iritasi setelah dua hari pemakaian',
      'Budi Santoso', '081234567890', 'Krim Wajah Glowing membuat kulit iritasi')`,
  );
});

Given('the material {string} exists', function (judul) {
  const j = judul.replace(/'/g, "''");
  sqlLokal(`insert into public.materi_pengetahuan (judul, kategori, rujukan_sumber, isi)
    select '${j}', 'Pangan Olahan', 'Peraturan BPOM Nomor 31 Tahun 2018', 'Materi uji skenario penerimaan UC-07.'
    where not exists (select 1 from public.materi_pengetahuan where judul = '${j}')`);
});
