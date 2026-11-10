-- Entity UC-04: penutupan panggilan, KPI "Dijawab Otomatis AI", dan penyamaran kronologi
-- (T-F5.1-01, T-F5.2-02, T-F5.3-01, REQ-4.1, REQ-4.2, NFR-13).
-- 1. Panggilan aktif ditandai waktu_selesai kosong, bukan status 'berjalan'. RPC tiket dan pengaduan mengubah status saat
--    penelepon masih tersambung, jadi panggilan itu tetap aktif sampai diakhiri atau disapu, dan waktu_selesai-nya terisi.
-- 2. Panggilan yang ditutup tanpa status hasil menjadi 'selesai_ai' hanya bila AI sempat menjawab, selain itu 'terputus'.
-- 3. Penyapuan panggilan yatim dijadwalkan pg_cron, tidak lagi hanya menunggu laporan panggilan.
-- 4. Nomor telepon dan nama pelapor di kronologi disamarkan untuk petugas.

-- REQ-4.1: menjadi true begitu gateway melaporkan tahap 'menjawab', dan tidak kembali false.
alter table public.percakapan add column if not exists dijawab_ai boolean not null default false;

drop index if exists public.percakapan_berjalan_heartbeat_idx;
create index if not exists percakapan_aktif_heartbeat_idx
  on public.percakapan (heartbeat_terakhir) where waktu_selesai is null;

-- Satu aturan status untuk akhiri_panggilan_aktif dan tutup_panggilan_yatim (REQ-4.1). Status hasil alur lain
-- (dieskalasi, tiket_terbit, pengaduan_tidak_lengkap) tidak diubah. Pengaduan yang masih 'berjalan' saat ditutup belum
-- menghasilkan tiket atau data, jadi tidak dihitung selesai oleh AI.
-- ponytail: dijawab_ai berasal dari tahap 'menjawab', yang juga dilaporkan gateway untuk permintaan nomor eskalasi, jawaban
-- di luar topik yang dikenali AI, "Maaf, saya belum bisa menjawab", dan kalimat baku cekbpom (tidak ditemukan, nama tidak
-- jelas). Tahap 'menjawab' yang masih tertahan jeda kirim 2 detik gateway saat penelepon menutup juga hilang. Bila KPI
-- harus lebih tepat, gateway mengirim tanda dijawab bersama aksi 'akhiri'.
create or replace function public.status_penyelesaian_akhir(
  p_status public.status_penyelesaian,
  p_dijawab_ai boolean,
  p_jenis_interaksi public.jenis_interaksi
)
returns public.status_penyelesaian
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status <> 'berjalan' then p_status
    when p_dijawab_ai and p_jenis_interaksi is distinct from 'pengaduan' then 'selesai_ai'
    else 'terputus'
  end
$$;

-- Tutup panggilan terbuka yang heartbeat-nya sudah lewat batas, termasuk yang statusnya sudah ditetapkan RPC tiket atau
-- pengaduan. Mengembalikan jumlah yang ditutup.
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
     set status_penyelesaian = public.status_penyelesaian_akhir(status_penyelesaian, dijawab_ai, jenis_interaksi),
         waktu_selesai = greatest(coalesce(heartbeat_terakhir, waktu_mulai), waktu_mulai),
         tahap_ai = null
   where waktu_selesai is null
     and coalesce(heartbeat_terakhir, waktu_mulai) < now() - public.batas_heartbeat_panggilan();
  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end;
$$;

-- Catat atau perbarui panggilan aktif: membuat baris bila belum ada, memperbarui tahap dan heartbeat bila ada.
-- Panggilan yang sudah ditutup tidak dibuka lagi. Nilai null berarti "tidak berubah".
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

  insert into public.percakapan as c (id, jenis_interaksi, topik, tahap_ai, heartbeat_terakhir, dijawab_ai)
  values (p_percakapan_id, p_jenis_interaksi, left(nullif(trim(p_topik), ''), 80), p_tahap, now(),
          p_tahap is not distinct from 'menjawab')
  on conflict (id) do update
     set jenis_interaksi = coalesce(excluded.jenis_interaksi, c.jenis_interaksi),
         topik = coalesce(excluded.topik, c.topik),
         tahap_ai = coalesce(excluded.tahap_ai, c.tahap_ai),
         heartbeat_terakhir = now(),
         dijawab_ai = c.dijawab_ai or excluded.dijawab_ai
   where c.waktu_selesai is null;

  perform public.tutup_panggilan_yatim();
end;
$$;

-- Tutup panggilan yang berakhir: waktu selesai terisi, status hasil alur lain tidak diubah.
-- Mengembalikan true bila ada panggilan terbuka yang ditutup.
create or replace function public.akhiri_panggilan_aktif(p_percakapan_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.percakapan
     set status_penyelesaian = public.status_penyelesaian_akhir(status_penyelesaian, dijawab_ai, jenis_interaksi),
         waktu_selesai = greatest(now(), waktu_mulai),
         tahap_ai = null
   where id = p_percakapan_id and waktu_selesai is null;
  return found;
end;
$$;

revoke execute on function public.status_penyelesaian_akhir(public.status_penyelesaian, boolean, public.jenis_interaksi) from public, anon, authenticated;
revoke execute on function public.tutup_panggilan_yatim() from public, anon, authenticated;
revoke execute on function public.laporkan_panggilan_aktif(uuid, public.jenis_interaksi, text, text) from public, anon, authenticated;
revoke execute on function public.akhiri_panggilan_aktif(uuid) from public, anon, authenticated;
grant execute on function public.status_penyelesaian_akhir(public.status_penyelesaian, boolean, public.jenis_interaksi) to service_role;
grant execute on function public.tutup_panggilan_yatim() to service_role;
grant execute on function public.laporkan_panggilan_aktif(uuid, public.jenis_interaksi, text, text) to service_role;
grant execute on function public.akhiri_panggilan_aktif(uuid) to service_role;

-- Daftar panggilan aktif untuk dashboard (REQ-4.2): belum ditutup dan heartbeat-nya masih segar, termasuk panggilan yang
-- tiketnya terbit selama penelepon masih tersambung. Nomor telepon hanya tersamar; hanya petugas terautentikasi yang dapat
-- membaca. Hak akses dari 20261103120100 tetap berlaku.
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
  and c.waktu_selesai is null
  and coalesce(c.heartbeat_terakhir, c.waktu_mulai) >= now() - public.batas_heartbeat_panggilan()
order by c.waktu_mulai desc;

-- REQ-4.2: panggilan yatim tetap ditutup walau tidak ada laporan panggilan. Tiap menit, sejalan dengan
-- batas_heartbeat_panggilan (60 detik). cron.schedule memperbarui jadwal bernama sama, jadi aman dijalankan ulang.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('tutup-panggilan-yatim', '* * * * *', 'select public.tutup_panggilan_yatim()');

-- NFR-13: nomor telepon dan nama pelapor di teks bebas disamarkan seperti penelepon_tersamar dan contoh SRS
-- ("0812****7890", "B*** S******"). Nomor 08…, 62…, atau +628… boleh dipisah spasi, titik, atau tanda hubung. Angka yang
-- menempel pada huruf atau angka lain, seperti nomor izin edar DBL0812345678A1 dan nomor tiket, bukan nomor telepon.
-- Kata nama yang kurang dari tiga huruf (inisial, "Al") dilewati karena mudah sama dengan kata biasa di kronologi.
-- ponytail: nomor yang ditulis sebagai kata, pemisah "/" atau "()", dan angka yang langsung menyusul nomor tidak ditangani
-- seperti samarkanNomorTelepon di Edge Function. Bila perlu, samarkan kronologi di Edge Function sebelum RPC.
create or replace function public.samarkan_teks_pelapor(p_teks text, p_nama text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_pola_nomor constant text := '(?<![[:alnum:]])(?:\+?62[ .-]?|0)8[0-9](?:[ .-]?[0-9]){7,10}';
  v_teks text;
  v_kata text;
begin
  -- Potongan teks ke-n diikuti nomor ke-n yang sudah dinormalkan ke awalan 0; potongan terakhir tanpa nomor.
  select string_agg(b.potongan || coalesce(left(n.nomor, 4) || repeat('*', length(n.nomor) - 8) || right(n.nomor, 4), ''),
                    '' order by b.urut)
    into v_teks
    from unnest(regexp_split_to_array(p_teks, c_pola_nomor)) with ordinality as b(potongan, urut)
    left join (
      select m.urut, regexp_replace(regexp_replace(m.cocok[1], '[^0-9]', '', 'g'), '^62', '0') as nomor
        from regexp_matches(p_teks, c_pola_nomor, 'g') with ordinality as m(cocok, urut)
    ) n on n.urut = b.urut;

  -- Kata nama hanya berisi huruf dan angka, jadi aman disisipkan ke pola.
  for v_kata in select k from regexp_split_to_table(p_nama, '[^[:alnum:]]+') as k where length(k) >= 3 loop
    v_teks := regexp_replace(v_teks, '\m' || v_kata || '\M', left(v_kata, 1) || repeat('*', length(v_kata) - 1), 'gi');
  end loop;
  return v_teks;
end;
$$;

-- authenticated perlu EXECUTE karena fungsi di dalam view diperiksa terhadap pengguna yang membaca view.
revoke execute on function public.samarkan_teks_pelapor(text, text) from public, anon;
grant execute on function public.samarkan_teks_pelapor(text, text) to authenticated, service_role;

-- Detail pengaduan (20261102150000): kronologi disamarkan saat dibaca; register pengaduan tetap menyimpan aslinya.
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
  ) as no_telp_tersamar
from public.tiket t
left join public.pengaduan pg on pg.tiket_id = t.id or pg.percakapan_id = t.percakapan_id
left join public.percakapan p on p.id = t.percakapan_id
left join public.penelepon_tersamar pt on pt.id = p.penelepon_id
where (select public.is_petugas());

-- Tiket ADU tanpa ringkasan dari klien menyalin kronologi, dan tabel tiket dapat dibaca petugas langsung (RLS
-- "Petugas membaca tiket"). Jadi ringkasan disamarkan saat ditulis. Isi sama dengan 20261102170000 selain ringkasan tiket.
create or replace function public.terbitkan_tiket_pengaduan(
  p_percakapan_id uuid,
  p_nama_produk text,
  p_kronologi text,
  p_nama_pelapor text,
  p_no_telp text,
  p_ringkasan text default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_penelepon_id uuid;
  v_jenis public.jenis_interaksi;
  v_status public.status_penyelesaian;
  v_tiket_id uuid;
  v_pengaduan_id uuid;
  v_tanggal date := (now() at time zone 'Asia/Jakarta')::date;
  v_urut int;
  v_no_tiket text;
begin
  -- Validasi kelengkapan data (BR-1, REQ-2.3)
  if p_nama_produk is null or trim(p_nama_produk) = '' then
    raise exception 'nama produk wajib diisi' using errcode = '22023';
  end if;
  if p_kronologi is null or trim(p_kronologi) = '' then
    raise exception 'kronologi wajib diisi' using errcode = '22023';
  end if;
  if p_nama_pelapor is null or trim(p_nama_pelapor) = '' then
    raise exception 'nama pelapor wajib diisi' using errcode = '22023';
  end if;
  if p_no_telp is null or trim(p_no_telp) = '' or p_no_telp !~ '^08[0-9]{8,11}$' then
    raise exception 'nomor telepon tidak valid' using errcode = '22023';
  end if;

  -- Kunci baris percakapan agar dua permintaan bersamaan tidak sama-sama lolos pemeriksaan status.
  select penelepon_id, jenis_interaksi, status_penyelesaian
    into v_penelepon_id, v_jenis, v_status
    from public.percakapan where id = p_percakapan_id for update;
  if not found then
    raise exception 'percakapan % tidak ditemukan', p_percakapan_id using errcode = 'P0002';
  end if;
  if v_jenis is distinct from 'pengaduan' or v_status <> 'berjalan' then
    raise exception 'percakapan tidak dapat diubah' using errcode = 'SG409';
  end if;

  -- Penelepon baru hanya dibuat bila percakapan belum punya; penelepon yang ada tidak diubah.
  -- Data pelapor lengkap tetap tersimpan pada register pengaduan.
  if v_penelepon_id is null then
    insert into public.penelepon (no_telp, nama_pelapor)
    values (p_no_telp, trim(p_nama_pelapor))
    returning id into v_penelepon_id;
  end if;

  update public.percakapan
     set penelepon_id = v_penelepon_id,
         jenis_interaksi = 'pengaduan',
         status_penyelesaian = 'tiket_terbit'
   where id = p_percakapan_id;

  insert into public.nomor_tiket_harian as n (jenis, tanggal, terakhir)
  values ('pengaduan', v_tanggal, 1)
  on conflict (jenis, tanggal) do update set terakhir = n.terakhir + 1
  returning terakhir into v_urut;

  v_no_tiket := 'ADU-' || to_char(v_tanggal, 'YYYYMMDD') || '-' || lpad(v_urut::text, 4, '0');

  insert into public.tiket (no_tiket, jenis, percakapan_id, ringkasan, status)
  values (v_no_tiket, 'pengaduan', p_percakapan_id,
          public.samarkan_teks_pelapor(coalesce(p_ringkasan, trim(p_kronologi)), trim(p_nama_pelapor)), 'belum_ditelaah')
  returning id into v_tiket_id;

  insert into public.pengaduan (
    percakapan_id, tiket_id, nama_produk, kronologi, nama_pelapor, nomor_telepon, kelengkapan
  ) values (
    p_percakapan_id, v_tiket_id, trim(p_nama_produk), trim(p_kronologi), trim(p_nama_pelapor), p_no_telp, true
  )
  on conflict (percakapan_id) do update set
    tiket_id = excluded.tiket_id,
    nama_produk = excluded.nama_produk,
    kronologi = excluded.kronologi,
    nama_pelapor = excluded.nama_pelapor,
    nomor_telepon = excluded.nomor_telepon,
    kelengkapan = true,
    tgl_pengaduan = now()
  returning id into v_pengaduan_id;

  return v_no_tiket;
end;
$$;

revoke execute on function public.terbitkan_tiket_pengaduan(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.terbitkan_tiket_pengaduan(uuid, text, text, text, text, text) to service_role;

-- Tiket ADU yang sudah ada: samarkan salinan kronologi yang tersimpan mentah.
update public.tiket t
   set ringkasan = public.samarkan_teks_pelapor(t.ringkasan, pg.nama_pelapor)
  from public.pengaduan pg
 where pg.tiket_id = t.id;
