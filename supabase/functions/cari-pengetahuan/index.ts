// Boundary UC-01: tool `cari_basis_pengetahuan` untuk Hermes Agent (T-F1.3-02, REQ-1.4).
// POST { pertanyaan } -> { status, message, data: { potongan: { teks, judul, rujukanSumber, skor }[] } }
import { buatAdapterCekBpom } from '../_shared/adapter/cekbpom.ts';
import { buatPenyediaEmbedding } from '../_shared/adapter/embedding.ts';
import { PenyimpananSupabase } from '../_shared/adapter/penyimpananSupabase.ts';
import { layani } from '../_shared/boundary/http.ts';
import { InformasiProdukController } from '../_shared/control/InformasiProdukController.ts';

const controller = new InformasiProdukController(
  buatAdapterCekBpom(Deno.env.get('CEKBPOM_ADAPTER')),
  new PenyimpananSupabase(),
  undefined,
  buatPenyediaEmbedding(Deno.env.get('EMBEDDING_PROVIDER')),
);

layani((body) => controller.cariPengetahuan(body));

