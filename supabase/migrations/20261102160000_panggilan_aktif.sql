-- Entity UC-04: panggilan aktif yang dilaporkan Voice Gateway (T-F5.2-02, REQ-4.2).
-- Gateway mengirim tahap pemrosesan AI dan heartbeat berkala lewat Edge Function (service_role).
-- Panggilan yang heartbeat-nya berhenti tidak tampil di daftar aktif dan ditutup otomatis (tidak ada panggilan yatim).
-- Tidak menyimpan transkrip atau nomor telepon baru: nomor hanya tampil tersamar lewat penelepon_tersamar.

alter table public.percakapan add column if not exists heartbeat_terakhir timestamptz;

-- Tahap pemrosesan AI: tipe tertutup (PROJECT_RULES 4.2). NOT VALID agar baris lama tidak dipindai.
alter table public.percakapan drop constraint if exists percakapan_tahap_ai_check;
alter table public.percakapan add constraint percakapan_tahap_ai_check
  check (tahap_ai is null or tahap_ai in ('mendengar', 'memproses', 'menjawab')) not valid;

create index if not exists percakapan_berjalan_heartbeat_idx
  on public.percakapan (heartbeat_terakhir) where status_penyelesaian = 'berjalan';

-- Satu sumber untuk batas heartbeat: gateway mengirim tiap 15 detik, batas dibuat 4x lipatnya.
create or replace function public.batas_heartbeat_panggilan()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '60 seconds' $$;

-- Tutup panggilan berjalan yang heartbeat-nya sudah lewat batas. Mengembalikan jumlah yang ditutup.
create or replace function public.tutup_panggilan_yatim()
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_jumlah int;
begin
  update public.percakapan
     set status_penyelesaian = 'selesai_ai',
         waktu_selesai = greatest(coalesce(heartbeat_terakhir, waktu_mulai), waktu_mulai),
         tahap_ai = null
   where status_penyelesaian = 'berjalan'
     and coalesce(heartbeat_terakhir, waktu_mulai) < now() - public.batas_heartbeat_panggilan();
  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end;
$$;

-- Catat atau perbarui panggilan berjalan: membuat baris bila belum ada, memperbarui tahap dan heartbeat bila ada.
-- Panggilan yang sudah selesai tidak dibuka lagi. Nilai null berarti "tidak berubah".
create or replace function public.laporkan_panggilan_aktif(
  p_percakapan_id uuid,
  p_jenis_interaksi public.jenis_interaksi default null,
  p_topik text default null,
  p_tahap text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_tahap is not null and p_tahap not in ('mendengar', 'memproses', 'menjawab') then
    raise exception 'tahap % tidak dikenal', p_tahap using errcode = '22023';
  end if;

  insert into public.percakapan as c (id, jenis_interaksi, topik, tahap_ai, heartbeat_terakhir)
  values (p_percakapan_id, p_jenis_interaksi, left(nullif(trim(p_topik), ''), 80), p_tahap, now())
  on conflict (id) do update
     set jenis_interaksi = coalesce(excluded.jenis_interaksi, c.jenis_interaksi),
         topik = coalesce(excluded.topik, c.topik),
         tahap_ai = coalesce(excluded.tahap_ai, c.tahap_ai),
         heartbeat_terakhir = now()
   where c.status_penyelesaian = 'berjalan';

  perform public.tutup_panggilan_yatim();
end;
$$;

-- Tutup panggilan yang berakhir. Status yang sudah ditetapkan alur lain (dieskalasi, tiket_terbit, dst.) tidak diubah.
-- Mengembalikan true bila ada panggilan berjalan yang ditutup.
create or replace function public.akhiri_panggilan_aktif(p_percakapan_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.percakapan
     set status_penyelesaian = 'selesai_ai',
         waktu_selesai = greatest(now(), waktu_mulai),
         tahap_ai = null
   where id = p_percakapan_id and status_penyelesaian = 'berjalan';
  return found;
end;
$$;

revoke execute on function public.tutup_panggilan_yatim() from public, anon, authenticated;
revoke execute on function public.laporkan_panggilan_aktif(uuid, public.jenis_interaksi, text, text) from public, anon, authenticated;
revoke execute on function public.akhiri_panggilan_aktif(uuid) from public, anon, authenticated;
grant execute on function public.tutup_panggilan_yatim() to service_role;
grant execute on function public.laporkan_panggilan_aktif(uuid, public.jenis_interaksi, text, text) to service_role;
grant execute on function public.akhiri_panggilan_aktif(uuid) to service_role;

-- Daftar panggilan aktif untuk dashboard (REQ-4.2): hanya yang berjalan dan heartbeat-nya masih segar.
-- Nomor telepon hanya tersamar; hanya petugas terautentikasi yang dapat membaca.
create or replace view public.panggilan_berjalan
with (security_invoker = false) as
select
  c.id as percakapan_id,
  c.waktu_mulai,
  c.jenis_interaksi as jenis_layanan,
  c.topik,
  c.tahap_ai,
  c.heartbeat_terakhir,
  floor(extract(epoch from (now() - c.waktu_mulai)))::int as durasi_detik,
  pt.no_telp as no_telp_tersamar
from public.percakapan c
left join public.penelepon_tersamar pt on pt.id = c.penelepon_id
where (select public.is_petugas())
  and c.status_penyelesaian = 'berjalan'
  and coalesce(c.heartbeat_terakhir, c.waktu_mulai) >= now() - public.batas_heartbeat_panggilan()
order by c.waktu_mulai desc;

revoke all on public.panggilan_berjalan from anon, public;
grant select on public.panggilan_berjalan to authenticated, service_role;
