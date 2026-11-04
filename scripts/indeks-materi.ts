// Mengindeks ulang materi yang belum terindeks ke materi_potongan (T-F2.2-02, REQ-7.1; F2 "bisa diindeks ulang").
// Jalankan dari akar repo setelah `supabase db reset`, dengan kunci service_role Supabase lokal:
//   eval "$(npx supabase status -o env)"
//   SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY node scripts/indeks-materi.ts
// Materi korpus diindeks dari berkas lengkapnya di knowledge/, materi lain dari isinya atau judulnya. Materi korpus yang
// berkasnya tidak bisa dipastikan dihitung gagal, karena isinya hanya cuplikan (scripts/seed-materi.ts).
// Hanya materi terindeks = false yang diproses, jadi aman dijalankan ulang. Urutan deploy ke cloud: supabase/README.md.
import { readFileSync } from 'node:fs';
import { buatPenyediaEmbedding } from '../supabase/functions/_shared/adapter/embedding.ts';
import type { PenyimpananPengetahuan } from '../supabase/functions/_shared/adapter/penyimpananPengetahuan.ts';
import { BasisPengetahuanController } from '../supabase/functions/_shared/control/BasisPengetahuanController.ts';
import { DOKUMEN_KORPUS } from '../src/lib/mock/materiTiruan.ts';
import { pemetaBerkasKorpus } from './berkasKorpus.ts';

const { SUPABASE_URL: url = '', SUPABASE_SERVICE_ROLE_KEY: kunci = '' } = process.env;
if (!url || !kunci) {
  console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// max-rows PostgREST, dan jumlah potongan per permintaan agar badan permintaan tidak terlalu besar.
const BATAS_BACA = 1000;
const BATAS_KIRIM = 500;

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: kunci, Authorization: `Bearer ${kunci}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} pada ${path.split('?')[0]}`);
  return res;
}

const penyimpanan: PenyimpananPengetahuan = {
  simpanMateri: () => Promise.reject(new Error('skrip ini tidak menambah materi')),
  async simpanPotongan(potongan) {
    for (let i = 0; i < potongan.length; i += BATAS_KIRIM) {
      await rest('materi_potongan', { method: 'POST', body: JSON.stringify(potongan.slice(i, i + BATAS_KIRIM)) });
    }
  },
  async perbaruiStatusTerindeks(id, terindeks) {
    await rest(`materi_pengetahuan?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ terindeks }) });
  },
};

const berkasKorpus = pemetaBerkasKorpus(DOKUMEN_KORPUS);
const isiBerkas = (berkas: string) => readFileSync(berkas, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');

type BarisMateri = { id: string; judul: string; rujukan_sumber: string; url_sumber: string | null; isi: string };

const controller = new BasisPengetahuanController(buatPenyediaEmbedding(), penyimpanan);
let terindeks = 0;
let gagal = 0;
// Keyset per id: materi yang berhasil keluar dari filter, jadi offset akan melompati baris.
for (let terakhir = ''; ;) {
  const p = new URLSearchParams({ select: 'id,judul,rujukan_sumber,url_sumber,isi', terindeks: 'eq.false', order: 'id', limit: String(BATAS_BACA) });
  if (terakhir) p.set('id', `gt.${terakhir}`);
  const baris = (await (await rest(`materi_pengetahuan?${p}`)).json()) as BarisMateri[];
  if (!baris.length) break;
  for (const m of baris) {
    const berkas = berkasKorpus(m.judul, m.rujukan_sumber, m.url_sumber);
    if (berkas === null) {
      console.warn(`Berkas korpus tidak bisa dipastikan, isi url_sumber sesuai manifest: ${m.judul} (${m.rujukan_sumber})`);
      gagal++;
      continue;
    }
    // Potongan sisa percobaan yang gagal dibuang dulu agar tidak berlipat.
    await rest(`materi_potongan?materi_id=eq.${m.id}`, { method: 'DELETE' });
    if (await controller.indeksMateri(m.id, berkas ? isiBerkas(berkas) : m.isi || m.judul)) terindeks++;
    else gagal++;
  }
  terakhir = baris[baris.length - 1].id;
}

console.info(`${terindeks} materi terindeks, ${gagal} gagal`);
if (gagal) process.exitCode = 1;
