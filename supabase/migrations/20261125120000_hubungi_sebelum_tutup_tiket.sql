-- Hubungi pelapor sebelum tutup tiket (ADR 0006). Dengan SMS, Tutup Tiket dan pengiriman tindak lanjut terjadi dalam
-- satu langkah. Dengan WhatsApp manual keduanya terpisah, jadi urutannya dibalik agar status Selesai berarti pelapor
-- sudah menerima tanggapan resmi:
--   Tanggapan Disusun -> petugas mengirim tanggapan lewat WhatsApp/telepon -> Tandai sudah dihubungi -> Tutup Tiket.
-- 1. tandai_sudah_dihubungi: pengaduan boleh ditandai sejak Tanggapan Disusun.
-- 2. tutup_tiket: menolak tiket yang pelapornya belum dihubungi (SGHUB). Baris tindak_lanjut dibuat saat ditandai,
--    jadi tutup_tiket tidak lagi mengantrekannya.

-- 1.
create or replace function public.tandai_sudah_dihubungi(p_no_tiket text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiket_id uuid;
  v_jenis public.jenis_tiket;
  v_status public.status_tiket;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menandai kontak pelapor' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  select id, jenis, status into v_tiket_id, v_jenis, v_status
  from public.tiket
  where no_tiket = btrim(p_no_tiket)
  for update;

  if not found then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  -- Pengaduan: pelapor dihubungi setelah tanggapan resmi tersimpan (BR-2), sebelum tiket ditutup. Tiket selesai
  -- yang ditutup sebelum aturan ini tetap boleh ditandai.
  if v_jenis = 'pengaduan' and v_status not in ('tanggapan_disusun', 'selesai') then
    raise exception 'Tiket % belum punya tanggapan resmi', p_no_tiket using errcode = '55000';
  end if;

  -- Eskalasi: jawaban disampaikan saat petugas menghubungi, jadi tiketnya selesai (tgl_selesai diisi trigger).
  if v_jenis = 'eskalasi' and v_status <> 'selesai' then
    update public.tiket set status = 'selesai' where id = v_tiket_id;
  end if;

  insert into public.notifikasi (tiket_id, jenis, status_kirim, tgl_kirim, dihubungi_oleh)
  values (v_tiket_id, 'tindak_lanjut', 'terkirim', now(), auth.uid())
  on conflict (tiket_id, jenis) do update
     set status_kirim = 'terkirim', tgl_kirim = excluded.tgl_kirim, dihubungi_oleh = excluded.dihubungi_oleh
   where public.notifikasi.status_kirim <> 'terkirim';

  return public.ambil_kontak_pelapor(p_no_tiket);
end;
$$;

-- 2. Sama dengan migrasi 20261117100000 selain syarat sudah dihubungi.
create or replace function public.tutup_tiket(
  p_no_tiket text
)
returns public.status_tiket
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiket_id uuid;
  v_status_sekarang public.status_tiket;
  v_jenis public.jenis_tiket;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menutup tiket' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  select id, status, jenis into v_tiket_id, v_status_sekarang, v_jenis
  from public.tiket
  where no_tiket = btrim(p_no_tiket) or id::text = btrim(p_no_tiket)
  for update;

  if not found then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  -- UC-06 hanya untuk tiket pengaduan; tiket eskalasi ditangani lewat antrean Tiket Eskalasi (UC-04).
  if v_jenis <> 'pengaduan' then
    raise exception 'Tiket % bukan tiket pengaduan', p_no_tiket using errcode = 'SG409';
  end if;

  -- Idempoten: tiket sudah selesai
  if v_status_sekarang = 'selesai' then
    return 'selesai'::public.status_tiket;
  end if;

  if v_status_sekarang = 'diteruskan' then
    raise exception 'Tiket % sudah diteruskan ke instansi lain', p_no_tiket using errcode = 'SG409';
  end if;

  -- REQ-6.5, BR-2: hanya tiket yang tanggapannya sudah tersimpan (status Tanggapan Disusun) yang dapat ditutup.
  if v_status_sekarang <> 'tanggapan_disusun' then
    raise exception 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.' using errcode = 'SGBR2';
  end if;

  -- Pelapor harus sudah menerima tanggapan lewat WhatsApp atau telepon sebelum tiket ditutup (ADR 0006).
  if not exists (
    select 1 from public.notifikasi n
    where n.tiket_id = v_tiket_id and n.jenis = 'tindak_lanjut' and n.status_kirim = 'terkirim'
  ) then
    raise exception 'Tiket tidak dapat ditutup. Hubungi pelapor terlebih dahulu.' using errcode = 'SGHUB';
  end if;

  -- tgl_selesai diisi trigger tiket_isi_tgl_selesai.
  update public.tiket set status = 'selesai' where id = v_tiket_id;

  return 'selesai'::public.status_tiket;
end;
$$;
