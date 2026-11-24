// Uji kirim satu SMS lewat HP Android (sms-gate.app) sebelum mengisi secret Edge Function (SMS_ADAPTER=android).
// Isi SMSGATE_USERNAME dan SMSGATE_PASSWORD dari aplikasi di supabase/functions/.env (tidak di-commit), lalu dari akar repo:
//   node --env-file=supabase/functions/.env scripts/uji-sms-android.ts 08xxxxxxxxxx
// Kirim hanya ke nomor anggota tim atau penguji yang sudah setuju. Memakai adapter yang sama dengan kirim-notifikasi,
// jadi bila uji ini lolos, Edge Function dengan secret yang sama juga bisa mengirim.
import { buatPengirimSms } from '../supabase/functions/_shared/adapter/sms.ts';
import { normalkanNomorTelepon, samarkanNomorTelepon } from '../supabase/functions/_shared/entity/penelepon.ts';

const nomor = normalkanNomorTelepon(process.argv[2] ?? '');
if (!nomor) {
  console.error('Pakai: node --env-file=supabase/functions/.env scripts/uji-sms-android.ts 08xxxxxxxxxx');
  process.exit(1);
}

try {
  const pengirim = buatPengirimSms('android', (nama) => process.env[nama]);
  await pengirim.kirim(nomor, 'Uji SMS SIGAP: jalur SMS Gateway Android tersambung.');
  console.log(`Masuk antrean HP untuk ${samarkanNomorTelepon(nomor)}. Cek status kirimnya di aplikasi SMS Gateway.`);
} catch (e) {
  console.error(`Gagal: ${(e as Error).message}`);
  process.exit(1);
}
