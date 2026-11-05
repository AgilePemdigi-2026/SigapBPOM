-- Entity UC-06: antrean notifikasi SMS tindak lanjut saat tiket ditutup (T-F7.3-01, REQ-6.6).
--
-- Alur: tutup_tiket (T-F7.2-01) mengubah tiket menjadi selesai lalu memanggil
--   perform public.antrekan_notifikasi_tindak_lanjut(p_no_tiket);
-- Edge Function kirim-notifikasi (PenangananController) mengklaim baris tertunda atau gagal, mengirim SMS lewat
-- interface PengirimSms, lalu mencatat hasilnya. Basis data tidak mengirim SMS (T-F7.2-01).
--
-- Tabel ini tidak menyimpan nomor telepon. Nomor dibaca dari pengaduan atau penelepon hanya saat klaim, oleh
-- service_role, dan tidak pernah dibuka ke anon atau authenticated (PROJECT_RULES 5.5).

-- 1. Enumerasi
do $$
begin
  if not exists (select 1 from pg_type where typname = 'jenis_notifikasi' and typnamespace = 'public'::regnamespace) then
    create type public.jenis_notifikasi as enum ('tindak_lanjut');
  end if;
  -- mengirim: sedang dipegang satu proses kirim-notifikasi, sehingga proses lain yang berjalan bersamaan melewatinya.
  if not exists (select 1 from pg_type where typname = 'status_kirim_notifikasi' and typnamespace = 'public'::regnamespace) then
    create type public.status_kirim_notifikasi as enum ('tertunda', 'mengirim', 'terkirim', 'gagal');
  end if;
end;
$$;

-- 2. Tabel notifikasi (PRD 9: isi_notifikasi, Tgl_pengiriman, status_pengiriman; tiket memicu notifikasi)
create table if not exists public.notifikasi (
  id uuid primary key default gen_random_uuid(),
  tiket_id uuid not null references public.tiket (id) on delete cascade,
  jenis public.jenis_notifikasi not null default 'tindak_lanjut',
  status_kirim public.status_kirim_notifikasi not null default 'tertunda',
  -- Teks SMS yang benar-benar terkirim; berisi nomor tiket, tanpa data pribadi.
  isi text,
  percobaan int not null default 0 check (percobaan >= 0),
  galat_terakhir text check (galat_terakhir is null or char_length(galat_terakhir) <= 200),
  dibuat timestamptz not null default now(),
  diklaim_pada timestamptz,
  tgl_kirim timestamptz,
  -- Menutup tiket dua kali tidak boleh mengantrekan dua SMS (T-F7.2-01).
  unique (tiket_id, jenis),
  check (status_kirim <> 'terkirim' or tgl_kirim is not null)
);

create index if not exists notifikasi_status_kirim_idx on public.notifikasi (status_kirim, dibuat);

alter table public.notifikasi enable row level security;
-- Tanpa kebijakan RLS dan tanpa grant, anon dan authenticated tidak bisa membaca atau menulis apa pun.
revoke all on public.notifikasi from public, anon, authenticated;

-- 3. Antrekan notifikasi tindak lanjut. Dipanggil dari tutup_tiket di transaksi yang sama, setelah status selesai.
create or replace function public.antrekan_notifikasi_tindak_lanjut(p_no_tiket text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiket_id uuid;
  v_status public.status_tiket;
begin
  select id, status into v_tiket_id, v_status
  from public.tiket
  where no_tiket = btrim(p_no_tiket);

  if not found then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  -- REQ-6.6: SMS tindak lanjut hanya untuk tiket yang sudah ditutup.
  if v_status <> 'selesai' then
    raise exception 'Tiket % belum selesai', p_no_tiket using errcode = '55000';
  end if;

  insert into public.notifikasi (tiket_id, jenis)
  values (v_tiket_id, 'tindak_lanjut')
  on conflict (tiket_id, jenis) do nothing;
end;
$$;

-- 4. Klaim baris yang perlu dikirim. Aman untuk proses yang berjalan bersamaan: baris dikunci dengan
-- `for update skip locked` lalu ditandai mengirim, jadi satu baris hanya dipegang satu proses.
-- Baris terkirim tidak pernah diklaim lagi. Baris mengirim yang tidak dicatat hasilnya dalam BATAS_KLAIM
-- (proses mati di tengah jalan) dianggap lepas dan boleh diklaim ulang.
create or replace function public.klaim_notifikasi_tertunda(p_batas int, p_batas_percobaan int)
returns table (id uuid, no_tiket text, nomor_telepon text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- Lebih lama dari batas waktu satu panggilan SMS Gateway, sehingga klaim yang masih berjalan tidak direbut.
  c_batas_klaim constant interval := interval '10 minutes';
begin
  if p_batas is null or p_batas < 1 or p_batas > 100 then
    raise exception 'Batas klaim tidak valid' using errcode = '22023';
  end if;
  if p_batas_percobaan is null or p_batas_percobaan < 1 then
    raise exception 'Batas percobaan tidak valid' using errcode = '22023';
  end if;

  return query
  with dipilih as (
    select n.id
    from public.notifikasi n
    where n.percobaan < p_batas_percobaan
      and (
        n.status_kirim in ('tertunda', 'gagal')
        or (n.status_kirim = 'mengirim' and n.diklaim_pada < now() - c_batas_klaim)
      )
    order by n.dibuat
    limit p_batas
    for update skip locked
  ), diklaim as (
    update public.notifikasi n
       set status_kirim = 'mengirim',
           percobaan = n.percobaan + 1,
           diklaim_pada = now()
      from dipilih
     where n.id = dipilih.id
    returning n.id, n.tiket_id
  )
  -- Nomor tujuan dibaca di server: register pengaduan dulu, lalu penelepon percakapan tiket.
  select d.id, t.no_tiket, coalesce(nullif(p.nomor_telepon, ''), pl.no_telp)
  from diklaim d
  join public.tiket t on t.id = d.tiket_id
  left join public.pengaduan p on p.tiket_id = t.id
  left join public.percakapan c on c.id = t.percakapan_id
  left join public.penelepon pl on pl.id = c.penelepon_id;
end;
$$;

-- 5. Catat hasil kirim. Hanya baris berstatus mengirim yang diubah, jadi hasil terkirim tidak pernah tertimpa.
-- Mengembalikan false bila baris tidak sedang diklaim.
create or replace function public.catat_hasil_notifikasi(
  p_id uuid,
  p_terkirim boolean,
  p_isi text default null,
  p_galat text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id is null or p_terkirim is null then
    raise exception 'Hasil notifikasi tidak valid' using errcode = '22023';
  end if;

  update public.notifikasi
     set status_kirim = case when p_terkirim then 'terkirim' else 'gagal' end::public.status_kirim_notifikasi,
         isi = case when p_terkirim then p_isi else isi end,
         tgl_kirim = case when p_terkirim then now() else null end,
         galat_terakhir = case
           when p_terkirim then null
           else left(coalesce(nullif(btrim(p_galat), ''), 'Gagal mengirim.'), 200)
         end
   where id = p_id
     and status_kirim = 'mengirim';

  return found;
end;
$$;

-- 6. Hak eksekusi: hanya service_role (Edge Function). tutup_tiket memanggil antrekan sebagai SECURITY DEFINER.
revoke execute on function public.antrekan_notifikasi_tindak_lanjut(text) from public, anon, authenticated;
grant execute on function public.antrekan_notifikasi_tindak_lanjut(text) to service_role;

revoke execute on function public.klaim_notifikasi_tertunda(int, int) from public, anon, authenticated;
grant execute on function public.klaim_notifikasi_tertunda(int, int) to service_role;

revoke execute on function public.catat_hasil_notifikasi(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.catat_hasil_notifikasi(uuid, boolean, text, text) to service_role;
