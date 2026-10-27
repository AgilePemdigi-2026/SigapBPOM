INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) VALUES 
(
    '00000000-0000-0000-0000-000000000000', 
    '11111111-1111-1111-1111-111111111111', 
    'authenticated', 'authenticated', 'petugas@dummy.com', 
    crypt('PetugasDummy123', gen_salt('bf')), now(), now(), now()
);

INSERT INTO public.petugas (id, nama, hak_ekspor, gagal_login, terkunci_sampai) 
VALUES 
(
    '11111111-1111-1111-1111-111111111111', 
    'Petugas1', true, 0, NULL
);