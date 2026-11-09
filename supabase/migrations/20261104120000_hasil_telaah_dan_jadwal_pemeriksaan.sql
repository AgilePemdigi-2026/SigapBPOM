-- Entity UC-06: hasil telaah dan jadwal pemeriksaan pengaduan (T-F7.1-01, REQ-6.1, REQ-6.2, REQ-6.3, BR-3).
-- Menyimpan hasil telaah pengaduan beserta keputusan tindak lanjut dan penetapan jadwal pemeriksaan lapangan.
-- Mesin status pengaduan:
--   Belum Ditelaah -> Sedang Ditelaah (Telaah Dokumen / Perlu Pemeriksaan Lapangan)
--   Belum Ditelaah -> Diteruskan (Bukan Kewenangan BPOM, berhenti di sini, BR-3)
--   Sedang Ditelaah -> Menunggu Pemeriksaan (setelah jadwal pemeriksaan tersimpan)
-- Akses khusus petugas terautentikasi (public.is_petugas() = true).

-- 1. Tipe enumerasi tindak lanjut telaah
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tindak_lanjut') then
    create type public.tindak_lanjut as enum ('telaah_dokumen', 'pemeriksaan_lapangan', 'bukan_kewenangan');
  end if;
end;
$$;

-- 2. Tabel hasil_telaah
-- Tidak pernah ditimpa/dihapus; setiap simpan telaah menambah baris riwayat baru
create table if not exists public.hasil_telaah (
  id uuid primary key default gen_random_uuid(),
  tiket_id uuid not null references public.tiket (id) on delete cascade,
  tindak_lanjut public.tindak_lanjut not null,
  catatan text,
  petugas_id uuid not null references public.petugas (id),
  waktu timestamptz not null default now()
);

create index if not exists hasil_telaah_tiket_id_idx on public.hasil_telaah (tiket_id);
create index if not exists hasil_telaah_petugas_id_idx on public.hasil_telaah (petugas_id);
create index if not exists hasil_telaah_waktu_idx on public.hasil_telaah (waktu desc);

-- 3. Tabel jadwal_pemeriksaan
create table if not exists public.jadwal_pemeriksaan (
  id uuid primary key default gen_random_uuid(),
  tiket_id uuid not null references public.tiket (id) on delete cascade,
  tanggal date not null,
  unit_pelaksana text not null check (char_length(btrim(unit_pelaksana)) > 0 and char_length(unit_pelaksana) <= 200),
  status text not null default 'menunggu_pemeriksaan',
  petugas_id uuid not null references public.petugas (id),
  waktu timestamptz not null default now()
);

create index if not exists jadwal_pemeriksaan_tiket_id_idx on public.jadwal_pemeriksaan (tiket_id);
create index if not exists jadwal_pemeriksaan_petugas_id_idx on public.jadwal_pemeriksaan (petugas_id);

-- 4. Pengaturan Hak Akses & RLS
alter table public.hasil_telaah enable row level security;
alter table public.jadwal_pemeriksaan enable row level security;

revoke all on public.hasil_telaah, public.jadwal_pemeriksaan from public, anon;

-- authenticated hanya boleh membaca (SELECT); penulisan melalui RPC SECURITY DEFINER
revoke insert, update, delete, truncate on public.hasil_telaah, public.jadwal_pemeriksaan from authenticated;
grant select on public.hasil_telaah, public.jadwal_pemeriksaan to authenticated, service_role;

drop policy if exists "Petugas membaca hasil telaah" on public.hasil_telaah;
create policy "Petugas membaca hasil telaah" on public.hasil_telaah
  for select to authenticated using ((select public.is_petugas()));

drop policy if exists "Petugas membaca jadwal pemeriksaan" on public.jadwal_pemeriksaan;
create policy "Petugas membaca jadwal pemeriksaan" on public.jadwal_pemeriksaan
  for select to authenticated using ((select public.is_petugas()));

-- 5. RPC simpan_telaah (REQ-6.1, REQ-6.2, BR-3)
create or replace function public.simpan_telaah(
  p_no_tiket text,
  p_tindak_lanjut text,
  p_catatan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiket_id uuid;
  v_status_sekarang public.status_tiket;
  v_tl public.tindak_lanjut;
  v_status_baru public.status_tiket;
  v_pesan text;
  v_id uuid;
  v_tl_raw text;
begin
  -- Otorisasi petugas
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menyimpan telaah' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  -- Cari tiket
  select id, status into v_tiket_id, v_status_sekarang
  from public.tiket
  where no_tiket = btrim(p_no_tiket) or id::text = btrim(p_no_tiket)
  for update;

  if not found then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  -- Validasi transisi status: tiket diteruskan atau selesai tidak bisa ditelaah lagi (BR-3)
  if v_status_sekarang = 'diteruskan' then
    raise exception 'Tiket % sudah diteruskan ke instansi lain dan tidak dapat ditelaah lagi', p_no_tiket using errcode = '55000';
  end if;

  if v_status_sekarang = 'selesai' then
    raise exception 'Tiket % sudah selesai dan tidak dapat ditelaah lagi', p_no_tiket using errcode = '55000';
  end if;

  if v_status_sekarang = 'tanggapan_disusun' then
    raise exception 'Tiket % sudah dalam tahap tanggapan disusun dan tidak dapat ditelaah lagi', p_no_tiket using errcode = '55000';
  end if;

  -- Normalisasi pilihan tindak lanjut (menerima label UI maupun identifier enum)
  v_tl_raw := lower(btrim(coalesce(p_tindak_lanjut, '')));
  if v_tl_raw in ('telaah dokumen', 'telaah_dokumen') then
    v_tl := 'telaah_dokumen'::public.tindak_lanjut;
    v_status_baru := 'sedang_ditelaah'::public.status_tiket;
    v_pesan := 'Hasil telaah tersimpan.';
  elsif v_tl_raw in ('perlu pemeriksaan lapangan', 'pemeriksaan_lapangan') then
    v_tl := 'pemeriksaan_lapangan'::public.tindak_lanjut;
    -- Menunggu jadwal pemeriksaan (status tiket sedang ditelaah sampai jadwal tersimpan)
    v_status_baru := 'sedang_ditelaah'::public.status_tiket;
    v_pesan := 'Hasil telaah tersimpan.';
  elsif v_tl_raw in ('bukan kewenangan bpom', 'bukan kewenangan', 'bukan_kewenangan') then
    v_tl := 'bukan_kewenangan'::public.tindak_lanjut;
    -- Bukan kewenangan BPOM -> diteruskan dan berhenti di sini (BR-3)
    v_status_baru := 'diteruskan'::public.status_tiket;
    v_pesan := 'Pengaduan diteruskan ke instansi lain.';
  else
    raise exception 'Pilihan tindak lanjut tidak valid: %', p_tindak_lanjut using errcode = '22023';
  end if;

  -- Simpan riwayat telaah baru (tidak menimpa baris lama)
  insert into public.hasil_telaah (tiket_id, tindak_lanjut, catatan, petugas_id, waktu)
  values (v_tiket_id, v_tl, nullif(btrim(p_catatan), ''), auth.uid(), now())
  returning id into v_id;

  -- Perbarui status tiket
  update public.tiket
  set status = v_status_baru
  where id = v_tiket_id;

  return jsonb_build_object(
    'id', v_id,
    'tiket_id', v_tiket_id,
    'no_tiket', p_no_tiket,
    'status', v_status_baru,
    'tindak_lanjut', v_tl,
    'pesan', v_pesan
  );
end;
$$;

-- 6. RPC simpan_jadwal_pemeriksaan (REQ-6.3)
create or replace function public.simpan_jadwal_pemeriksaan(
  p_no_tiket text,
  p_tanggal date,
  p_unit text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiket_id uuid;
  v_status_sekarang public.status_tiket;
  v_id uuid;
begin
  -- Otorisasi petugas
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menyimpan jadwal pemeriksaan' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  -- Cari tiket
  select id, status into v_tiket_id, v_status_sekarang
  from public.tiket
  where no_tiket = btrim(p_no_tiket) or id::text = btrim(p_no_tiket)
  for update;

  if not found then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  -- Validasi transisi status
  if v_status_sekarang in ('diteruskan', 'selesai') then
    raise exception 'Tiket % sudah % dan tidak dapat dijadwalkan', p_no_tiket, v_status_sekarang using errcode = '55000';
  end if;

  -- Validasi input
  if p_tanggal is null then
    raise exception 'Tanggal pemeriksaan wajib diisi.' using errcode = '22023';
  end if;

  if p_unit is null or btrim(p_unit) = '' then
    raise exception 'Unit pelaksana wajib diisi.' using errcode = '22023';
  end if;

  if char_length(p_unit) > 200 then
    raise exception 'Unit pelaksana melebihi batas maksimal 200 karakter' using errcode = '22023';
  end if;

  -- Simpan jadwal pemeriksaan
  insert into public.jadwal_pemeriksaan (tiket_id, tanggal, unit_pelaksana, status, petugas_id, waktu)
  values (v_tiket_id, p_tanggal, btrim(p_unit), 'menunggu_pemeriksaan', auth.uid(), now())
  returning id into v_id;

  -- Perbarui status tiket menjadi menunggu_pemeriksaan
  update public.tiket
  set status = 'menunggu_pemeriksaan'
  where id = v_tiket_id;

  return jsonb_build_object(
    'id', v_id,
    'tiket_id', v_tiket_id,
    'no_tiket', p_no_tiket,
    'status', 'menunggu_pemeriksaan',
    'tanggal', p_tanggal,
    'unit_pelaksana', btrim(p_unit),
    'pesan', 'Jadwal pemeriksaan tersimpan.'
  );
end;
$$;

-- 7. RPC pembantu pembacaan telaah dan jadwal
create or replace function public.ambil_riwayat_telaah(p_no_tiket text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasil jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca riwayat telaah' using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'tiket_id', h.tiket_id,
      'tindak_lanjut', h.tindak_lanjut,
      'catatan', h.catatan,
      'petugas_id', h.petugas_id,
      'petugas_nama', p.nama,
      'waktu', h.waktu
    ) order by h.waktu desc
  ) into v_hasil
  from public.hasil_telaah h
  join public.tiket t on t.id = h.tiket_id
  left join public.petugas p on p.id = h.petugas_id
  where t.no_tiket = btrim(p_no_tiket) or t.id::text = btrim(p_no_tiket);

  return coalesce(v_hasil, '[]'::jsonb);
end;
$$;

create or replace function public.ambil_jadwal_pemeriksaan(p_no_tiket text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasil jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca jadwal pemeriksaan' using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', j.id,
      'tiket_id', j.tiket_id,
      'tanggal', j.tanggal,
      'unit_pelaksana', j.unit_pelaksana,
      'status', j.status,
      'petugas_id', j.petugas_id,
      'petugas_nama', p.nama,
      'waktu', j.waktu
    ) order by j.waktu desc
  ) into v_hasil
  from public.jadwal_pemeriksaan j
  join public.tiket t on t.id = j.tiket_id
  left join public.petugas p on p.id = j.petugas_id
  where t.no_tiket = btrim(p_no_tiket) or t.id::text = btrim(p_no_tiket);

  return coalesce(v_hasil, '[]'::jsonb);
end;
$$;

revoke execute on function public.simpan_telaah(text, text, text) from public, anon;
grant execute on function public.simpan_telaah(text, text, text) to authenticated, service_role;

revoke execute on function public.simpan_jadwal_pemeriksaan(text, date, text) from public, anon;
grant execute on function public.simpan_jadwal_pemeriksaan(text, date, text) to authenticated, service_role;

revoke execute on function public.ambil_riwayat_telaah(text) from public, anon;
grant execute on function public.ambil_riwayat_telaah(text) to authenticated, service_role;

revoke execute on function public.ambil_jadwal_pemeriksaan(text) from public, anon;
grant execute on function public.ambil_jadwal_pemeriksaan(text) to authenticated, service_role;
