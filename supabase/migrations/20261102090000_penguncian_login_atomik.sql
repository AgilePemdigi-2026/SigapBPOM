-- UC-22 / REQ-3.5, NFR-11: slot percobaan login dipesan atomik di basis data sebelum password diperiksa,
-- agar percobaan paralel tidak bisa memeriksa lebih dari tiga password per akun.

-- Mengembalikan nomor percobaan (1 sampai c_batas_gagal_login), atau null bila akun sedang terkunci.
-- Reservasi terakhir langsung memasang kunci, sehingga slot tidak bisa dipesan lagi dan kunci tetap
-- berlaku walau proses login berhenti di tengah jalan; kunci habis sendiri setelah c_durasi_kunci.
-- Setelah kunci habis (atau bila kunci dilepas manual tanpa mereset penghitung), hitungan mulai dari 1.
create or replace function public.reservasi_percobaan_login(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- REQ-3.5, NFR-11: akun dikunci pada percobaan gagal ketiga. Harus sama dengan BATAS_GAGAL_LOGIN di
  -- supabase/functions/_shared/control/AutentikasiController.ts, yang memilih pesan terkunci.
  c_batas_gagal_login constant integer := 3;
  -- REQ-3.5: lama kunci akun, sama dengan DURASI_KUNCI_MENIT (15) di Edge Function login sebelumnya.
  c_durasi_kunci constant interval := interval '15 minutes';
  v_nomor integer;
begin
  update public.petugas p
  set gagal_login = case
        when p.terkunci_sampai is null and p.gagal_login < c_batas_gagal_login then p.gagal_login + 1
        else 1
      end,
      terkunci_sampai = case
        when p.terkunci_sampai is null and p.gagal_login + 1 = c_batas_gagal_login then now() + c_durasi_kunci
        else null
      end
  where p.id = p_id
    and (p.terkunci_sampai is null or p.terkunci_sampai <= now())
  returning p.gagal_login into v_nomor;

  return v_nomor;
end;
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
