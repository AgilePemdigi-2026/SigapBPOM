import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTOH_PANGGILAN, ringkasPanggilan } from './ringkasPanggilan.ts';

test('req_4_2 seribu panggilan diringkas: total dan jumlah per tahap utuh, contoh dibatasi', () => {
  const tahap = ['Mendengar', 'Memproses', 'Menjawab'];
  const daftar = Array.from({ length: 1000 }, (_, i) => ({ id: `p-${i}`, tahap: tahap[i % 3] }));
  const { panggilan, ringkasan } = ringkasPanggilan(daftar);
  assert.equal(panggilan?.length, CONTOH_PANGGILAN);
  assert.deepEqual(panggilan?.map((p) => p.id), daftar.slice(0, CONTOH_PANGGILAN).map((p) => p.id));
  assert.deepEqual(ringkasan, { total: 1000, perTahap: { Mendengar: 334, Memproses: 333, Menjawab: 333 } });
});

test('req_4_2 daftar yang gagal dibaca tetap null, daftar kosong bertotal nol', () => {
  assert.deepEqual(ringkasPanggilan(null), { panggilan: null, ringkasan: null });
  assert.deepEqual(ringkasPanggilan([]), { panggilan: [], ringkasan: { total: 0, perTahap: {} } });
});
