import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: false,
  decimalNumbers: false,
});

// Store and compare every DATETIME in UTC, regardless of the MySQL server's time zone.
pool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

/**
 * Runs `work(connection)` inside a transaction and commits, or rolls back on error.
 */
export async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
