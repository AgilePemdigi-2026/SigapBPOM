-- UC-22 / REQ-3.5, NFR-11: slot percobaan login dipesan atomik di basis data sebelum password diperiksa,
-- agar percobaan paralel tidak bisa memeriksa lebih dari tiga password per akun.
-- Ambang (3 kali, BATAS_GAGAL_LOGIN di AutentikasiController) dan durasi kunci (15 menit) sama dengan
-- nilai sebelumnya di Edge Function login.

-- Mengembalikan nomor percobaan (1 sampai 3), atau null bila akun sedang terkunci.
-- Reservasi ketiga langsung memasang kunci, sehingga slot tidak bisa dipesan lagi dan kunci tetap
-- berlaku walau proses login berhenti di tengah jalan; kunci habis sendiri setelah 15 menit.
-- Setelah kunci habis (atau bila kunci dilepas manual tanpa mereset penghitung), hitungan mulai dari 1.
create or replace function public.reservasi_percobaan_login(p_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.petugas p
  set gagal_login = case
        when p.terkunci_sampai is null and p.gagal_login < 3 then p.gagal_login + 1
        else 1
      end,
      terkunci_sampai = case
        when p.terkunci_sampai is null and p.gagal_login + 1 = 3 then now() + interval '15 minutes'
        else null
      end
  where p.id = p_id
    and (p.terkunci_sampai is null or p.terkunci_sampai <= now())
  returning p.gagal_login;
$$;

-- Dipanggil hanya setelah pemegang slot memasukkan password yang benar. Kunci yang dipasang reservasi
-- ketiga ikut dilepas, karena password benar itu termasuk dalam tiga percobaan yang diizinkan.
create or replace function public.reset_gagal_login(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.petugas
  set gagal_login = 0,
      terkunci_sampai = null
  where id = p_id;
$$;

revoke execute on function public.reservasi_percobaan_login(uuid) from public, anon, authenticated;
grant execute on function public.reservasi_percobaan_login(uuid) to service_role;
revoke execute on function public.reset_gagal_login(uuid) from public, anon, authenticated;
grant execute on function public.reset_gagal_login(uuid) to service_role;
