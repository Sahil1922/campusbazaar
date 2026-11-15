// Grants the Administrator role to an existing account.
// Usage: npm run make-admin -- student@youruniversity.ac.in
import { pool } from '../src/db.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- <registered university email>');
  process.exit(1);
}

try {
  const [rows] = await pool.execute('SELECT id FROM users WHERE university_email = ?', [email]);
  if (rows.length === 0) {
    console.error(`No account found for ${email}. The user must complete registration first.`);
    process.exitCode = 1;
  } else {
    await pool.execute("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')", [rows[0].id]);
    console.log(`${email} is now an administrator.`);
  }
} finally {
  await pool.end();
}
