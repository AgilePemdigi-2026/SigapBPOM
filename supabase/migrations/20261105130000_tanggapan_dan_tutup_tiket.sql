-- Entity UC-06: tanggapan resmi dan penutupan tiket pengaduan (T-F7.2-01, REQ-6.4, REQ-6.5, REQ-6.6, BR-2).
-- Menyimpan tanggapan resmi petugas, memvalidasi syarat penutupan tiket (harus ada tanggapan),
-- dan mengantrekan notifikasi SMS tindak lanjut saat tiket ditutup via public.antrekan_notifikasi_tindak_lanjut (T-F7.3-01).
-- Akses khusus petugas terautentikasi (public.is_petugas() = true).

-- 1. Tabel tanggapan
-- Menyimpan riwayat tanggapan resmi petugas untuk tiket pengaduan.
create table if not exists public.tanggapan (
  id uuid primary key default gen_random_uuid(),
  tiket_id uuid not null references public.tiket (id) on delete cascade,
  isi text not null check (char_length(btrim(isi)) > 0 and char_length(isi) <= 5000),
  isi_tanggapan text generated always as (isi) stored,
  petugas_id uuid not null references public.petugas (id),
  status text not null default 'tanggapan_disusun',
  status_tanggapan text generated always as (status) stored,
  waktu timestamptz not null default now(),
  tgl_tanggapan timestamptz generated always as (waktu) stored
);

create index if not exists tanggapan_tiket_id_idx on public.tanggapan (tiket_id);
create index if not exists tanggapan_petugas_id_idx on public.tanggapan (petugas_id);
create index if not exists tanggapan_waktu_idx on public.tanggapan (waktu desc);

-- 2. Pengaturan Hak Akses & RLS pada tanggapan
alter table public.tanggapan enable row level security;

revoke all on public.tanggapan from public, anon;

-- authenticated hanya boleh membaca (SELECT); penulisan melalui RPC SECURITY DEFINER
revoke insert, update, delete, truncate on public.tanggapan from authenticated;
grant select on public.tanggapan to authenticated, service_role;

drop policy if exists "Petugas membaca tanggapan" on public.tanggapan;
create policy "Petugas membaca tanggapan" on public.tanggapan
  for select to authenticated using ((select public.is_petugas()));

-- 3. Perbarui RPC simpan_telaah agar mendukung 'bukan_kewenangan_bpom'
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
    v_status_baru := 'sedang_ditelaah'::public.status_tiket;
    v_pesan := 'Hasil telaah tersimpan.';
  elsif v_tl_raw in ('bukan kewenangan bpom', 'bukan kewenangan', 'bukan_kewenangan', 'bukan_kewenangan_bpom') then
    v_tl := 'bukan_kewenangan'::public.tindak_lanjut;
    v_status_baru := 'diteruskan'::public.status_tiket;
    v_pesan := 'Pengaduan diteruskan ke instansi lain.';
  else
    raise exception 'Pilihan tindak lanjut tidak valid: %', p_tindak_lanjut using errcode = '22023';
  end if;

  -- Simpan riwayat telaah baru
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

-- 4. RPC simpan_tanggapan (REQ-6.4)
create or replace function public.simpan_tanggapan(
  p_no_tiket text,
  p_isi text
)
returns public.status_tiket
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiket_id uuid;
  v_status_sekarang public.status_tiket;
begin
  -- Otorisasi petugas
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menyimpan tanggapan' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  -- Validasi input: tanggapan resmi kosong ditolak (REQ-6.4)
  if p_isi is null or btrim(p_isi) = '' then
    raise exception 'Tanggapan wajib diisi.' using errcode = '22023';
  end if;

  if char_length(p_isi) > 5000 then
    raise exception 'Tanggapan melebihi batas maksimal 5000 karakter' using errcode = '22023';
  end if;

  -- Cari tiket
  select id, status into v_tiket_id, v_status_sekarang
  from public.tiket
  where no_tiket = btrim(p_no_tiket) or id::text = btrim(p_no_tiket)
  for update;

  if not found then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  -- Transisi tidak sah: tiket diteruskan atau selesai
  if v_status_sekarang in ('diteruskan', 'selesai') then
    raise exception 'Tiket % sudah % dan tidak dapat ditanggapi', p_no_tiket, v_status_sekarang using errcode = 'SG409';
  end if;

  -- Simpan tanggapan
  insert into public.tanggapan (tiket_id, isi, petugas_id, status, waktu)
  values (v_tiket_id, btrim(p_isi), auth.uid(), 'tanggapan_disusun', now());

  -- Perbarui status tiket menjadi tanggapan_disusun
  update public.tiket
  set status = 'tanggapan_disusun'
  where id = v_tiket_id;

  return 'tanggapan_disusun'::public.status_tiket;
end;
$$;

-- 5. RPC tutup_tiket (REQ-6.5, REQ-6.6, BR-2)
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
  v_no_tiket_asli text;
begin
  -- Otorisasi petugas
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menutup tiket' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  -- Cari tiket
  select id, no_tiket, status into v_tiket_id, v_no_tiket_asli, v_status_sekarang
  from public.tiket
  where no_tiket = btrim(p_no_tiket) or id::text = btrim(p_no_tiket)
  for update;

  if not found then
    raise exception 'Tiket % tidak ditemukan', p_no_tiket using errcode = 'P0002';
  end if;

  -- Idempoten: tiket sudah selesai
  if v_status_sekarang = 'selesai' then
    return 'selesai'::public.status_tiket;
  end if;

  -- Tiket diteruskan tidak bisa ditutup
  if v_status_sekarang = 'diteruskan' then
    raise exception 'Tiket % sudah diteruskan ke instansi lain', p_no_tiket using errcode = 'SG409';
  end if;

  -- Validasi syarat penutupan tiket (REQ-6.5, BR-2):
  -- Tiket tidak bisa ditutup sebelum tanggapan resmi tersimpan.
  if not exists (select 1 from public.tanggapan where tiket_id = v_tiket_id) then
    raise exception 'Tiket tidak dapat ditutup. Susun tanggapan terlebih dahulu.' using errcode = 'SGBR2';
  end if;

  -- Perbarui status tiket menjadi selesai (REQ-6.6)
  update public.tiket
  set status = 'selesai'
  where id = v_tiket_id;

  -- Antrekan notifikasi SMS tindak lanjut (T-F7.3-01)
  perform public.antrekan_notifikasi_tindak_lanjut(v_no_tiket_asli);

  return 'selesai'::public.status_tiket;
end;
$$;

-- 6. RPC pembacaan tanggapan
create or replace function public.ambil_tanggapan(p_no_tiket text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasil jsonb;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat membaca tanggapan' using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', tg.id,
      'tiket_id', tg.tiket_id,
      'isi', tg.isi,
      'petugas_id', tg.petugas_id,
      'petugas_nama', p.nama,
      'status', tg.status,
      'waktu', tg.waktu
    ) order by tg.waktu desc
  ) into v_hasil
  from public.tanggapan tg
  join public.tiket t on t.id = tg.tiket_id
  left join public.petugas p on p.id = tg.petugas_id
  where t.no_tiket = btrim(p_no_tiket) or t.id::text = btrim(p_no_tiket);

  return coalesce(v_hasil, '[]'::jsonb);
end;
$$;

-- Hak eksekusi
revoke execute on function public.simpan_tanggapan(text, text) from public, anon;
grant execute on function public.simpan_tanggapan(text, text) to authenticated, service_role;

revoke execute on function public.tutup_tiket(text) from public, anon;
grant execute on function public.tutup_tiket(text) to authenticated, service_role;

revoke execute on function public.ambil_tanggapan(text) from public, anon;
grant execute on function public.ambil_tanggapan(text) to authenticated, service_role;
