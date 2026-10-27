import assert from 'node:assert/strict';
import test from 'node:test';
import { BasisPengetahuanController, type MateriPengetahuan, type PenyimpananBasisPengetahuan } from './BasisPengetahuanController.ts';

const MATERI_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PETUGAS_ID = '11111111-1111-1111-1111-111111111111';

class PenyimpananBasisPengetahuanTiruan implements PenyimpananBasisPengetahuan {
  pemanggilan: { materiId: string; petugasId: string }[] = [];

  async daftar(): Promise<MateriPengetahuan[]> {
    return [];
  }

  async nonaktifkan(materiId: string, petugasId: string): Promise<void> {
    this.pemanggilan.push({ materiId, petugasId });
  }
}

test('nonaktifkan meneruskan materi dan petugas tervalidasi ke penyimpanan', async () => {
  const penyimpanan = new PenyimpananBasisPengetahuanTiruan();
  const controller = new BasisPengetahuanController(penyimpanan);

  await controller.nonaktifkan({ materiId: MATERI_ID, petugasId: PETUGAS_ID });

  assert.deepEqual(penyimpanan.pemanggilan, [{ materiId: MATERI_ID, petugasId: PETUGAS_ID }]);
});

test('nonaktifkan menolak ID materi yang bukan UUID sebelum menyentuh penyimpanan', async () => {
  const penyimpanan = new PenyimpananBasisPengetahuanTiruan();
  const controller = new BasisPengetahuanController(penyimpanan);

  await assert.rejects(controller.nonaktifkan({ materiId: 7, petugasId: PETUGAS_ID }), { status: 422 });
  assert.deepEqual(penyimpanan.pemanggilan, []);
});

test('nonaktifkan menolak sesi tanpa identitas petugas valid', async () => {
  const penyimpanan = new PenyimpananBasisPengetahuanTiruan();
  const controller = new BasisPengetahuanController(penyimpanan);

  await assert.rejects(controller.nonaktifkan({ materiId: MATERI_ID }), { status: 403 });
  assert.deepEqual(penyimpanan.pemanggilan, []);
});