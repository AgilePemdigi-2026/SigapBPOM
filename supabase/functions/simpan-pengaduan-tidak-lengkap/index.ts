// Boundary UC-02: simpan pengaduan yang berakhir sebelum data lengkap (T-F4.3-01, REQ-2.5).
// POST { percakapanId, namaProduk?, kronologi?, namaPelapor?, nomorTelepon? } -> { status, message, data: { id, status } }
// Status percakapan menjadi pengaduan_tidak_lengkap dan tidak ada nomor tiket. Dipanggil dengan header x-sigap-kunci.
import { PenyimpananSupabase } from '../_shared/adapter/penyimpananSupabase.ts';
import { layani } from '../_shared/boundary/http.ts';
import { PengaduanController } from '../_shared/control/PengaduanController.ts';

const controller = new PengaduanController(new PenyimpananSupabase());

layani((body) => controller.simpanPengaduanTidakLengkap(body));
