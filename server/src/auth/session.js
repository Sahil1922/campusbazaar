import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError, asyncHandler } from '../http.js';

export const SESSION_COOKIE = 'cb_session';

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'strict',
  path: '/',
});

export function startSession(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: config.sessionDays * 24 * 60 * 60 * 1000 });
}

export function endSession(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** Loads a user and their roles from the database (the source of truth for status and roles). */
export async function loadUser(userId) {
  const [rows] = await pool.execute(
    `SELECT id, name, university_email, account_status, created_at
       FROM users WHERE id = ?`,
    [userId],
  );
  if (rows.length === 0) return null;
  const [roleRows] = await pool.execute('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role', [userId]);
  const user = rows[0];
  return {
    id: Number(user.id),
    name: user.name,
    email: user.university_email,
    accountStatus: user.account_status,
    createdAt: user.created_at,
    roles: roleRows.map((r) => r.role),
  };
}

function readSessionUserId(req) {
  return userIdFromToken(req.cookies?.[SESSION_COOKIE]);
}

/** Returns the user id in a valid session token, or null. Also used to authenticate Socket.IO connections. */
export function userIdFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Requires a signed-in, active user. Status and roles are re-read from the database on
 * every request, so a suspension or role change takes effect immediately.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const userId = readSessionUserId(req);
  const user = userId ? await loadUser(userId) : null;
  if (!user) {
    endSession(res);
    throw new HttpError(401, 'Please sign in to continue.');
  }
  if (user.accountStatus !== 'active') {
    endSession(res);
    throw new HttpError(403, 'Your account has been suspended. Contact an administrator.');
  }
  req.user = user;
  next();
});

/** Requires the signed-in user to hold at least one of the given roles. Use after requireAuth. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.some((role) => req.user.roles.includes(role))) {
      next(new HttpError(403, 'You do not have permission to do this.'));
      return;
    }
    next();
  };
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    accountStatus: user.accountStatus,
    createdAt: user.createdAt,
  };
}
