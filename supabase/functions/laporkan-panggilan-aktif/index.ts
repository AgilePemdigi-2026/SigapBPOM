// Boundary UC-04: Voice Gateway melaporkan panggilan aktif dan heartbeat (T-F5.2-02, REQ-4.2).
// POST { aksi: 'laporkan', percakapanId, jenisLayanan?, topik?, tahap? } atau { aksi: 'akhiri', percakapanId }
// -> { status, message, data }. Tidak ada transkrip atau nomor telepon dalam permintaan maupun respons.
import { PenyimpananPemantauanSupabase } from '../_shared/adapter/penyimpananPemantauanSupabase.ts';
import { layani } from '../_shared/boundary/http.ts';
import { tanganiPanggilanAktif } from '../_shared/boundary/panggilanAktif.ts';
import { PemantauanLayananController } from '../_shared/control/PemantauanLayananController.ts';

const controller = new PemantauanLayananController(new PenyimpananPemantauanSupabase());

layani((body) => tanganiPanggilanAktif(controller, body));
