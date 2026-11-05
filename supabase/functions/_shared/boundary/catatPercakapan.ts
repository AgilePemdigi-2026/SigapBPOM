// Boundary UC-01: memilih metode controller pencatatan percakapan dari `aksi` (T-F1.1-05, NFR-20, T-F5.4-01).
// Tanpa API Deno agar jalur gagalnya bisa diuji dengan `node --test`.
import { ErrorSigap } from '../control/InformasiProdukController.ts';
import type { TranskripController } from '../control/TranskripController.ts';

export async function tanganiCatatPercakapan(controller: TranskripController, body: Record<string, unknown>) {
  if (body.aksi === 'ucapan') return await controller.simpanUcapan(body);
  if (body.aksi === 'tool') return await controller.catatPemanggilanTool(body);
  if (body.aksi === 'ringkasan') return await controller.simpanRingkasan(body);
  throw new ErrorSigap(422, 'Aksi tidak dikenal.');
}
