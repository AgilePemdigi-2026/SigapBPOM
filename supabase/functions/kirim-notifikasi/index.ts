// Boundary: satu putaran antrean SMS (nomor tiket REQ-2.4/REQ-1.7, tindak lanjut T-F7.3-01/REQ-6.6).
// Dipicu pg_cron tiap menit lewat public.picu_kirim_notifikasi (migrasi 20261115100000), hanya bila ada antrean.
// POST {} -> { status, message, data: { diproses, terkirim, gagal } }
// Dipanggil server ke server (penjadwal atau backend dashboard sesudah tutup_tiket) dengan header x-sigap-kunci.
// Aman diulang: SMS yang sudah terkirim tidak dikirim lagi. Nomor telepon tidak pernah ada di respons.
import { PenyimpananNotifikasiSupabase } from '../_shared/adapter/penyimpananNotifikasiSupabase.ts';
import { buatPengirimSms } from '../_shared/adapter/sms.ts';
import { layani } from '../_shared/boundary/http.ts';
import { PenangananController } from '../_shared/control/PenangananController.ts';

const controller = new PenangananController(new PenyimpananNotifikasiSupabase(), buatPengirimSms(Deno.env.get('SMS_ADAPTER')));

layani(() => controller.kirimNotifikasi());
