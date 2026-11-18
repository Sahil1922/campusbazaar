import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The config is read once at import, so each case re-imports it with different variables.
const original = { DB_SSL: process.env.DB_SSL, DB_SSL_CA: process.env.DB_SSL_CA };

async function loadConfig(env) {
  Object.assign(process.env, env);
  vi.resetModules();
  return (await import('../src/config.js')).config;
}

afterEach(() => Object.assign(process.env, original));

describe('encrypted database connections (DB_SSL)', () => {
  it('connects without TLS by default (local development)', async () => {
    const config = await loadConfig({ DB_SSL: '', DB_SSL_CA: '' });
    expect(config.db.ssl).toBeUndefined();
  });

  it('turns on TLS and always verifies the server certificate when DB_SSL=true', async () => {
    const config = await loadConfig({ DB_SSL: 'true', DB_SSL_CA: '' });
    expect(config.db.ssl).toEqual({ rejectUnauthorized: true, verifyIdentity: true });
  });

  it('uses the provider CA certificate from DB_SSL_CA', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'campusbazaar-ca-'));
    const caFile = path.join(dir, 'ca.pem');
    writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n');
    const config = await loadConfig({ DB_SSL: 'true', DB_SSL_CA: caFile });
    expect(config.db.ssl).toEqual({ rejectUnauthorized: true, verifyIdentity: true, ca: expect.stringContaining('BEGIN CERTIFICATE') });
  });

  it('refuses unclear settings instead of silently connecting without encryption', async () => {
    await expect(loadConfig({ DB_SSL: 'yes', DB_SSL_CA: '' })).rejects.toThrow('DB_SSL must be true or false');
    await expect(loadConfig({ DB_SSL: 'false', DB_SSL_CA: '/some/ca.pem' })).rejects.toThrow('DB_SSL is not true');
  });
});
