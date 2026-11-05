-- Entity UC-08: rekap layanan per periode dan hak akses ekspor laporan (T-F8.1-01, REQ-8.1, REQ-8.3, BR-8, NFR-5, NFR-14).
-- Menghitung jumlah panggilan, kasus tereskalasi, dan pengaduan selesai per periode dan rincian per minggu (WIB).
-- Memeriksa hak ekspor petugas sebelum unduh laporan diperbolehkan.
-- Akses khusus petugas terautentikasi (public.is_petugas() = true).

-- 1. Pastikan kolom hak_ekspor pada public.petugas dan set nilai default
alter table public.petugas add column if not exists hak_ekspor boolean not null default false;

-- Akun uji seed diberi hak ekspor (BR-8, NFR-14)
update public.petugas
set hak_ekspor = true
where id in (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
);

-- 2. Indeks untuk memenuhi NFR-5 (rekapitulasi layanan satu bulan di bawah 10 detik)
create index if not exists percakapan_waktu_mulai_wib_idx
  on public.percakapan (((waktu_mulai at time zone 'Asia/Jakarta')::date));

create index if not exists tiket_rekap_layanan_idx
  on public.tiket (jenis, status, ((tgl_terbit at time zone 'Asia/Jakarta')::date));

create index if not exists tiket_tgl_terbit_wib_idx
  on public.tiket (((tgl_terbit at time zone 'Asia/Jakarta')::date));

-- 3. Fungsi pemeriksaan hak ekspor petugas (REQ-8.3, BR-8, NFR-14)
create or replace function public.boleh_ekspor()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hak boolean;
begin
  if not public.is_petugas() then
    return false;
  end if;

  select hak_ekspor into v_hak
  from public.petugas
  where id = auth.uid();

  return coalesce(v_hak, false);
end;
$$;

-- 4. RPC rekapitulasi layanan per periode dan rincian mingguan (REQ-8.1, REQ-8.2, NFR-5)
create or replace function public.rekap_layanan(
  p_awal date,
  p_akhir date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minggu_awal date;
  v_minggu_akhir date;
  v_panggilan_minggu int;
  v_eskalasi_minggu int;
  v_selesai_minggu int;
  v_total_panggilan int := 0;
  v_total_eskalasi int := 0;
  v_total_selesai int := 0;
  v_per_minggu jsonb := '[]'::jsonb;
begin
  -- Otorisasi petugas
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat mengakses rekap layanan' using errcode = '42501';
  end if;

  -- Validasi input
  if p_awal is null or p_akhir is null then
    raise exception 'Periode tanggal wajib diisi' using errcode = '22023';
  end if;

  if p_awal > p_akhir then
    raise exception 'Tanggal awal tidak boleh melebihi tanggal akhir' using errcode = '22023';
  end if;

  -- Pembagian periode per minggu (blok 7 hari berurutan mulai dari p_awal)
  v_minggu_awal := p_awal;
  while v_minggu_awal <= p_akhir loop
    v_minggu_akhir := least(v_minggu_awal + 6, p_akhir);

    -- 1. Jumlah panggilan masuk pada rentang minggu (waktu_mulai zona Asia/Jakarta)
    select count(*)::int into v_panggilan_minggu
    from public.percakapan
    where (waktu_mulai at time zone 'Asia/Jakarta')::date between v_minggu_awal and v_minggu_akhir;

    -- 2. Jumlah kasus tereskalasi (tiket eskalasi yang terbit pada rentang minggu)
    select count(*)::int into v_eskalasi_minggu
    from public.tiket
    where jenis = 'eskalasi'
      and (tgl_terbit at time zone 'Asia/Jakarta')::date between v_minggu_awal and v_minggu_akhir;

    -- 3. Jumlah pengaduan selesai (tiket pengaduan berstatus selesai pada rentang minggu)
    select count(*)::int into v_selesai_minggu
    from public.tiket
    where jenis = 'pengaduan'
      and status = 'selesai'
      and (tgl_terbit at time zone 'Asia/Jakarta')::date between v_minggu_awal and v_minggu_akhir;

    v_total_panggilan := v_total_panggilan + v_panggilan_minggu;
    v_total_eskalasi := v_total_eskalasi + v_eskalasi_minggu;
    v_total_selesai := v_total_selesai + v_selesai_minggu;

    v_per_minggu := v_per_minggu || jsonb_build_array(
      jsonb_build_object(
        'awal', to_char(v_minggu_awal, 'YYYY-MM-DD'),
        'akhir', to_char(v_minggu_akhir, 'YYYY-MM-DD'),
        'panggilan', v_panggilan_minggu,
        'tereskalasi', v_eskalasi_minggu,
        'pengaduan_selesai', v_selesai_minggu
      )
    );

    v_minggu_awal := v_minggu_akhir + 1;
  end loop;

  return jsonb_build_object(
    'total', jsonb_build_object(
      'panggilan', v_total_panggilan,
      'tereskalasi', v_total_eskalasi,
      'pengaduan_selesai', v_total_selesai
    ),
    'per_minggu', v_per_minggu
  );
end;
$$;

-- 5. Pengaturan hak eksekusi
revoke execute on function public.boleh_ekspor() from public, anon;
grant execute on function public.boleh_ekspor() to authenticated, service_role;

revoke execute on function public.rekap_layanan(date, date) from public, anon;
grant execute on function public.rekap_layanan(date, date) to authenticated, service_role;
