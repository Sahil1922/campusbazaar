// Creates the CampusBazaar database (if missing) and its tables from db/schema.sql.
// Safe to re-run: every statement uses CREATE ... IF NOT EXISTS.
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

const { database, ...connectionOptions } = config.db;
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  throw new Error('DB_NAME may contain only letters, digits and underscores.');
}

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const connection = await mysql.createConnection({ ...connectionOptions, multipleStatements: true });
try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await connection.query(`USE \`${database}\``);
  await connection.query(schema);
  const [tables] = await connection.query('SHOW TABLES');
  console.log(`Database "${database}" is ready with ${tables.length} tables.`);
} finally {
  await connection.end();
}
