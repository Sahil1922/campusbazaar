import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { app } from './helpers.js';

afterAll(() => pool.end());

describe('serving the built website from the API server (production setup)', () => {
  it('serves the app at / and for client-side routes such as /listings/5', async () => {
    for (const url of ['/', '/listings/5', '/auctions/12', '/admin/users']) {
      const res = await request(app).get(url).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('test-build');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('caches hashed build files for a long time', async () => {
    const res = await request(app).get('/assets/app-abc123.js').expect(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('keeps API and photo 404s as they are instead of returning the website', async () => {
    const api = await request(app).get('/api/does-not-exist').expect(404);
    expect(api.body).toEqual({ error: 'Not found.' });
    await request(app).get('/api').expect(404);
    await request(app).get('/uploads/listings/none.png').expect(404);
  });

  it('sends security headers that allow photo previews and same-origin connections only', async () => {
    const res = await request(app).get('/').expect(200);
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/img-src 'self' data: blob:/);
    // The test site runs on http://, so browsers must not be told to upgrade to https.
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
