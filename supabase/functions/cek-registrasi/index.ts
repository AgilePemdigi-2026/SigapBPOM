// Boundary UC-01: tool `cek_registrasi_bpom` untuk Hermes Agent (T-F1.2-02, REQ-1.3).
// POST { namaProduk, percakapanId? } -> { status, message, data: { hasil: Produk[] } }
import { buatAdapterCekBpom } from '../_shared/adapter/cekbpom.ts';
import { PenyimpananSupabase } from '../_shared/adapter/penyimpananSupabase.ts';
import { layani } from '../_shared/boundary/http.ts';
import { InformasiProdukController } from '../_shared/control/InformasiProdukController.ts';

const controller = new InformasiProdukController(buatAdapterCekBpom(Deno.env.get('CEKBPOM_ADAPTER')), new PenyimpananSupabase());

layani((body) => controller.cekRegistrasi(body));
