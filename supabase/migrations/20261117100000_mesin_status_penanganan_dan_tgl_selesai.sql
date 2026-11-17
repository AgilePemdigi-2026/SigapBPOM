-- UC-06 dan UC-08 sesuai SRS (hasil audit Sprint 3, 17 Nov 2026).
-- 1. Urutan tahap penanganan ditegakkan RPC (SRS 4.6 Basic Path dan Alternative Path 2, kriteria T-F7.1-01
--    "transisi tidak sah ditolak"): telaah -> (jadwal bila Perlu Pemeriksaan Lapangan) -> tanggapan -> tutup.
--    Sebelumnya tanggapan bisa disimpan sebelum telaah, jadwal bisa memundurkan tiket bertanggapan, dan telaah bisa
--    mengubah tiket yang sudah dijadwalkan.
-- 2. tiket.tgl_selesai diisi trigger saat tiket menjadi Selesai, dan rekap_layanan menghitung "pengaduan selesai" menurut waktu ditutup
--    (REQ-8.1), bukan waktu terbit. Laporan periode lama tidak lagi berubah saat tiket lama ditutup.
-- 3. Keempat RPC penanganan menolak tiket eskalasi (UC-06 khusus pengaduan).
-- Kode galat tetap: 55000 (telaah, jadwal) dan SG409 (tanggapan) untuk transisi ditolak, SGBR2 untuk BR-2.

-- 1. Waktu penutupan tiket
alter table public.tiket add column if not exists tgl_selesai timestamptz;

-- Tiket yang sudah selesai sebelum kolom ini ada: waktu antre SMS tindak lanjut (diantrekan tutup_tiket di transaksi
-- yang sama), lalu tanggapan terakhir, lalu waktu terbit.
update public.tiket t
   set tgl_selesai = coalesce(
     (select min(n.dibuat) from public.notifikasi n where n.tiket_id = t.id and n.jenis = 'tindak_lanjut'),
     (select max(tg.waktu) from public.tanggapan tg where tg.tiket_id = t.id),
     t.tgl_terbit)
 where t.status = 'selesai' and t.tgl_selesai is null;

create index if not exists tiket_pengaduan_selesai_idx on public.tiket (tgl_selesai)
  where jenis = 'pengaduan' and status = 'selesai';

-- Setiap tiket yang menjadi Selesai mendapat waktu penutupan, dari jalur mana pun (tutup_tiket, SQL Editor, data uji),
-- sehingga rekap UC-08 tidak pernah kehilangan pengaduan selesai.
create or replace function public.isi_tgl_selesai()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'selesai' and new.tgl_selesai is null then
    new.tgl_selesai := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tiket_isi_tgl_selesai on public.tiket;
create trigger tiket_isi_tgl_selesai
  before insert or update of status on public.tiket
  for each row execute function public.isi_tgl_selesai();

-- Tindak lanjut telaah terakhir sebuah tiket, null bila belum pernah ditelaah.
create or replace function public.tindak_lanjut_terakhir(p_tiket_id uuid)
returns public.tindak_lanjut
language sql
stable
security definer
set search_path = ''
as $$
  select h.tindak_lanjut from public.hasil_telaah h where h.tiket_id = p_tiket_id order by h.waktu desc limit 1;
$$;
revoke execute on function public.tindak_lanjut_terakhir(uuid) from public, anon, authenticated;

-- 2. simpan_telaah: hanya dari Belum Ditelaah atau Sedang Ditelaah (petugas boleh mengganti keputusan telaah sebelum
--    jadwal atau tanggapan disimpan).
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
  v_jenis public.jenis_tiket;
  v_tl public.tindak_lanjut;
  v_status_baru public.status_tiket;
  v_pesan text;
  v_id uuid;
  v_tl_raw text;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menyimpan telaah' using errcode = '42501';
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
    raise exception 'Tiket % bukan tiket pengaduan', p_no_tiket using errcode = '55000';
  end if;

  if v_status_sekarang not in ('belum_ditelaah', 'sedang_ditelaah') then
    raise exception 'Tiket % berstatus % dan tidak dapat ditelaah lagi', p_no_tiket, v_status_sekarang using errcode = '55000';
  end if;

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

  insert into public.hasil_telaah (tiket_id, tindak_lanjut, catatan, petugas_id, waktu)
  values (v_tiket_id, v_tl, nullif(btrim(p_catatan), ''), auth.uid(), now())
  returning id into v_id;

  update public.tiket set status = v_status_baru where id = v_tiket_id;

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

-- 3. simpan_jadwal_pemeriksaan: hanya setelah telaah "Perlu Pemeriksaan Lapangan" (Alternative Path 2), atau untuk
--    menjadwal ulang tiket yang masih Menunggu Pemeriksaan.
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
  v_jenis public.jenis_tiket;
  v_id uuid;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menyimpan jadwal pemeriksaan' using errcode = '42501';
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
    raise exception 'Tiket % bukan tiket pengaduan', p_no_tiket using errcode = '55000';
  end if;

  if not (v_status_sekarang = 'menunggu_pemeriksaan'
          or (v_status_sekarang = 'sedang_ditelaah'
              and public.tindak_lanjut_terakhir(v_tiket_id) = 'pemeriksaan_lapangan')) then
    raise exception 'Tiket % berstatus % dan tidak dapat dijadwalkan', p_no_tiket, v_status_sekarang using errcode = '55000';
  end if;

  if p_tanggal is null then
    raise exception 'Tanggal pemeriksaan wajib diisi.' using errcode = '22023';
  end if;

  if p_unit is null or btrim(p_unit) = '' then
    raise exception 'Unit pelaksana wajib diisi.' using errcode = '22023';
  end if;

  if char_length(p_unit) > 200 then
    raise exception 'Unit pelaksana melebihi batas maksimal 200 karakter' using errcode = '22023';
  end if;

  insert into public.jadwal_pemeriksaan (tiket_id, tanggal, unit_pelaksana, status, petugas_id, waktu)
  values (v_tiket_id, p_tanggal, btrim(p_unit), 'menunggu_pemeriksaan', auth.uid(), now())
  returning id into v_id;

  update public.tiket set status = 'menunggu_pemeriksaan' where id = v_tiket_id;

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

-- 4. simpan_tanggapan: hanya setelah telaah. Bila telaah terakhir "Perlu Pemeriksaan Lapangan", jadwal harus tersimpan
--    dulu (Alternative Path 2 langkah 14: tanggapan disusun berdasarkan hasil pemeriksaan). Tanggapan boleh direvisi
--    selama tiket belum ditutup.
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
  v_jenis public.jenis_tiket;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menyimpan tanggapan' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  if p_isi is null or btrim(p_isi) = '' then
    raise exception 'Tanggapan wajib diisi.' using errcode = '22023';
  end if;

  if char_length(p_isi) > 5000 then
    raise exception 'Tanggapan melebihi batas maksimal 5000 karakter' using errcode = '22023';
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

  if not (v_status_sekarang in ('menunggu_pemeriksaan', 'tanggapan_disusun')
          or (v_status_sekarang = 'sedang_ditelaah'
              and public.tindak_lanjut_terakhir(v_tiket_id) is distinct from 'pemeriksaan_lapangan')) then
    raise exception 'Tiket % berstatus % dan tidak dapat ditanggapi', p_no_tiket, v_status_sekarang using errcode = 'SG409';
  end if;

  insert into public.tanggapan (tiket_id, isi, petugas_id, status, waktu)
  values (v_tiket_id, btrim(p_isi), auth.uid(), 'tanggapan_disusun', now());

  update public.tiket set status = 'tanggapan_disusun' where id = v_tiket_id;

  return 'tanggapan_disusun'::public.status_tiket;
end;
$$;

-- 5. tutup_tiket: hanya dari Tanggapan Disusun (BR-2).
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
  v_no_tiket_asli text;
begin
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat menutup tiket' using errcode = '42501';
  end if;

  if p_no_tiket is null or btrim(p_no_tiket) = '' then
    raise exception 'Nomor tiket tidak valid' using errcode = '22023';
  end if;

  select id, no_tiket, status, jenis into v_tiket_id, v_no_tiket_asli, v_status_sekarang, v_jenis
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

  -- tgl_selesai diisi trigger tiket_isi_tgl_selesai.
  update public.tiket set status = 'selesai' where id = v_tiket_id;

  perform public.antrekan_notifikasi_tindak_lanjut(v_no_tiket_asli);

  return 'selesai'::public.status_tiket;
end;
$$;

-- 6. rekap_layanan: pengaduan selesai dihitung menurut tgl_selesai (REQ-8.1). Bagian lain tidak berubah.
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
  if not public.is_petugas() then
    raise exception 'Akses ditolak: hanya petugas yang dapat mengakses rekap layanan' using errcode = '42501';
  end if;

  if p_awal is null or p_akhir is null then
    raise exception 'Periode tanggal wajib diisi' using errcode = '22023';
  end if;

  if p_awal > p_akhir then
    raise exception 'Tanggal awal tidak boleh melebihi tanggal akhir' using errcode = '22023';
  end if;

  v_minggu_awal := p_awal;
  while v_minggu_awal <= p_akhir loop
    v_minggu_akhir := least(v_minggu_awal + 6, p_akhir);

    select count(*)::int into v_panggilan_minggu
    from public.percakapan
    where (waktu_mulai at time zone 'Asia/Jakarta')::date between v_minggu_awal and v_minggu_akhir;

    select count(*)::int into v_eskalasi_minggu
    from public.tiket
    where jenis = 'eskalasi'
      and (tgl_terbit at time zone 'Asia/Jakarta')::date between v_minggu_awal and v_minggu_akhir;

    -- Pengaduan yang ditutup (Selesai) pada rentang minggu, menurut waktu penutupan WIB.
    select count(*)::int into v_selesai_minggu
    from public.tiket
    where jenis = 'pengaduan'
      and status = 'selesai'
      and (tgl_selesai at time zone 'Asia/Jakarta')::date between v_minggu_awal and v_minggu_akhir;

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
