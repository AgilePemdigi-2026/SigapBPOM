-- Tindak lanjut lewat WhatsApp manual dari dashboard, menggantikan SMS Gateway (ADR 0006, menunggu persetujuan PO).
--
-- 1. Jalur SMS otomatis dimatikan: jadwal pg_cron, trigger SMS nomor tiket (nomor tiket sudah dibacakan per digit di
--    telepon), dan RPC antrean milik Edge Function kirim-notifikasi yang ikut dihapus.
-- 2. Tabel notifikasi dipakai ulang sebagai catatan kontak tindak lanjut: tertunda = belum dihubungi,
--    terkirim = sudah dihubungi (tgl_kirim = waktu dihubungi, dihubungi_oleh = petugas). tutup_tiket tetap
--    mengantrekan baris tindak_lanjut seperti sebelumnya.
-- 3. ambil_kontak_pelapor: nomor telepon lengkap pelapor untuk halaman detail tiket, khusus petugas. Ini satu-satunya
--    pengecualian PROJECT_RULES 5.5 (ADR 0006); transkrip, riwayat, dan panggilan berjalan tetap disamarkan (NFR-13).
-- 4. tandai_sudah_dihubungi: ADU hanya setelah ditutup; ESK langsung selesai karena jawabannya disampaikan lewat
--    WhatsApp atau telepon.
-- 5. View detail_pengaduan_tiket mendapat kolom sudah_dihubungi untuk tanda "Belum dihubungi" di Daftar Pengaduan.

-- 1. Matikan jalur SMS.
select cron.unschedule(jobid) from cron.job where jobname = 'kirim-notifikasi-sms';

drop trigger if exists antrekan_sms_nomor_tiket on public.tiket;
drop function if exists public.antrekan_sms_nomor_tiket();
drop function if exists public.picu_kirim_notifikasi();
drop function if exists public.klaim_notifikasi_tertunda(int, int);
drop function if exists public.catat_hasil_notifikasi(uuid, boolean, text, text);

-- SMS nomor tiket yang belum pernah terkirim tidak lagi punya arti. Nilai enum nomor_tiket dibiarkan (Postgres tidak
-- bisa menghapus nilai enum tanpa membuat ulang tipenya).
delete from public.notifikasi where jenis = 'nomor_tiket';

-- Baris tindak lanjut yang tertahan di tengah pengiriman SMS kembali menjadi belum dihubungi.
update public.notifikasi
   set status_kirim = 'tertunda', diklaim_pada = null
 where jenis = 'tindak_lanjut' and status_kirim in ('mengirim', 'gagal');

-- 2. Siapa yang menghubungi pelapor.
alter table public.notifikasi
  add column if not exists dihubungi_oleh uuid references auth.users (id) on delete set null;

comment on table public.notifikasi is
  'Catatan kontak tindak lanjut ke pelapor (ADR 0006): tertunda = belum dihubungi, terkirim = sudah dihubungi lewat WhatsApp atau telepon.';

-- 3. Nomor lengkap dan status kontak untuk satu tiket.
create or replace function public.ambil_kontak_pelapor(p_no_tiket text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kontak record;
  v_notifikasi record;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca kontak pelapor' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  -- Nomor di register pengaduan didahulukan, lalu nomor penelepon percakapan tiket (urutan klaim SMS lama).
  select t.id as tiket_id, coalesce(nullif(btrim(p.nomor_telepon), ''), pl.no_telp) as no_telp
    into v_kontak
  from public.tiket t
  left join public.pengaduan p on p.tiket_id = t.id
  left join public.percakapan c on c.id = t.percakapan_id
  left join public.penelepon pl on pl.id = c.penelepon_id
  where t.no_tiket = btrim(p_no_tiket)
  limit 1;
  if not found then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  select n.status_kirim, n.tgl_kirim into v_notifikasi
  from public.notifikasi n
  where n.tiket_id = v_kontak.tiket_id and n.jenis = 'tindak_lanjut';

  return jsonb_build_object(
    'no_telp', v_kontak.no_telp,
    'sudah_dihubungi', coalesce(v_notifikasi.status_kirim = 'terkirim', false),
    'dihubungi_pada', v_notifikasi.tgl_kirim
  );
end;
$$;

revoke execute on function public.ambil_kontak_pelapor(text) from public, anon;
grant execute on function public.ambil_kontak_pelapor(text) to authenticated, service_role;

-- 4. Petugas menandai pelapor sudah dihubungi. Idempoten: menandai ulang tidak mengubah waktu dan petugas pertama.
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

  -- Pengaduan: tindak lanjut baru ada setelah tanggapan resmi dan tiket ditutup (REQ-6.6, BR-2).
  if v_jenis = 'pengaduan' and v_status <> 'selesai' then
    raise exception 'Tiket % belum ditutup', p_no_tiket using errcode = '55000';
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

revoke execute on function public.tandai_sudah_dihubungi(text) from public, anon;
grant execute on function public.tandai_sudah_dihubungi(text) to authenticated, service_role;

-- 5. Detail pengaduan (20261104090300) ditambah kolom sudah_dihubungi di akhir; kolom lain tidak berubah.
create or replace view public.detail_pengaduan_tiket as
select
  t.id as tiket_id,
  t.no_tiket,
  t.jenis as jenis_tiket,
  t.status as status_tiket,
  t.ringkasan,
  t.tgl_terbit,
  t.percakapan_id,
  pg.id as pengaduan_id,
  pg.nama_produk,
  pg.nama_produk_diadukan,
  public.samarkan_teks_pelapor(pg.kronologi, pg.nama_pelapor) as kronologi,
  pg.kelengkapan,
  pg.tgl_pengaduan,
  coalesce(
    pt.nama_pelapor,
    case
      when pg.nama_pelapor is not null and length(trim(pg.nama_pelapor)) > 0
        then left(trim(pg.nama_pelapor), 1) || '***'
      else null
    end
  ) as nama_pelapor_tersamar,
  coalesce(
    pt.no_telp,
    case
      when pg.nomor_telepon is not null and length(trim(pg.nomor_telepon)) >= 8
        then left(trim(pg.nomor_telepon), 4) || repeat('*', length(trim(pg.nomor_telepon)) - 8) || right(trim(pg.nomor_telepon), 4)
      else null
    end
  ) as no_telp_tersamar,
  exists (
    select 1 from public.notifikasi n
    where n.tiket_id = t.id and n.jenis = 'tindak_lanjut' and n.status_kirim = 'terkirim'
  ) as sudah_dihubungi
from public.tiket t
left join public.pengaduan pg on pg.tiket_id = t.id or pg.percakapan_id = t.percakapan_id
left join public.percakapan p on p.id = t.percakapan_id
left join public.penelepon_tersamar pt on pt.id = p.penelepon_id
where (select public.is_petugas());
