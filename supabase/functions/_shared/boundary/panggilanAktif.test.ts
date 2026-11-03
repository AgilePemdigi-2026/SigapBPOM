import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PemantauanLayananController } from '../control/PemantauanLayananController.ts';
import { tanganiPanggilanAktif } from './panggilanAktif.ts';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

test('req_4_2 aksi laporkan dan akhiri diteruskan, aksi lain ditolak 422', async () => {
  const tulis: string[] = [];
  const c = new PemantauanLayananController({
    async laporkanPanggilanAktif() { tulis.push('laporkan'); },
    async akhiriPanggilanAktif() { tulis.push('akhiri'); return true; },
  });
  assert.deepEqual(await tanganiPanggilanAktif(c, { aksi: 'laporkan', percakapanId: ID }), { tersimpan: true });
  assert.deepEqual(await tanganiPanggilanAktif(c, { aksi: 'akhiri', percakapanId: ID }), { ditutup: true });
  for (const aksi of ['hapus', undefined]) {
    await assert.rejects(() => tanganiPanggilanAktif(c, { aksi, percakapanId: ID }), (e: { status?: number }) => e.status === 422);
  }
  assert.deepEqual(tulis, ['laporkan', 'akhiri']);
});
