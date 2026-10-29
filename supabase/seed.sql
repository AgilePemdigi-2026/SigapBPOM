-- Kolom token diisi string kosong dan identitas email dibuat, karena Supabase Auth gagal login
-- ("Database error querying schema") bila kolom itu NULL atau identitasnya tidak ada.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data
) VALUES 
(
    '00000000-0000-0000-0000-000000000000', 
    '11111111-1111-1111-1111-111111111111', 
    'authenticated', 'authenticated', 'petugas@dummy.com', 
    crypt('PetugasDummy123', gen_salt('bf')), now(), now(), now(),
    '', '', '', '',
    '{"provider": "email", "providers": ["email"]}', '{}'
);

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
VALUES
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'email',
    '{"sub": "11111111-1111-1111-1111-111111111111", "email": "petugas@dummy.com", "email_verified": true}',
    now(), now(), now()
);

INSERT INTO public.petugas (id, nama, hak_ekspor, gagal_login, terkunci_sampai) 
VALUES 
(
    '11111111-1111-1111-1111-111111111111', 
    'Petugas1', true, 0, NULL
);