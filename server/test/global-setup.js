import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { testDb } from './test-db-config.js';

// Recreates the test database from db/schema.sql (and clears test uploads) once per test run.
export default async function setup() {
  await rm(path.join(os.tmpdir(), 'campusbazaar-test-uploads'), { recursive: true, force: true });
  const { database, ...options } = testDb;
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const connection = await mysql.createConnection({ ...options, multipleStatements: true });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await connection.query(`USE \`${database}\``);
    await connection.query(schema);
  } finally {
    await connection.end();
  }
}
