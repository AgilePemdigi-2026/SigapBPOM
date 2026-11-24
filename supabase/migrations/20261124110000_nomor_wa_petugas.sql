-- Nomor WhatsApp petugas (ADR 0006). Tombol Chat WhatsApp membuka WhatsApp yang sedang login di perangkat petugas, jadi
-- nomor ini tidak menentukan pengirim; panel kontak menampilkannya sebagai pengingat WhatsApp mana yang dipakai.
-- Petugas sudah bisa membaca barisnya sendiri (kebijakan "Petugas membaca datanya sendiri").
alter table public.petugas
  add column if not exists no_wa text check (no_wa is null or no_wa ~ '^08[0-9]{8,11}$');
