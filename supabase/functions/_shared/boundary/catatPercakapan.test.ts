import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TranskripController } from '../control/TranskripController.ts';
import { tanganiCatatPercakapan } from './catatPercakapan.ts';

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

test('nfr_20 aksi ucapan, tool, dan ringkasan diteruskan, aksi lain ditolak 422', async () => {
  const tulis: string[] = [];
  const c = new TranskripController({
    async catatUcapan() { tulis.push('ucapan'); return 1; },
    async catatLogTool() { tulis.push('tool'); },
    async simpanRingkasan() { tulis.push('ringkasan'); },
  });
  assert.deepEqual(await tanganiCatatPercakapan(c, { aksi: 'ucapan', percakapanId: ID, pembicara: 'penelepon', teks: 'halo' }), { urutan: 1 });
  assert.deepEqual(
    await tanganiCatatPercakapan(c, { aksi: 'tool', percakapanId: ID, namaTool: 'cek_registrasi_bpom', durasiMs: 5, berhasil: true }),
    { tersimpan: true },
  );
  assert.deepEqual(await tanganiCatatPercakapan(c, { aksi: 'ringkasan', percakapanId: ID, ringkasan: 'Penelepon menanyakan izin edar.' }), { tersimpan: true });
  for (const aksi of ['hapus', undefined]) {
    await assert.rejects(() => tanganiCatatPercakapan(c, { aksi, percakapanId: ID }), (e: { status?: number }) => e.status === 422);
  }
  assert.deepEqual(tulis, ['ucapan', 'tool', 'ringkasan']);
});
