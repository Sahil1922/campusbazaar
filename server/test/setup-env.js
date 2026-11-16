import os from 'node:os';
import path from 'node:path';
import { testDb } from './test-db-config.js';

process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'campusbazaar-test-uploads');

// Runs before each test file, before the app's config is imported.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-characters-long';
process.env.ALLOWED_EMAIL_DOMAINS = 'uni.test,students.uni.test';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SMTP_HOST = '';
process.env.DB_HOST = testDb.host;
process.env.DB_PORT = String(testDb.port);
process.env.DB_USER = testDb.user;
process.env.DB_PASSWORD = testDb.password;
process.env.DB_NAME = testDb.database;
