// Boundary UC-01: Voice Gateway mencatat transkrip percakapan dan pemanggilan tool lokalnya (T-F1.1-05, NFR-20, T-F5.4-01).
// POST { aksi: 'ucapan', percakapanId, pembicara, teks } -> { urutan }
//   atau { aksi: 'tool', percakapanId, namaTool, durasiMs, berhasil } -> { tersimpan }
// Dipanggil dengan header x-sigap-kunci setelah baris percakapan dibuat laporan panggilan aktif pertama.
import { PenyimpananSupabase } from '../_shared/adapter/penyimpananSupabase.ts';
import { tanganiCatatPercakapan } from '../_shared/boundary/catatPercakapan.ts';
import { layani } from '../_shared/boundary/http.ts';
import { TranskripController } from '../_shared/control/TranskripController.ts';

const controller = new TranskripController(new PenyimpananSupabase());

layani((body) => tanganiCatatPercakapan(controller, body));
