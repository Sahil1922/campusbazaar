import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { testDb } from './test-db-config.js';

// Recreates the test database from db/schema.sql once per test run.
export default async function setup() {
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
