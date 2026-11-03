// Boundary UC-04: memilih metode controller panggilan aktif dari `aksi` (T-F5.2-02, REQ-4.2).
// Tanpa API Deno agar jalur gagalnya bisa diuji dengan `node --test`.
import { ErrorSigap } from '../control/InformasiProdukController.ts';
import type { PemantauanLayananController } from '../control/PemantauanLayananController.ts';

export async function tanganiPanggilanAktif(controller: PemantauanLayananController, body: Record<string, unknown>) {
  if (body.aksi === 'laporkan') return await controller.laporkanPanggilanAktif(body);
  if (body.aksi === 'akhiri') return await controller.akhiriPanggilanAktif(body);
  throw new ErrorSigap(422, 'Aksi tidak dikenal.');
}
