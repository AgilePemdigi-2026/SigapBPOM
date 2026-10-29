import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AstroCookies } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AdapterSesiSupabase,
  NAMA_COOKIE_SESI,
  NAMA_COOKIE_REFRESH,
  NAMA_COOKIE_PETUGAS,
  OPSI_COOKIE,
} from './sesiSupabase.ts';

class MockCookies implements Partial<AstroCookies> {
  store = new Map<string, { value: string; options?: any }>();

  get(name: string) {
    const item = this.store.get(name);
    return item ? { value: item.value } : undefined;
  }

  set(name: string, value: string, options?: any) {
    this.store.set(name, { value, options });
  }

  delete(name: string, options?: any) {
    this.store.delete(name);
  }
}

function buatMockSupabase(opsi: {
  loginSukses?: boolean;
  userSah?: boolean;
  refreshSukses?: boolean;
  namaPetugas?: string;
} = {}) {
  const loginSukses = opsi.loginSukses ?? true;
  const userSah = opsi.userSah ?? true;
  const refreshSukses = opsi.refreshSukses ?? true;
  const namaPetugas = opsi.namaPetugas ?? 'Budi Santoso';

  const client: any = {
    auth: {
      async signInWithPassword({ email, password }: any) {
        if (!loginSukses || password === 'salah') {
          return { data: { session: null, user: null }, error: new Error('Invalid credentials') };
        }
        return {
          data: {
            session: {
              access_token: 'token-akses-123',
              refresh_token: 'token-refresh-456',
            },
            user: {
              id: 'user-uuid-1',
              email,
              user_metadata: { nama: namaPetugas },
            },
          },
          error: null,
        };
      },

      async getUser(token: string) {
        if (!userSah || token === 'token-kedaluwarsa') {
          return { data: { user: null }, error: new Error('JWT expired') };
        }
        return {
          data: {
            user: {
              id: 'user-uuid-1',
              email: 'petugas@bpom.go.id',
              user_metadata: { nama: namaPetugas },
            },
          },
          error: null,
        };
      },

      async refreshSession({ refresh_token }: any) {
        if (!refreshSukses || refresh_token === 'refresh-gagal') {
          return { data: { session: null, user: null }, error: new Error('Cannot refresh') };
        }
        return {
          data: {
            session: {
              access_token: 'token-akses-baru',
              refresh_token: 'token-refresh-baru',
            },
            user: {
              id: 'user-uuid-1',
              email: 'petugas@bpom.go.id',
              user_metadata: { nama: namaPetugas },
            },
          },
          error: null,
        };
      },

      async signOut() {
        return { error: null };
      },
    },

    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: { nama: namaPetugas }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return client as SupabaseClient;
}

test('t_f3_1_03 login berhasil memasang cookie sesi, refresh, dan identitas petugas', async () => {
  const mockClient = buatMockSupabase({ loginSukses: true, namaPetugas: 'Ahmad BPOM' });
  const adapter = new AdapterSesiSupabase(mockClient);
  const cookies = new MockCookies() as unknown as AstroCookies;

  const petugas = await adapter.masuk('ahmad@pom.go.id', 'password123', cookies);

  assert.deepEqual(petugas, { nama: 'Ahmad BPOM', email: 'ahmad@pom.go.id' });
  assert.equal(cookies.get(NAMA_COOKIE_SESI)?.value, 'token-akses-123');
  assert.equal(cookies.get(NAMA_COOKIE_REFRESH)?.value, 'token-refresh-456');

  const petugasCookie = JSON.parse(cookies.get(NAMA_COOKIE_PETUGAS)?.value || '{}');
  assert.equal(petugasCookie.nama, 'Ahmad BPOM');
  assert.equal(petugasCookie.email, 'ahmad@pom.go.id');

  // Validasi opsi keamanan cookie (HttpOnly dan SameSite Lax)
  const opsi = (cookies as any).store.get(NAMA_COOKIE_SESI).options;
  assert.equal(opsi.httpOnly, true);
  assert.equal(opsi.sameSite, 'lax');
  assert.equal(opsi.path, '/');
});

test('t_f3_1_03 login gagal mengembalikan null dan tidak memasang cookie', async () => {
  const mockClient = buatMockSupabase({ loginSukses: false });
  const adapter = new AdapterSesiSupabase(mockClient);
  const cookies = new MockCookies() as unknown as AstroCookies;

  const petugas = await adapter.masuk('salah@pom.go.id', 'salah', cookies);

  assert.equal(petugas, null);
  assert.equal(cookies.get(NAMA_COOKIE_SESI), undefined);
});

test('t_f3_1_03 membaca sesi aktif dari cookie yang sah', async () => {
  const mockClient = buatMockSupabase({ userSah: true, namaPetugas: 'Siti Rahma' });
  const adapter = new AdapterSesiSupabase(mockClient);
  const cookies = new MockCookies() as unknown as AstroCookies;

  cookies.set(NAMA_COOKIE_SESI, 'token-akses-123');
  cookies.set(NAMA_COOKIE_PETUGAS, JSON.stringify({ nama: 'Siti Rahma', email: 'petugas@bpom.go.id' }));

  const petugas = await adapter.baca(cookies);
  assert.deepEqual(petugas, { nama: 'Siti Rahma', email: 'petugas@bpom.go.id' });
  assert.equal(adapter.kunci(cookies), 'token-akses-123');
});

test('t_f3_1_03 token kedaluwarsa diperbarui dengan refresh token', async () => {
  const mockClient = buatMockSupabase({ userSah: false, refreshSukses: true, namaPetugas: 'Siti Rahma' });
  const adapter = new AdapterSesiSupabase(mockClient);
  const cookies = new MockCookies() as unknown as AstroCookies;

  cookies.set(NAMA_COOKIE_SESI, 'token-kedaluwarsa');
  cookies.set(NAMA_COOKIE_REFRESH, 'token-refresh-456');

  const petugas = await adapter.baca(cookies);
  assert.equal(petugas?.email, 'petugas@bpom.go.id');
  assert.equal(cookies.get(NAMA_COOKIE_SESI)?.value, 'token-akses-baru');
  assert.equal(cookies.get(NAMA_COOKIE_REFRESH)?.value, 'token-refresh-baru');
});

test('t_f3_1_03 keluar menghapus seluruh cookie sesi', async () => {
  const mockClient = buatMockSupabase();
  const adapter = new AdapterSesiSupabase(mockClient);
  const cookies = new MockCookies() as unknown as AstroCookies;

  cookies.set(NAMA_COOKIE_SESI, 'token-123');
  cookies.set(NAMA_COOKIE_REFRESH, 'refresh-123');
  cookies.set(NAMA_COOKIE_PETUGAS, '{"nama":"Test"}');

  await adapter.keluar(cookies);

  assert.equal(cookies.get(NAMA_COOKIE_SESI), undefined);
  assert.equal(cookies.get(NAMA_COOKIE_REFRESH), undefined);
  assert.equal(cookies.get(NAMA_COOKIE_PETUGAS), undefined);
  assert.equal(adapter.kunci(cookies), null);
});
