import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { closeRealtime, initRealtime } from './realtime.js';
import { settleDueAuctions } from './auctions/settle.js';

await pool.query('SELECT 1'); // Fail fast if the database is unreachable.

const server = createApp().listen(config.port, () => {
  console.log(`CampusBazaar API listening on http://localhost:${config.port}`);
});
initRealtime(server);

// End auctions when their server-side end time passes (and notify winners), even if nobody is watching.
const SETTLE_EVERY_MS = 5000;
let settling = false;
const settleTimer = setInterval(async () => {
  if (settling) return;
  settling = true;
  try {
    await settleDueAuctions();
  } catch (error) {
    console.error('Auction settlement failed', error);
  } finally {
    settling = false;
  }
}, SETTLE_EVERY_MS);

const shutdown = () => {
  clearInterval(settleTimer);
  closeRealtime()
    .then(() => new Promise((resolve) => server.close(resolve)))
    .then(() => pool.end())
    .then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
