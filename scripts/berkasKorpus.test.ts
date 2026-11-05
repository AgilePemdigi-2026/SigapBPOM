import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pemetaBerkasKorpus } from './berkasKorpus.ts';

const berkasKorpus = pemetaBerkasKorpus([
  { judul: 'Batas Cemaran', rujukanSumber: 'Peraturan BPOM No. 1 Tahun 2020', urlSumber: 'https://a/2020', berkas: 'knowledge/a-2020.md' },
  { judul: 'Batas Cemaran', rujukanSumber: 'Peraturan BPOM No. 1 Tahun 2020', urlSumber: 'https://a/2024', berkas: 'knowledge/a-2024.md' },
  { judul: 'Adakah batasan isi bersih?', rujukanSumber: 'FAQ', urlSumber: 'https://faq/1', berkas: 'knowledge/faq-1.md' },
]);

test('req_7_1 materi korpus diindeks dari berkas yang tautan sumbernya sama', () => {
  assert.equal(berkasKorpus('Batas Cemaran', 'Peraturan BPOM No. 1 Tahun 2020', 'https://a/2024'), 'knowledge/a-2024.md');
});

test('req_7_1 materi korpus tanpa tautan sumber memakai satu-satunya dokumen senama', () => {
  assert.equal(berkasKorpus('Adakah  batasan isi bersih?', 'faq', null), 'knowledge/faq-1.md');
});

test('req_7_1 materi korpus yang berkasnya tidak bisa dipastikan tidak diindeks dari isinya', () => {
  assert.equal(berkasKorpus('Batas Cemaran', 'Peraturan BPOM No. 1 Tahun 2020', null), null);
  assert.equal(berkasKorpus('Adakah batasan isi bersih?', 'FAQ', 'https://faq/lama'), null);
});

test('req_7_1 materi di luar korpus tidak punya berkas', () => {
  assert.equal(berkasKorpus('Materi baru petugas', 'Surat Edaran', null), undefined);
});
