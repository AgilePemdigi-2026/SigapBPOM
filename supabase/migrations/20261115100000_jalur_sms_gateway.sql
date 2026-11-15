-- Jalur SMS Gateway: semua SMS SIGAP lewat satu antrean `notifikasi` dan satu adapter di Edge Function
-- kirim-notifikasi, sehingga saat penyedia SMS dipilih cukup menambah adapter resmi (adapter/sms.ts).
--
-- 1. Nomor tiket (REQ-2.4 untuk ADU, REQ-1.7 untuk ESK) diantrekan saat tiket terbit, lewat trigger di tabel tiket.
--    Voice Gateway tidak lagi mengirim SMS sendiri.
-- 2. klaim_notifikasi_tertunda ikut mengembalikan jenis, agar Edge Function memilih teks SMS yang tepat.
-- 3. pg_cron memanggil kirim-notifikasi tiap menit lewat pg_net, hanya bila ada antrean dan kedua rahasia Vault
--    sudah diisi. Tanpa rahasia itu tidak ada yang dipanggil, jadi antrean aman menunggu sampai SMS Gateway siap:
--      select vault.create_secret('https://<ref>.supabase.co', 'sigap_url_proyek');
--      select vault.create_secret('<SIGAP_KUNCI_INTERNAL>', 'sigap_kunci_internal');

-- 1. Jenis notifikasi baru. Nilai enum baru hanya dipakai di badan fungsi, jadi aman di migrasi yang sama.
alter type public.jenis_notifikasi add value if not exists 'nomor_tiket';

create or replace function public.antrekan_sms_nomor_tiket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifikasi (tiket_id, jenis)
  values (new.id, 'nomor_tiket')
  on conflict (tiket_id, jenis) do nothing;
  return null;
end;
$$;

revoke execute on function public.antrekan_sms_nomor_tiket() from public, anon, authenticated;

drop trigger if exists antrekan_sms_nomor_tiket on public.tiket;
create trigger antrekan_sms_nomor_tiket
after insert on public.tiket
for each row execute function public.antrekan_sms_nomor_tiket();

-- 2. Klaim ikut mengembalikan jenis. Tipe kembalian berubah, jadi fungsi dibuat ulang; isinya sama dengan
-- migrasi 20261105120000 selain kolom jenis.
drop function if exists public.klaim_notifikasi_tertunda(int, int);

create function public.klaim_notifikasi_tertunda(p_batas int, p_batas_percobaan int)
returns table (id uuid, no_tiket text, nomor_telepon text, jenis public.jenis_notifikasi)
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
    returning n.id, n.tiket_id, n.jenis
  )
  -- Nomor tujuan dibaca di server: register pengaduan dulu, lalu penelepon percakapan tiket.
  select d.id, t.no_tiket, coalesce(nullif(p.nomor_telepon, ''), pl.no_telp), d.jenis
  from diklaim d
  join public.tiket t on t.id = d.tiket_id
  left join public.pengaduan p on p.tiket_id = t.id
  left join public.percakapan c on c.id = t.percakapan_id
  left join public.penelepon pl on pl.id = c.penelepon_id;
end;
$$;

revoke execute on function public.klaim_notifikasi_tertunda(int, int) from public, anon, authenticated;
grant execute on function public.klaim_notifikasi_tertunda(int, int) to service_role;

-- 3. Pemicu kirim-notifikasi dari pg_cron.
create extension if not exists pg_net with schema extensions;

-- Mengembalikan id permintaan pg_net, atau null bila tidak ada yang dipanggil (antrean kosong, rahasia belum diisi).
-- ponytail: notifikasi gagal dicoba lagi tiap menit (5 kali = BATAS_PERCOBAAN_KIRIM, habis dalam ~5 menit bila
-- penyedia SMS sedang down); tambahkan jeda bertingkat di klaim bila itu terjadi di produksi.
create or replace function public.picu_kirim_notifikasi()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_kunci text;
begin
  if not exists (
    select 1
    from public.notifikasi n
    where n.percobaan < 5
      and (
        n.status_kirim in ('tertunda', 'gagal')
        or (n.status_kirim = 'mengirim' and n.diklaim_pada < now() - interval '10 minutes')
      )
  ) then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'sigap_url_proyek';
  select decrypted_secret into v_kunci from vault.decrypted_secrets where name = 'sigap_kunci_internal';
  if nullif(btrim(v_url), '') is null or nullif(btrim(v_kunci), '') is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(btrim(v_url), '/') || '/functions/v1/kirim-notifikasi',
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sigap-kunci', v_kunci),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.picu_kirim_notifikasi() from public, anon, authenticated;

-- cron.schedule memperbarui jadwal bernama sama, jadi aman dijalankan ulang.
select cron.schedule('kirim-notifikasi-sms', '* * * * *', 'select public.picu_kirim_notifikasi()');
