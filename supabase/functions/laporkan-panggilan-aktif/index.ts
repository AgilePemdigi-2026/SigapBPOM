// Boundary UC-04: Voice Gateway melaporkan panggilan aktif dan heartbeat (T-F5.2-02, REQ-4.2).
// POST { aksi: 'laporkan', percakapanId, jenisLayanan?, topik?, tahap? } atau { aksi: 'akhiri', percakapanId }
// -> { status, message, data }. Tidak ada transkrip atau nomor telepon dalam permintaan maupun respons.
import { PenyimpananPemantauanSupabase } from '../_shared/adapter/penyimpananPemantauanSupabase.ts';
import { layani } from '../_shared/boundary/http.ts';
import { ErrorSigap } from '../_shared/control/InformasiProdukController.ts';
import { PemantauanLayananController } from '../_shared/control/PemantauanLayananController.ts';

const controller = new PemantauanLayananController(new PenyimpananPemantauanSupabase());

layani(async (body) => {
  if (body.aksi === 'laporkan') return await controller.laporkanPanggilanAktif(body);
  if (body.aksi === 'akhiri') return await controller.akhiriPanggilanAktif(body);
  throw new ErrorSigap(422, 'Aksi tidak dikenal.');
});
