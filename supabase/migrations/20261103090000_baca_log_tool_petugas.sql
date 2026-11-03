-- Entity UC-04: petugas membaca log pemanggilan tool untuk halaman Pantau AI Agent (T-F5.4-01).
-- Hanya SELECT; penulisan log tetap lewat service_role (Voice Gateway / Edge Functions). Anon ditolak.
-- log_tool tidak menyimpan argumen tool, jadi tidak ada data pribadi yang terbuka.

grant select on public.log_tool to authenticated;
drop policy if exists "Petugas membaca log tool" on public.log_tool;
create policy "Petugas membaca log tool" on public.log_tool
  for select to authenticated using ((select public.is_petugas()));

-- Halaman pantau membaca log terbaru lebih dulu dengan batas kecil.
create index if not exists log_tool_waktu_idx on public.log_tool (waktu desc, id desc);
