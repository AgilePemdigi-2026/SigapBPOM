// Uji integrasi Edge Function login sungguhan (`supabase start`, `supabase db reset`, lalu
// `supabase functions serve login --no-verify-jwt`). Dilewati bila SIGAP_UJI_FUNGSI_LOGIN tidak diisi, karena CI
// belum menjalankan Supabase. Tes ini mengubah penghitung gagal akun seed, jadi pakai akun uji saja. Contoh:
//   SIGAP_UJI_FUNGSI_LOGIN=1 SIGAP_UJI_SUPABASE_URL=http://127.0.0.1:54321 SIGAP_UJI_KUNCI_PUBLIK=<anon key> \
//   SIGAP_UJI_EMAIL=<email seed> SIGAP_UJI_PASSWORD=<password seed> npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  SIGAP_UJI_FUNGSI_LOGIN: aktif = '',
  SIGAP_UJI_SUPABASE_URL: url = '',
  SIGAP_UJI_KUNCI_PUBLIK: kunciPublik = '',
  SIGAP_UJI_EMAIL: email = '',
  SIGAP_UJI_PASSWORD: password = '',
} = process.env;
const lewati = !(aktif && url && kunciPublik && email && password) && 'butuh fungsi login lokal dan variabel SIGAP_UJI_*';

async function masuk(kataSandi: string) {
  const res = await fetch(`${url}/functions/v1/login`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kunciPublik}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: kataSandi }),
  });
  return { status: res.status, isi: (await res.json()) as { sukses: boolean; pesan: string } };
}

test('req_3_5 fungsi login: password benar diterima dan mereset penghitung gagal', { skip: lewati }, async () => {
  const benar = await masuk(password);
  assert.equal(benar.status, 200, benar.isi.pesan);
  assert.equal(benar.isi.pesan, 'Login berhasil!');

  // Dua kali salah lalu benar: bila reset tidak jalan, kegagalan berikutnya menjadi yang ketiga dan mengunci akun.
  for (let i = 0; i < 2; i++) assert.equal((await masuk('salahpassword')).status, 401);
  assert.equal((await masuk(password)).status, 200, 'login benar setelah dua kali salah');
  const salah = await masuk('salahpassword');
  assert.equal(salah.isi.pesan, 'Login gagal. Email atau password Anda salah.', 'penghitung gagal sudah direset');
  assert.equal((await masuk(password)).status, 200, 'reset lagi untuk tes berikutnya');
});
// Penguncian setelah tiga kali gagal diuji di pgTAP reservasi_percobaan_login, supaya tes ini bisa diulang
// tanpa meninggalkan akun seed terkunci 15 menit.
