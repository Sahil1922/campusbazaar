// Creates the CampusBazaar database (if missing) and its tables from db/schema.sql.
// Safe to re-run: tables use CREATE ... IF NOT EXISTS, seed rows use INSERT IGNORE, and the
// upgrade steps below only run when needed.
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

  // Upgrades for databases created before a schema change (CREATE TABLE IF NOT EXISTS skips them).
  // Sprint 2: listings.status gained 'deleted' (seller-deleted listings are kept for history).
  const [[statusColumn]] = await connection.query(
    `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'listings' AND COLUMN_NAME = 'status'`,
    [database],
  );
  if (!statusColumn.type.includes("'deleted'")) {
    await connection.query(
      "ALTER TABLE listings MODIFY status ENUM('active', 'in_auction', 'sold', 'removed', 'deleted') NOT NULL DEFAULT 'active'",
    );
    console.log('Upgraded listings.status to allow "deleted".');
  }

  // Negotiable prices (approved 16 Nov 2026).
  const [negotiableColumn] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'listings' AND COLUMN_NAME = 'price_negotiable'`,
    [database],
  );
  if (negotiableColumn.length === 0) {
    await connection.query('ALTER TABLE listings ADD COLUMN price_negotiable TINYINT(1) NOT NULL DEFAULT 0 AFTER price');
    console.log('Upgraded listings with a "price negotiable" option.');
  }

  // Sprint 3: one review per reviewer per seller per listing.
  const [reviewIndex] = await connection.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'uq_reviews_once'`,
    [database],
  );
  if (reviewIndex.length === 0) {
    await connection.query('ALTER TABLE reviews ADD UNIQUE KEY uq_reviews_once (reviewer_id, reviewee_id, listing_id)');
    console.log('Upgraded reviews with a one-review-per-listing rule.');
  }

  const [tables] = await connection.query('SHOW TABLES');
  console.log(`Database "${database}" is ready with ${tables.length} tables.`);
} finally {
  await connection.end();
}
