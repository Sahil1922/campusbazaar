import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, asyncHandler, parseInput } from '../http.js';
import { requireAuth, requireRole } from '../auth/session.js';

const PAGE_SIZE = 20;

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
});

const userIdSchema = z.coerce.number().int().positive();

const statusChangeSchema = z.object({
  status: z.enum(['active', 'suspended'], { error: 'Status must be "active" or "suspended".' }),
  note: z.string().trim().max(500, 'Note must be at most 500 characters.').optional(),
});

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

const toAdminUser = (row) => ({
  id: Number(row.id),
  name: row.name,
  email: row.university_email,
  accountStatus: row.account_status,
  roles: row.roles ? row.roles.split(',') : [],
  createdAt: row.created_at,
});

export const adminRouter = Router();

// Every route below requires a signed-in administrator (UC-10–UC-12 business rules).
adminRouter.use(requireAuth, requireRole('admin'));

/** UC-12 Manage Users: list users, optionally filtered by name/email and status. */
adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { search, status, page } = parseInput(listQuerySchema, req.query);
    const where = [];
    const params = [];
    if (search) {
      where.push('(u.name LIKE ? OR u.university_email LIKE ?)');
      const pattern = `%${escapeLike(search)}%`;
      params.push(pattern, pattern);
    }
    if (status) {
      where.push('u.account_status = ?');
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.university_email, u.account_status, u.created_at,
              GROUP_CONCAT(r.role ORDER BY r.role) AS roles
         FROM users u
         LEFT JOIN user_roles r ON r.user_id = u.id
         ${whereSql}
        GROUP BY u.id
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );

    res.json({ users: rows.map(toAdminUser), page, pageSize: PAGE_SIZE, total: Number(total) });
  }),
);

/** UC-12 Manage Users: suspend or reactivate a user. The change and its audit record are saved together. */
adminRouter.patch(
  '/users/:id/status',
  asyncHandler(async (req, res) => {
    const targetId = parseInput(userIdSchema, req.params.id);
    const { status, note } = parseInput(statusChangeSchema, req.body);

    if (targetId === req.user.id) {
      throw new HttpError(400, 'You cannot change the status of your own account.');
    }

    const user = await withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        'SELECT id, account_status FROM users WHERE id = ? FOR UPDATE',
        [targetId],
      );
      if (rows.length === 0) throw new HttpError(404, 'This user no longer exists.');

      const [adminRole] = await conn.execute(
        "SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin'",
        [targetId],
      );
      if (adminRole.length > 0) {
        throw new HttpError(403, 'Administrator accounts cannot be suspended or reactivated here.');
      }

      if (rows[0].account_status !== status) {
        await conn.execute('UPDATE users SET account_status = ? WHERE id = ?', [status, targetId]);
        await conn.execute(
          `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, note)
           VALUES (?, ?, 'user', ?, ?)`,
          [req.user.id, status === 'suspended' ? 'suspend_user' : 'reactivate_user', targetId, note ?? null],
        );
      }

      const [updated] = await conn.execute(
        `SELECT u.id, u.name, u.university_email, u.account_status, u.created_at,
                GROUP_CONCAT(r.role ORDER BY r.role) AS roles
           FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
          WHERE u.id = ? GROUP BY u.id`,
        [targetId],
      );
      return toAdminUser(updated[0]);
    });

    res.json({ user });
  }),
);
