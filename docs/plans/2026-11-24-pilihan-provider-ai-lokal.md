# Pilihan Provider AI (Cloud atau Ollama Lokal): Rencana Implementasi

> **Untuk pelaksana:** kerjakan task berurutan. Setiap langkah memakai checkbox (`- [ ]`).

**Tujuan:** admin memilih provider AI agent dari dashboard, yaitu Cloud (Hermes + GPT) atau Lokal (Hermes + Ollama di PC lokal). Mode Lokal tidak pernah jatuh ke cloud.

**Arsitektur:** ada dua profil Hermes di VPS, `sigap-cloud` di `:8642` dan `sigap-lokal` di `:8643`. Pilihan admin disimpan di tabel satu baris `pengaturan_ai`, lalu dibaca Voice Gateway lewat Edge Function `provider-ai` (cache 5 detik) di setiap giliran. Kalau mode Lokal gagal, agent mengucapkan `PESAN_LOKAL_MATI` dan masuk jalur eskalasi yang sudah ada.

**Stack:** Astro 7 (SSR, `node --test` untuk `.ts`), Supabase (Postgres, RLS, Edge Functions Deno, pgTAP), Voice Gateway Node 22 (`.mjs`, `node --test`), Hermes Agent, Ollama 0.40.

**Spec:** `docs/specs/2026-11-24-pilihan-provider-ai-lokal-design.md`

## Batasan global

- Nilai provider hanya `cloud` atau `lokal` (enum `public.provider_ai`). Di gateway ada nilai ketiga `tidak_diketahui`, yang tidak pernah disimpan.
- `PESAN_LOKAL_MATI` = `Mohon maaf, perangkat AI lokal sedang tidak aktif. Pertanyaan Anda akan kami teruskan ke petugas. Mohon sebutkan nomor telepon Anda.`
- Teks dashboard:
  - konfirmasi: `Perangkat AI lokal sedang tidak aktif. Selama mode Lokal dipakai, panggilan akan diteruskan ke petugas. Lanjutkan?`
  - sukses: `Provider AI berhasil diubah.`
  - tanpa hak: `Anda tidak memiliki hak mengubah provider AI.`
- Cache pemilih 5000 ms. Probe Ollama setiap 30000 ms dengan batas 3000 ms.
- Env gateway baru: `HERMES_LOKAL_URL`, `HERMES_LOKAL_API_KEY`, `HERMES_LOKAL_MODEL`, `OLLAMA_URL`, `AI_PROVIDER_BAWAAN` (bawaan `cloud`, hanya untuk tiruan).
- Respons API memakai `{ status, message, data }`. Pesan commit Conventional Commits bahasa Inggris, scope `uc-04`, tanpa atribusi AI.
- Nama test menyebut kode REQ baru. Di rencana ini ditulis `REQ-4.x`; ganti dengan nomor yang ditetapkan di Task 1.

## Fokus review

1. **Admin pindah ke Lokal di tengah panggilan:** giliran berikutnya (dalam 5 detik) memakai profil lokal, dan giliran yang sedang mengalir tidak terputus. Test di Task 5.
2. **Profil lokal menjawab 200 tapi isinya pemberitahuan "No reply" Hermes:** diperlakukan gagal, `PESAN_LOKAL_MATI` diucapkan, cloud tidak dipanggil. Test di Task 5.
3. **Edge Function `provider-ai` mengembalikan nilai di luar enum:** pemilih menganggapnya gagal baca. Nilai terakhir dipakai, atau `tidak_diketahui` kalau belum pernah berhasil. Test di Task 4.
4. **Petugas tanpa hak mengirim POST langsung (bukan lewat UI):** ditolak 403 dengan pesan tanpa hak, dan baris tidak berubah. Test di Task 3 (pgTAP) dan Task 7.
5. **Ringkasan tiket saat mode Lokal dan Ollama mati:** dipakai `PeringkasTiruan`, tidak memanggil profil cloud. Test di Task 5.

---

### Task 1: PR docs (PRD, PRD-rinci, ADR 0007, tasks.json)

Branch: `docs/uc-04-provider-ai-lokal` (sudah ada, berisi dokumen desain).

**File:**
- Buat: `docs/decisions/0007-provider-ai-lokal.md`
- Ubah: `docs/prd/PRD.md`, `docs/prd/specs/` (spec F5), `docs/prd/features.json`, `docs/prd/tasks.json`, `docs/reference/PRD-rinci.md`, `docs/PROJECT_RULES.md` (tabel 9.1 dan baris ADR di bagian 8)

- [ ] **Langkah 1:** Tulis ADR 0007 dengan format konteks, keputusan, alternatif, konsekuensi. Isinya dari spec bagian 1, 4, 5.1, dan catatan bahwa STT/TTS tetap ElevenLabs.
- [ ] **Langkah 2:** Tambahkan REQ baru di UC-04 PRD-rinci:
  - admin dengan hak memilih provider;
  - mode Lokal tidak memakai cloud;
  - mode Lokal gagal berarti eskalasi.

  Tambahkan juga empat teks pesan ke Lampiran (persis seperti di Batasan global) dan baris Ollama di tabel antarmuka eksternal.
- [ ] **Langkah 3:** Tambahkan sub-fitur dan task Task 2 sampai Task 8 ke `features.json` dan `tasks.json` dengan ref `T-F5.5-0N`. Perbarui tabel 9.1 PROJECT_RULES dengan catatan persetujuan sprint.
- [ ] **Langkah 4:** Jalankan `node ~/.claude/skills/prd-generator/scripts/prd-tasks.mjs validate`. Lulus kalau tidak ada galat.
- [ ] **Langkah 5:** Commit `docs(uc-04): add local AI provider requirements and ADR 0007`, push, lalu buka PR dengan `Sprint: 3` dan `Task: T-F5.5-01`.

Task 2 sampai Task 8 dikerjakan di branch `feat/uc-04-provider-ai-lokal`, yang dibuat dari `main` setelah PR docs di-merge.

### Task 2: Profil Hermes lokal dan Ollama (manual, di PC dan VPS)

Tanpa kode repo. Hasilnya: `sigap-lokal` menjawab di `:8643` dan berhasil memanggil tool.

- [ ] **Langkah 1:** Di PC, jalankan `ollama pull qwen3:8b`. Set env sistem `OLLAMA_HOST=0.0.0.0` dan `OLLAMA_KEEP_ALIVE=-1`, lalu restart Ollama.
- [ ] **Langkah 2:** Pasang Tailscale di PC dan VPS. Tambahkan aturan Windows Firewall inbound TCP 11434 hanya untuk alamat `100.64.0.0/10`. Dari VPS, `curl http://<ip-tailscale-pc>:11434/api/tags` harus berisi `qwen3:8b`.
- [ ] **Langkah 3:** Di VPS, buat profil `sigap-lokal` sebagai salinan `sigap-cloud`:
  - `model.provider: custom`, `base_url: http://<ip-tailscale-pc>:11434/v1`, `default: qwen3:8b`;
  - tanpa `fallback_model`;
  - `.env` profil tanpa kunci OpenAI atau OpenRouter;
  - API server di port 8643 dengan kunci baru.
- [ ] **Langkah 4:** Matikan thinking qwen3 di profil (opsi reasoning Hermes, atau `/no_think` di prompt sistem profil lokal).
- [ ] **Langkah 5 (uji tool):** `curl -N http://127.0.0.1:8643/v1/chat/completions -H "authorization: Bearer <kunci>" -d '{"model":"sigap-hermes","stream":true,"messages":[{"role":"user","content":"Apakah produk dengan nomor NA18201200123 terdaftar?"}]}'`. Lulus kalau jawaban memakai hasil tool `cek-registrasi` dan tidak ada blok `<think>`. Kalau gagal, ganti ke `qwen3:14b` lalu ulangi.
- [ ] **Langkah 6 (uji bocor):** jalankan `sudo tcpdump -n 'dst port 443'` di VPS selama Langkah 5. Lulus kalau tidak ada koneksi ke host penyedia LLM.

### Task 3: Migrasi `pengaturan_ai` dan hak `hak_atur_ai`

**File:**
- Buat: `supabase/migrations/20261125100000_pengaturan_provider_ai.sql`
- Buat: `supabase/tests/database/pengaturan_provider_ai.test.sql`
- Ubah: `supabase/seed.sql` (baris petugas seed: `hak_atur_ai = true`)

**Interface:**
- Menghasilkan:
  - `type public.provider_ai as enum ('cloud','lokal')`
  - tabel `public.pengaturan_ai(id boolean pk default true check (id), provider provider_ai not null default 'cloud', diubah_oleh uuid references petugas(id), diubah_pada timestamptz not null default now())`, diisi satu baris
  - `petugas.hak_atur_ai boolean not null default false`
  - `public.ubah_provider_ai(p_provider public.provider_ai) returns public.pengaturan_ai` (security definer, `search_path = ''`, grant ke `authenticated`). Kalau pemanggil tidak punya hak, melempar `raise exception using errcode = '42501'`.
  - `public.boleh_atur_ai() returns boolean` (grant ke `authenticated`)

- [ ] **Langkah 1:** Tulis test pgTAP (pola `rekap_layanan_dan_hak_ekspor.test.sql`):
  - `anon` tidak bisa `select` `pengaturan_ai`;
  - petugas bisa `select`;
  - `update` langsung oleh petugas mengenai 0 baris atau ditolak;
  - `ubah_provider_ai('lokal')` tanpa hak melempar `42501`;
  - dengan hak, mengembalikan `provider = 'lokal'` dan `diubah_oleh = auth.uid()`;
  - `boleh_atur_ai()` benar untuk pemegang hak.
- [ ] **Langkah 2:** `npx supabase test db`, hasilnya FAIL karena relasi belum ada.
- [ ] **Langkah 3:** Tulis migrasi. RLS aktif, hanya ada policy `select` untuk `(select public.is_petugas())`, `revoke all` dari `anon`.
- [ ] **Langkah 4:** `npx supabase db reset`, lalu `npx supabase test db`. Hasilnya PASS.
- [ ] **Langkah 5:** Commit `feat(uc-04): add AI provider setting table and permission`.

### Task 4: Edge Function `provider-ai` dan pemilih provider di gateway

**File:**
- Buat: `supabase/functions/provider-ai/index.ts`
- Buat: `voice-gateway/providerAi.mjs`, `voice-gateway/providerAi.test.mjs`
- Ubah: `supabase/config.toml` (daftarkan fungsi, `verify_jwt = false` seperti `katalog-materi`)

**Interface:**
- Edge Function: `POST /functions/v1/provider-ai` dengan header `x-sigap-kunci`, lewat `layani()` dari `_shared/boundary/http.ts`. Respons: `{ status:'success', data:{ provider:'cloud'|'lokal' } }`.
- Menghasilkan (`providerAi.mjs`):
  - `export const PROVIDER = Object.freeze({ CLOUD:'cloud', LOKAL:'lokal', TIDAK_DIKETAHUI:'tidak_diketahui' })`
  - `export const PESAN_LOKAL_MATI` (teks di Batasan global)
  - `export class PemilihProviderSupabase { constructor({ url, kunci, fetch, now, cacheMs = 5000 }); aktif(): Promise<string> }`
  - `export class PemilihProviderTiruan { constructor(nilai = 'cloud'); aktif(): Promise<string> }`

- [ ] **Langkah 1:** Tulis test di `providerAi.test.mjs` dengan `fetch` dan `now` tiruan:
  - `req_4_x_membaca_provider_dari_supabase`: fetch mengembalikan `lokal`, `aktif()` menghasilkan `'lokal'`, dan header `x-sigap-kunci` terkirim;
  - `req_4_x_cache_5_detik`: dua panggilan dalam 4999 ms hanya satu fetch, panggilan di 5000 ms fetch lagi;
  - `req_4_x_galat_baca_memakai_nilai_terakhir`: sukses `lokal`, lalu fetch melempar, hasilnya tetap `'lokal'`;
  - `req_4_x_belum_pernah_terbaca_tidak_diketahui`: fetch 500 sejak awal, hasilnya `'tidak_diketahui'`;
  - `req_4_x_nilai_di_luar_enum_dianggap_gagal`: `{provider:'gpt'}` diperlakukan seperti galat baca.
- [ ] **Langkah 2:** `node --test voice-gateway/providerAi.test.mjs`, hasilnya FAIL.
- [ ] **Langkah 3:** Implementasikan kedua pemilih (pola fetch `KatalogMateriSupabase`, batas waktu 3000 ms) dan Edge Function (`db.from('pengaturan_ai').select('provider').single()`).
- [ ] **Langkah 4:** Jalankan test, hasilnya PASS. Lalu `npx supabase functions serve` dan `curl -X POST localhost:54321/functions/v1/provider-ai -H "x-sigap-kunci: <kunci>"`, hasilnya `cloud`.
- [ ] **Langkah 5:** Commit `feat(uc-04): read selected AI provider in voice gateway`.

### Task 5: Routing per giliran, kegagalan Lokal, dan ringkasan

**File:**
- Ubah: `voice-gateway/providerAi.mjs` (tambah fungsi di bawah), `voice-gateway/providerAi.test.mjs`
- Ubah: `voice-gateway/server.mjs`:
  - konstanta env sekitar baris 52-54;
  - `aliranHermes` di baris 269;
  - blok giliran AI di baris 567-583;
  - `peringkas` di baris 181;
  - `SUARA_STATIS` di baris 66
- Ubah: `voice-gateway/.env.example`

**Interface:**
- Memakai: `PROVIDER`, `PESAN_LOKAL_MATI`, dan pemilih dari Task 4.
- Menghasilkan:
  - `export function targetHermes(provider, { cloud, lokal }) -> { url, kunci, model, provider } | null`. Mengembalikan `null` untuk `tidak_diketahui` atau target yang URL-nya kosong.
  - `export class GalatProviderLokal extends Error`
  - `export async function* aliranDenganProvider({ target, alir }) `: membungkus generator aliran. Kalau `target.provider === 'lokal'` dan `alir` melempar galat apa pun, termasuk `'hermes tanpa jawaban'`, yang dilempar ulang adalah `GalatProviderLokal`.
  - `export function pilihPeringkas(provider, { cloud, lokal, tiruan })`: memilih `lokal` atau `cloud` sesuai provider, dan `tiruan` untuk `tidak_diketahui`.

- [ ] **Langkah 1:** Tulis test:
  - `req_4_x_target_mengikuti_provider`: `cloud` menghasilkan URL `:8642`, `lokal` menghasilkan URL `:8643`, `tidak_diketahui` menghasilkan `null`;
  - `req_4_x_lokal_gagal_tanpa_memanggil_cloud`: `alir` lokal melempar `ECONNREFUSED`, hasilnya `GalatProviderLokal`, dan spy fetch cloud tidak pernah dipanggil;
  - `req_4_x_no_reply_dianggap_gagal`: `alir` lokal melempar `Error('hermes tanpa jawaban')`, hasilnya `GalatProviderLokal`;
  - `req_4_x_galat_cloud_tidak_diubah`: galat di mode cloud diteruskan apa adanya;
  - `req_4_x_peringkas_lokal_mati_pakai_tiruan`: dengan `pilihPeringkas('lokal', …)`, lokal melempar, ringkasan berasal dari tiruan dan cloud tidak dipanggil. Pembungkus fallback-nya hanya ke tiruan.
- [ ] **Langkah 2:** Jalankan test, hasilnya FAIL.
- [ ] **Langkah 3:** Implementasikan fungsi-fungsi itu. Lalu ubah `server.mjs`:
  - `aliranHermes(id, kutipan, hasil, sinyal, target)` memakai `target.url/kunci/model`;
  - giliran memanggil `await pemilih.aktif()` lalu `targetHermes(...)`;
  - kalau `null`: `jawaban = PESAN_BUTUH_PETUGAS`, `riwayat.mulaiEskalasi(id, transkrip)`, ucapkan `'/voice/statis/butuh-petugas'`;
  - `catch (e instanceof GalatProviderLokal)` sebelum `throw e`: kalau `susunan.isi.length`, `tulis({ jenis:'ganti' })` lalu kosongkan `terucap`; setelah itu `riwayat.mulaiEskalasi(id, transkrip)`, ucapkan `PESAN_LOKAL_MATI` dengan suara `'/voice/statis/lokal-mati'`, `kondisi.catat('hermes', false, …)`, `tulis({ jenis:'selesai', sumber: [] })`, lalu `return`;
  - tambah `'lokal-mati': PESAN_LOKAL_MATI` ke `SUARA_STATIS`;
  - pemilih produksi: `PemilihProviderSupabase` kalau `SUPABASE_URL && SIGAP_KUNCI_INTERNAL`, selain itu `PemilihProviderTiruan(env('AI_PROVIDER_BAWAAN','cloud'))`.
- [ ] **Langkah 4:** `npm test`, hasilnya semua PASS, termasuk `konfigurasi.test.mjs` dan `ujiKinerja.test.mjs`.
- [ ] **Langkah 5:** Perbarui `voice-gateway/.env.example` dengan lima env baru dan komentarnya, lalu commit `feat(uc-04): route AI turns to selected Hermes profile`.

### Task 6: Probe kesehatan Ollama

**File:**
- Ubah: `voice-gateway/providerAi.mjs`, `voice-gateway/providerAi.test.mjs`
- Ubah: `voice-gateway/server.mjs` (route `/voice/kesehatan`, baris 691)
- Ubah: `src/lib/kesehatanAgentGateway.ts` dan test-nya, `src/lib/PemantauanLayananController.ts` (`KOMPONEN_AGENT` ditambah `'AI Lokal'`)

**Interface:**
- Menghasilkan:
  - `export class PemeriksaOllama { constructor({ url, fetch, now, intervalMs = 30000, batasMs = 3000 }); periksaSekali(): Promise<void>; mulai(); berhenti(); kondisi(): { sehat, latensiMs, waktu } | null }`
  - `/voice/kesehatan` menambah `data.provider` (`'cloud'|'lokal'|'tidak_diketahui'`) dan `data.hermesLokal` (`kondisi()`).

- [ ] **Langkah 1:** Tulis test:
  - `req_4_x_probe_ollama_sehat`: `/api/tags` 200 menghasilkan `{ sehat: true, latensiMs }`;
  - `req_4_x_probe_ollama_timeout_mati`: tidak menjawab lebih dari 3000 ms menghasilkan `sehat: false`;
  - `req_4_x_tanpa_ollama_url_null`: tanpa URL, `kondisi()` bernilai `null`;
  - di `kesehatanAgentGateway.test.ts`: `hermesLokal` dipetakan ke komponen `'AI Lokal'`, dan `null` dipetakan ke Gangguan tanpa latensi.
- [ ] **Langkah 2:** Jalankan test, hasilnya FAIL.
- [ ] **Langkah 3:** Implementasikan. `mulai()` dipanggil saat gateway start kalau `OLLAMA_URL` diisi, dengan `setInterval(...).unref()`.
- [ ] **Langkah 4:** `npm test`, hasilnya PASS.
- [ ] **Langkah 5:** Commit `feat(uc-04): report local AI device health`.

### Task 7: Control dan endpoint `POST /api/provider-ai`

**File:**
- Ubah: `src/lib/PemantauanLayananController.ts` (metode baru dan `PESAN_PEMANTAUAN`)
- Ubah: `src/lib/penyimpananPemantauanSupabase.ts`, `src/lib/mock/pemantauanTiruan.ts`
- Buat: `src/pages/api/provider-ai.ts`, `src/pages/api/_provider-ai.test.ts`
- Ubah: `src/lib/PemantauanLayananController.test.ts`

**Interface:**
- Menghasilkan:
  - `type ProviderAi = 'cloud' | 'lokal'`
  - `type PengaturanProviderAi = { provider: ProviderAi; diubahOleh: string | null; diubahPada: string; bolehUbah: boolean }`
  - `PenyimpananPemantauan` ditambah `ambilProviderAi?(): Promise<PengaturanProviderAi>` dan `ubahProviderAi?(p: ProviderAi): Promise<PengaturanProviderAi>`. Implementasi Supabase memanggil `pengaturan_ai` (join nama petugas), `boleh_atur_ai`, dan `ubah_provider_ai`. Galat `42501` dipetakan ke `KodeGalat 403`.
  - `PemantauanLayananController.ubahProviderAi(nilai: unknown): Promise<{ kode: 200|400|403|500; pesan: string; data: PengaturanProviderAi | null }>`
  - `PESAN_PEMANTAUAN.providerAiDiubah` dan `PESAN_PEMANTAUAN.providerAiTanpaHak` (teks di Batasan global)

- [ ] **Langkah 1:** Tulis test:
  - `req_4_x_ubah_provider_valid`: `'lokal'` menghasilkan kode 200 dengan pesan `Provider AI berhasil diubah.`;
  - `req_4_x_nilai_tidak_valid_400`: `'gpt'` dan `undefined` menghasilkan 400, dan penyimpanan tidak dipanggil;
  - `req_4_x_tanpa_hak_403`: penyimpanan melempar 403, hasilnya 403 dengan pesan `Anda tidak memiliki hak mengubah provider AI.`;
  - `_provider-ai.test.ts`: body JSON `{ provider }` diteruskan, dan respons berformat `{ status, message, data }` dengan kode HTTP yang sesuai.
- [ ] **Langkah 2:** `node --test src/lib/PemantauanLayananController.test.ts src/pages/api/_provider-ai.test.ts`, hasilnya FAIL.
- [ ] **Langkah 3:** Implementasikan. Endpoint mengikuti pola `dihubungi.ts`: middleware sudah memeriksa sesi, dan `security.checkOrigin` menangani CSRF.
- [ ] **Langkah 4:** Jalankan test, hasilnya PASS.
- [ ] **Langkah 5:** Commit `feat(uc-04): let authorized staff change AI provider`.

### Task 8: Panel Provider AI dan skenario Gherkin

**File:**
- Buat: `src/components/PanelProviderAi.astro`
- Ubah: `src/pages/pantau-ai-agent.astro` (panel di atas `.isi`)
- Buat: `features/uc-04-provider-ai.feature`
- Ubah: `features/step_definitions/dashboard.steps.mjs`

**Interface:**
- Memakai: `PengaturanProviderAi`, `POST /api/provider-ai`, dan komponen `'AI Lokal'` dari Task 6.

- [ ] **Langkah 1:** Tulis skenario Gherkin:
  - petugas dengan hak memilih "Lokal (Ollama)" lalu Simpan, dan melihat `Provider AI berhasil diubah.`;
  - petugas tanpa hak melihat pilihan nonaktif;
  - "AI Lokal" berstatus Gangguan, lalu memilih Lokal memunculkan teks konfirmasi.
- [ ] **Langkah 2:** `npm run test:bdd:ui -- features/uc-04-provider-ai.feature`, hasilnya FAIL.
- [ ] **Langkah 3:** Bangun panel sesuai sketsa spec 5.4:
  - radio Cloud (GPT) dan Lokal (Ollama), tombol Simpan;
  - status perangkat lokal dan baris "Terakhir diubah";
  - catatan "suara tetap diproses ElevenLabs";
  - radio `disabled` kalau `bolehUbah` false;
  - `confirm()` dengan teks konfirmasi kalau memilih Lokal saat AI Lokal Gangguan.

  Gunakan token dan kelas yang sudah ada di `global.css`. Jalankan skill desain proyek (`impeccable`, lalu `anti-ui-slop` sebagai gerbang akhir) sebelum dianggap selesai.
- [ ] **Langkah 4:** Jalankan skenario, hasilnya PASS. Lalu `npm test`, hasilnya PASS.
- [ ] **Langkah 5:** Commit `feat(uc-04): add AI provider panel to agent monitoring`.

### Task 9: Verifikasi akhir dan PR

- [ ] **Langkah 1:** `npm test`, `npx supabase test db`, dan `npm run test:bdd`. Semuanya PASS.
- [ ] **Langkah 2:** Uji ujung ke ujung dengan gateway VPS ke `sigap-lokal`:
  - pilih Lokal, telepon, lalu tanya registrasi produk: dijawab dan tool tercatat di log;
  - matikan Ollama, lalu bertanya lagi: terdengar `PESAN_LOKAL_MATI`, lalu sebut nomor: tiket ESK terbit;
  - `tcpdump` (Task 2 Langkah 6) tidak menunjukkan koneksi ke penyedia LLM.
- [ ] **Langkah 3:** Perbarui `README.md` (env baru dan langkah singkat Task 2). Audit sebelum push (PROJECT_RULES 3.4), lalu buka PR `feat(uc-04): select cloud or local AI provider` dengan `Sprint` dan `Task`.
