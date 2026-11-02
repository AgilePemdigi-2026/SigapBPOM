// Boundary UC-02: tool `terbitkan_tiket_pengaduan` untuk Voice Gateway (T-F4.2-02, REQ-2.3, BR-1).
// POST { percakapanId, namaProduk, kronologi, namaPelapor, nomorTelepon, ringkasan? } -> { status, message, data: { nomorTiket } }
// Dipanggil dengan header x-sigap-kunci; service role hanya dipakai di sisi server ini. Retry untuk percakapan yang sama
// mengembalikan nomor tiket yang sama. Data pelapor tidak pernah dikembalikan ke klien.
import { PenyimpananSupabase } from '../_shared/adapter/penyimpananSupabase.ts';
import { layani } from '../_shared/boundary/http.ts';
import { PengaduanController } from '../_shared/control/PengaduanController.ts';

const controller = new PengaduanController(new PenyimpananSupabase());

layani((body) => controller.terbitkanTiketPengaduan(body));
