import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIMENSI_EMBEDDING,
  PenyediaEmbeddingTiruan,
  buatPenyediaEmbedding,
  buatVektorTiruan,
} from './embedding.ts';

test('buatVektorTiruan menghasilkan vektor berdimensi 1536 dengan norma L2 mendekati 1', () => {
  const v = buatVektorTiruan('syarat izin edar suplemen');
  assert.equal(v.length, DIMENSI_EMBEDDING);
  const normaKuadrat = v.reduce((sum, x) => sum + x * x, 0);
  assert.ok(Math.abs(normaKuadrat - 1.0) < 0.01, `Norma harus mendekati 1, didapat: ${normaKuadrat}`);
});

test('buatVektorTiruan teks serupa menghasilkan kemiripan kosinus tinggi', () => {
  const v1 = buatVektorTiruan('syarat pendaftaran izin edar suplemen');
  const v2 = buatVektorTiruan('ketentuan izin edar suplemen kesehatan');
  let kosinus = 0;
  for (let i = 0; i < DIMENSI_EMBEDDING; i++) kosinus += v1[i] * v2[i];
  assert.ok(kosinus >= 0.5, `Kemiripan harus >= 0.5, didapat: ${kosinus}`);
});

test('buatVektorTiruan teks berbeda topik menghasilkan kemiripan kosinus rendah atau 0', () => {
  const v1 = buatVektorTiruan('syarat izin edar suplemen');
  const v2 = buatVektorTiruan('resep masakan rendang padang');
  let kosinus = 0;
  for (let i = 0; i < DIMENSI_EMBEDDING; i++) kosinus += v1[i] * v2[i];
  assert.ok(kosinus < 0.2, `Kemiripan teks tidak berhubungan harus < 0.2, didapat: ${kosinus}`);
});

test('buatVektorTiruan teks kosong mengembalikan vektor satuan fallback', () => {
  const v = buatVektorTiruan('');
  assert.equal(v.length, DIMENSI_EMBEDDING);
  assert.equal(v[0], 1);
});

test('PenyediaEmbeddingTiruan memakai vektor kustom bila tersedia', async () => {
  const kustom = new Array(DIMENSI_EMBEDDING).fill(0.5);
  const p = new PenyediaEmbeddingTiruan({ khusus: kustom });
  const hasil = await p.buatEmbedding('khusus');
  assert.deepEqual(hasil, kustom);
});

test('buatPenyediaEmbedding mengembalikan instance PenyediaEmbedding', async () => {
  const p = buatPenyediaEmbedding();
  const v = await p.buatEmbedding('uji coba');
  assert.equal(v.length, DIMENSI_EMBEDDING);
});

