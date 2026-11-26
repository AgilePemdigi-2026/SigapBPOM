// Langkah web gaya Behat/Mink untuk skenario SRS Lampiran F (@ui). Kalimatnya dipakai apa adanya dari SRS.
// Panel suara tidak bisa didengar atau diajak bicara oleh browser uji, jadi:
// - "I should hear ..." memeriksa kalimat agen di transkrip panel, karena setiap kalimat yang diucapkan juga ditampilkan;
// - "I say ..." mengetik ucapan di kolom ketik panel, yang diproses gateway dengan alur yang sama seperti ucapan suara;
// - nomor tiket contoh di SRS (ADU-0456, ESK-0123) dicocokkan dengan nomor tiket yang benar-benar terbit (ADU-YYYYMMDD-NNNN,
//   ESK-YYYYMMDD-NNNN).
import { randomUUID } from 'node:crypto';
import { After, Given, Then, When } from '@cucumber/cucumber';
import { buatVektorTiruan } from '../../supabase/functions/_shared/adapter/embedding.ts';
import { mulaiTiruan, tiruan } from '../support/tiruan.mjs';
import { AKUN_UJI, MODE_TIRUAN, URL_DASAR, sqlLokal } from '../support/ui.mjs';

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
      if (await kolom.count()) {
        const tag = await kolom.first().evaluate((el) => el.tagName.toLowerCase());
        if (tag === 'select') {
          await kolom.first().selectOption({ label: nilai }).catch(() => kolom.first().selectOption(nilai));
          await kolom.first().dispatchEvent('change');
          return;
        }
        const type = await kolom.first().getAttribute('type');
        let nilaiIsi = nilai;
        if (type === 'date' && /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(nilai)) {
          const [d, m, y] = nilai.split(/[-/]/);
          nilaiIsi = `${y}-${m}-${d}`;
        }
        return kolom.first().fill(nilaiIsi);
      }
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
  if (path === '/riwayat-percakapan/detail' && this.percakapanAktif) {
    await this.page.goto(`${URL_DASAR}/riwayat-percakapan/detail?id=${encodeURIComponent(this.percakapanAktif)}`);
    return;
  }
  if (path === '/pengaduan/detail' && this.noTiketAktif) {
    await this.page.goto(`${URL_DASAR}/pengaduan/detail?tiket=${encodeURIComponent(this.noTiketAktif)}`);
    return;
  }
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
  // Kedua kegagalan menampilkan teks yang sama, jadi respons 401 dari server yang menjadi penanda tiap percobaan.
  for (let i = 0; i < 2; i++) {
    await isi(this.page, 'Email', AKUN_UJI.email);
    await isi(this.page, 'Password', 'salahpassword');
    const jawaban = this.page.waitForResponse((r) => new URL(r.url()).pathname === '/api/login', { timeout: TUNGGU_MS });
    await tekan(this.page, 'Login');
    const status = (await jawaban).status();
    if (status !== 401) throw new Error(`Percobaan gagal ke-${i + 1} dijawab ${status}, bukan 401`);
  }
});

When('I fill in {string} with {string}', async function (label, nilai) {
  await isi(this.page, label, nilai);
});

When('I select {string} from {string}', async function (pilihan, label) {
  const dialog = this.page.locator('dialog[open], [role="dialog"][aria-modal="true"]').filter({ visible: true });
  const lingkup = (await dialog.count()) ? [dialog.last(), this.page] : [this.page];
  for (const l of lingkup) {
    for (const exact of [true, false]) {
      const select = l.getByLabel(label, { exact }).and(this.page.locator('select')).filter({ visible: true });
      if (await select.count()) {
        await select.first().selectOption({ label: pilihan }).catch(() => select.first().selectOption(pilihan));
        await select.first().dispatchEvent('change');
        return;
      }
    }
  }
  throw new Error(`Select "${label}" tidak ditemukan`);
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

When('I press {string} on a complaint with status {string}', async function (tombol, status) {
  const baris = this.page.locator('tr, li, .row').filter({ hasText: status }).filter({ visible: true }).first();
  await tunggu(baris, `pengaduan berstatus "${status}"`);
  await tekan(this.page, tombol, baris);
});

Given('the complaint status is {string}', async function (statusLabel) {
  const mapStatus = {
    'Belum Ditelaah': 'belum_ditelaah',
    'Sedang Ditelaah': 'sedang_ditelaah',
    'Menunggu Pemeriksaan': 'menunggu_pemeriksaan',
    'Tanggapan Disusun': 'tanggapan_disusun',
    'Selesai': 'selesai',
    'Diteruskan ke Instansi Lain': 'diteruskan',
  };
  const statusDb = mapStatus[statusLabel];
  const kondisi = this.noTiketAktif
    ? `where no_tiket = '${this.noTiketAktif}'`
    : `where id = (select id from public.tiket where jenis = 'pengaduan' order by tgl_terbit desc limit 1)`;
  if (statusDb) {
    if (statusDb === 'tanggapan_disusun') {
      sqlLokal(
        `update public.tiket set status = 'sedang_ditelaah' ${kondisi}`,
        `insert into public.tanggapan (tiket_id, isi, petugas_id, status) select id, 'Produk telah ditelaah dan pelaku usaha diberi peringatan tertulis.', (select id from public.petugas limit 1), 'tanggapan_disusun' from public.tiket ${kondisi}`,
        `update public.tiket set status = 'tanggapan_disusun' ${kondisi}`,
      );
    } else {
      sqlLokal(`update public.tiket set status = '${statusDb}' ${kondisi}`);
    }
  }
  if (this.page.url().includes('/pengaduan/detail')) {
    if (this.noTiketAktif) {
      await this.page.goto(`${URL_DASAR}/pengaduan/detail?tiket=${encodeURIComponent(this.noTiketAktif)}`);
    } else {
      await this.page.reload();
    }
  }
  const el = this.page.locator('[data-name="StatusPengaduan"]').filter({ visible: true }).first();
  await tunggu(el.filter({ hasText: statusLabel }), `status pengaduan "${statusLabel}"`);
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
  // Persis, karena kotak informasi login mengutip pesan "Akses dikunci" yang belum tentu muncul.
  await tunggu(this.page.getByText(pesan, { exact: true }).filter({ visible: true }).first(), `pesan "${pesan}"`);
});

Then('I should see the {string} element', async function (nama) {
  await tunggu(elemen(this.page, nama), `elemen ${nama}`);
});

Then('I should see {string} in the {string} element', async function (teks, nama) {
  const el = this.page.locator(`[data-name="${nama}"]`).filter({ visible: true }).filter({ hasText: teks }).first();
  await tunggu(el, `"${teks}" di elemen ${nama}`);
});

Then('I should hear {string}', async function (kalimat) {
  const pola = new RegExp(regexTeks(kalimat).replace(/\b(ADU|ESK)-\d+/g, '$1-[0-9-]+'));
  const transkrip = this.page.locator('[data-name="TranskripPercakapan"]').filter({ visible: true }).filter({ hasText: pola }).first();
  await tunggu(transkrip, `kalimat agen "${kalimat}" di TranskripPercakapan`);
});

// Data awal di Supabase lokal, lewat RPC yang sama dengan Voice Gateway.
Given('there is an active call', function () {
  sqlLokal(`select public.laporkan_panggilan_aktif('${randomUUID()}', 'informasi_produk', 'Informasi produk', 'memproses')`);
});

Given('there is no active call', function () {
  sqlLokal('select public.akhiri_panggilan_aktif(id) from public.percakapan where waktu_selesai is null');
});

Given('there is a complaint ticket waiting for review', function () {
  const id = randomUUID();
  sqlLokal(
    `select public.laporkan_panggilan_aktif('${id}', 'pengaduan', 'Pengaduan produk', 'mendengar')`,
  );
  const out = sqlLokal(
    `select public.terbitkan_tiket_pengaduan('${id}', 'Krim Wajah Glowing', 'Krim Wajah Glowing membuat kulit saya iritasi setelah dua hari pemakaian',
      'Budi Santoso', '081234567890', 'Krim Wajah Glowing membuat kulit iritasi') as no_tiket`,
  );
  const m = String(out || '').match(/ADU-\d{8}-\d{4}/);
  if (m) {
    this.noTiketAktif = m[0];
  }
});

// Layanan luar untuk Voice Gateway: cekbpom dan Hermes tiruan di features/support/tiruan.mjs.
Given('the BPOM registration data contains:', async function (tabel) {
  tiruan.data = tabel.hashes();
  await mulaiTiruan();
});

Given('the AI agent answers:', async function (tabel) {
  tiruan.jawaban = new Map(tabel.hashes().map((b) => [b.pertanyaan, b.jawaban]));
  await mulaiTiruan();
});

// Materi tanpa isi diindeks dari judulnya dengan embedding tiruan yang sama dengan simpan-materi (SRS Tabel B.8 Basic Path),
// jadi Edge Function cari-pengetahuan menemukannya bila gateway berjalan dengan PENGETAHUAN_VEKTOR=1.
Given('the material {string} with reference {string} is ready to use', function (judul, rujukan) {
  const [j, r] = [judul, rujukan].map((s) => s.replace(/'/g, "''"));
  sqlLokal(`with m as (insert into public.materi_pengetahuan (judul, rujukan_sumber, isi, terindeks) values ('${j}', '${r}', '', true) returning id)
    insert into public.materi_potongan (materi_id, teks, embedding) select id, '${j}', '[${buatVektorTiruan(judul)}]' from m`);
});

Given('the material {string} exists', function (judul) {
  const j = judul.replace(/'/g, "''");
  sqlLokal(`insert into public.materi_pengetahuan (judul, kategori, rujukan_sumber, isi)
    select '${j}', 'Pangan Olahan', 'Peraturan BPOM Nomor 31 Tahun 2018', 'Materi uji skenario penerimaan UC-07.'
    where not exists (select 1 from public.materi_pengetahuan where judul = '${j}')`);
});

// Provider AI UC-04 (REQ-4.5). Pilihan diatur lewat endpoint yang sama dengan tombol Simpan, agar setiap skenario mulai
// dari provider yang diketahui. Kondisi perangkat AI lokal diatur di server tiruan (port 8091) dan sampai ke dashboard lewat
// salah satu jalur (features/README.md): Voice Gateway asli memeriksa Ollama tiruan (/api/tags, OLLAMA_URL) seperti di CI,
// atau dashboard membaca /voice/kesehatan tiruan langsung (VOICE_GATEWAY_URL=http://127.0.0.1:8091, mode tiruan).
const NILAI_PROVIDER = { 'Cloud (GPT)': 'cloud', 'Lokal (Ollama)': 'lokal' };
// Akun uji Supabase lokal (petugas@halobpom.go.id) di supabase/seed.sql.
const ID_AKUN_UJI = '22222222-2222-2222-2222-222222222222';

Given('the AI provider is {string}', async function (label) {
  const provider = NILAI_PROVIDER[label];
  if (!provider) throw new Error(`Provider "${label}" tidak dikenal`);
  const res = await this.page.request.post(`${URL_DASAR}/api/provider-ai`, { data: { provider }, headers: { Origin: URL_DASAR } });
  if (!res.ok()) throw new Error(`Menyiapkan provider ${provider} dijawab ${res.status()}`);
});

/**
 * Menunggu sampai dashboard (GET /api/pantau-agent, sesi skenario) melaporkan komponen AI Lokal berstatus `status`, karena
 * gateway asli baru melihat perubahan Ollama tiruan pada probe berikutnya.
 */
async function tungguAiLokal(page, status) {
  let terakhir = null;
  for (const batas = Date.now() + TUNGGU_MS; Date.now() < batas; await page.waitForTimeout(250)) {
    const res = await page.request.get(`${URL_DASAR}/api/pantau-agent`).catch(() => null);
    const body = res?.ok() ? await res.json().catch(() => null) : null;
    terakhir = body?.data?.agent?.komponen?.find((k) => k.nama === 'AI Lokal')?.status ?? null;
    if (terakhir === status) return;
  }
  throw new Error(`Dashboard tidak melaporkan AI Lokal "${status}" dalam ${TUNGGU_MS / 1000} detik (terakhir: ${terakhir}). `
    + 'Jalankan gateway dengan OLLAMA_URL=http://127.0.0.1:8091 dan dashboard dengan VOICE_GATEWAY_URL ke gateway itu (features/README.md).');
}

Given('the local AI device is running', async function () {
  tiruan.aiLokal = { sehat: true, latensiMs: 90 };
  await mulaiTiruan();
  await tungguAiLokal(this.page, 'Normal');
});

Given('the local AI device is down', async function () {
  tiruan.aiLokal = { sehat: false, latensiMs: null };
  await mulaiTiruan();
  await tungguAiLokal(this.page, 'Gangguan');
});

Given('I do not have the right to change the AI provider', function () {
  // Sesi tiruan hanya punya satu akun demo yang selalu berhak; hak_atur_ai hanya bisa dicabut di Supabase lokal.
  if (MODE_TIRUAN) return 'skipped';
  sqlLokal(`update public.petugas set hak_atur_ai = false where id = '${ID_AKUN_UJI}'`);
});

// Provider dikembalikan ke cloud agar run @ui berikutnya (UC-01, UC-02) tidak dijawab profil lokal lalu dieskalasi. Provider
// lebih dulu, lalu hak_atur_ai; masing-masing dicoba sendiri agar kegagalan satu langkah tidak melewatkan yang lain.
// Hook ini berjalan sebelum After di support/ui.mjs yang menutup konteks browser, jadi sesi skenario masih bisa dipakai.
After({ tags: '@REQ-4.5' }, async function () {
  tiruan.aiLokal = { sehat: true, latensiMs: 90 };
  const galat = [];
  const coba = async (langkah) => { try { await langkah(); } catch (e) { galat.push(e); } };
  if (!MODE_TIRUAN) {
    await coba(() => sqlLokal(`update public.pengaturan_ai set provider = 'cloud', diubah_oleh = null, diubah_pada = now()`));
    await coba(() => sqlLokal(`update public.petugas set hak_atur_ai = true where id = '${ID_AKUN_UJI}'`));
  } else {
    // Penyimpanan tiruan ada di memori server dashboard, jadi hanya bisa dikembalikan lewat endpoint dengan sesi skenario.
    await coba(async () => {
      const res = await this.page?.request.post(`${URL_DASAR}/api/provider-ai`, { data: { provider: 'cloud' }, headers: { Origin: URL_DASAR } });
      if (res && !res.ok() && res.status() !== 401) throw new Error(`Mengembalikan provider ke cloud dijawab ${res.status()}`);
    });
  }
  if (galat.length) throw galat[0];
});

When('I choose {string} in the {string} element', async function (label, nama) {
  const pilihan = elemen(this.page, nama).locator('label').filter({ hasText: label }).first();
  await tunggu(pilihan, `pilihan "${label}" di elemen ${nama}`);
  await pilihan.click();
});

Then('{string} should be the selected AI provider', async function (label) {
  const radio = elemen(this.page, 'PanelProviderAi').getByRole('radio', { name: label, exact: true });
  await radio.waitFor({ state: 'attached', timeout: TUNGGU_MS });
  if (!(await radio.isChecked())) throw new Error(`Provider "${label}" tidak terpilih`);
});

Then('the AI provider options should be disabled', async function () {
  const panel = elemen(this.page, 'PanelProviderAi');
  await tunggu(panel, 'elemen PanelProviderAi');
  for (const kontrol of [...(await panel.getByRole('radio').all()), panel.getByRole('button', { name: 'Simpan' })]) {
    if (await kontrol.isEnabled()) throw new Error('Pilihan provider AI masih bisa diubah');
  }
});

Then('I should be asked {string}', async function (teks) {
  const batas = Date.now() + TUNGGU_MS;
  while (!this.dialog?.includes(teks)) {
    if (Date.now() > batas) throw new Error(`Konfirmasi "${teks}" tidak muncul; yang muncul: ${JSON.stringify(this.dialog ?? [])}`);
    await this.page.waitForTimeout(200);
  }
});

// UC-05 (Tabel B.6): percakapan selesai dengan transkrip yang menyebut nomor telepon, agar penyamaran view ucapan_petugas
// (NFR-13) tampil sebagai "0812****7890". Dimulai sekarang, sehingga lebih baru dari percakapan skenario sebelumnya dan
// "Lihat Transkrip" pertama di Riwayat Percakapan (urut waktu_mulai terbaru) membukanya.
Given('there is a recorded conversation with a transcript', function () {
  if (MODE_TIRUAN) return 'skipped';
  const penelepon = randomUUID();
  const id = randomUUID();
  sqlLokal(
    `insert into public.penelepon (id, no_telp, nama_pelapor) values ('${penelepon}', '081234567890', 'Budi Santoso')`,
    `insert into public.percakapan (id, penelepon_id, waktu_mulai, waktu_selesai, jenis_interaksi, status_penyelesaian, topik, ringkasan)
      values ('${id}', '${penelepon}', now(), now() + interval '2 minutes', 'pengaduan', 'selesai_ai',
      'Kosmetik', 'Penelepon menanyakan krim wajah yang membuat kulit iritasi.')`,
    `insert into public.ucapan (percakapan_id, urutan, pembicara, teks, detik_ke) values
      ('${id}', 1, 'penelepon', 'Krim wajah saya bikin iritasi, nomor saya 081234567890.', 4),
      ('${id}', 2, 'sistem', 'Baik, keluhan Anda sudah kami catat.', 9)`,
  );
  this.percakapanAktif = id;
});

// UC-08 (Tabel B.9): data layanan September 2026 untuk periode "01-09-2026 s.d. 30-09-2026".
Given('there is service data in September 2026', function () {
  if (MODE_TIRUAN) return; // PenyimpananLaporanMock sudah berisi data contoh September 2026.
  sqlLokal(
    `insert into public.percakapan (id, waktu_mulai, waktu_selesai, jenis_interaksi, status_penyelesaian, topik)
      select gen_random_uuid(), timestamptz '2026-09-15 03:00+00', timestamptz '2026-09-15 03:05+00', 'informasi_produk', 'selesai_ai', 'Pangan Olahan'
      where not exists (select 1 from public.percakapan where waktu_mulai >= '2026-09-01' and waktu_mulai < '2026-10-01')`,
  );
});

Given('the service recapitulation is displayed', async function () {
  await isi(this.page, 'Periode', '01-09-2026 s.d. 30-09-2026');
  await tekan(this.page, 'Tampilkan');
  await tunggu(elemen(this.page, 'TabelRekapitulasi'), 'elemen TabelRekapitulasi');
});

// Hak ekspor diperiksa server di setiap permintaan (RPC boleh_ekspor), jadi cukup dicabut dari akun uji yang sudah login.
Given('I am logged in as an officer without export permission', function () {
  if (MODE_TIRUAN) return 'skipped';
  sqlLokal(`update public.petugas set hak_ekspor = false where id = '${ID_AKUN_UJI}'`);
});

After({ tags: '@uc-08' }, function () {
  if (!MODE_TIRUAN) sqlLokal(`update public.petugas set hak_ekspor = true where id = '${ID_AKUN_UJI}'`);
});
