import { afterEach, expect, it, vi } from 'vitest';
import { deleteAccount } from '../api/profile.js';

afterEach(() => vi.unstubAllGlobals());

it('posts only self password and explicit confirmation with session credentials and CSRF', async () => {
  document.cookie = 'csrftoken=deletion-csrf; path=/';
  const fetch = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetch);
  await deleteAccount('Current-password');
  const [path, options] = fetch.mock.calls[0];
  expect(path).toBe('/api/v1/users/me/delete/');
  expect(options.method).toBe('POST');
  expect(options.credentials).toBe('include');
  expect(options.headers['X-CSRFToken']).toBe('deletion-csrf');
  expect(JSON.parse(options.body)).toEqual({ password: 'Current-password', confirmation: 'DELETE MY ACCOUNT' });
});
