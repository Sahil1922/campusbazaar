import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

await pool.query('SELECT 1'); // Fail fast if the database is unreachable.

const server = createApp().listen(config.port, () => {
  console.log(`CampusBazaar API listening on http://localhost:${config.port}`);
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
