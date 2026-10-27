// Membuat supabase/seed_materi.sql dari korpus RAG di knowledge/. Jalankan ulang bila korpus berubah:
//   node scripts/seed-materi.ts
// Isi materi hanya cuplikan awal dokumen; pengindeksan isi lengkap ke materi_potongan adalah T-F2.2-02.
import { readFileSync, writeFileSync } from 'node:fs';
import { DOKUMEN_KORPUS } from '../src/lib/mock/materiTiruan.ts';

const PANJANG_CUPLIKAN = 400;

const cuplikan = (berkas: string) =>
  readFileSync(berkas, 'utf8')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^#+ .*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PANJANG_CUPLIKAN);

const teks = (s: string) => `'${s.replaceAll("'", "''")}'`;

const baris = DOKUMEN_KORPUS.map((d) =>
  `(${[d.judul, d.kategori, d.rujukanSumber, cuplikan(d.berkas) || d.judul, d.diperbaruiPada].map(teks).join(', ')})`,
);

writeFileSync(
  'supabase/seed_materi.sql',
  `-- Dibuat oleh scripts/seed-materi.ts dari knowledge/*/manifest.json. Jangan diedit manual.
insert into public.materi_pengetahuan (judul, kategori, rujukan_sumber, isi, diperbarui_pada) values
${baris.join(',\n')};
`,
);
console.info(`${baris.length} materi ditulis ke supabase/seed_materi.sql`);
