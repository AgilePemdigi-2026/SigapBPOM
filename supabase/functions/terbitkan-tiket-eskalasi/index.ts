// Boundary UC-01: tool `terbitkan_tiket_eskalasi` untuk Hermes Agent (T-F1.4-02, REQ-1.7).
// POST { percakapanId, nomorTelepon, pertanyaan } -> { status, message, data: { nomorTiket } }
// Nomor telepon tidak pernah dikembalikan ke klien.
import { buatAdapterCekBpom } from '../_shared/adapter/cekbpom.ts';
import { PenyimpananSupabase } from '../_shared/adapter/penyimpananSupabase.ts';
import { layani } from '../_shared/boundary/http.ts';
import { InformasiProdukController } from '../_shared/control/InformasiProdukController.ts';

const controller = new InformasiProdukController(buatAdapterCekBpom(Deno.env.get('CEKBPOM_ADAPTER')), new PenyimpananSupabase());

layani((body) => controller.terbitkanTiketEskalasi(body));
