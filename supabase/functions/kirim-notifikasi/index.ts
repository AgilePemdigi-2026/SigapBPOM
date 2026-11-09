// Boundary UC-06: satu putaran antrean SMS tindak lanjut untuk tiket yang ditutup (T-F7.3-01, REQ-6.6).
// POST {} -> { status, message, data: { diproses, terkirim, gagal } }
// Dipanggil server ke server (penjadwal atau backend dashboard sesudah tutup_tiket) dengan header x-sigap-kunci.
// Aman diulang: SMS yang sudah terkirim tidak dikirim lagi. Nomor telepon tidak pernah ada di respons.
import { PenyimpananNotifikasiSupabase } from '../_shared/adapter/penyimpananNotifikasiSupabase.ts';
import { buatPengirimSms } from '../_shared/adapter/sms.ts';
import { layani } from '../_shared/boundary/http.ts';
import { PenangananController } from '../_shared/control/PenangananController.ts';

const controller = new PenangananController(new PenyimpananNotifikasiSupabase(), buatPengirimSms(Deno.env.get('SMS_ADAPTER')));

layani(() => controller.kirimNotifikasiTindakLanjut());
