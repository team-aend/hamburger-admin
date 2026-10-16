import { iso, isoOrNull, type Queryable } from '../db/database.js';

export const ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** 관리자 계정 SQL. 비밀번호 해시는 로그인·변경에만 꺼내고 응답에는 넣지 않는다. */

export interface AccountRow {
  id: string;
  login_id: string;
  name: string;
  password_hash: string;
  role: Role;
  must_change_password: boolean;
  is_active: boolean;
  session_version: number;
  failed_login_count: number;
  locked_until: unknown;
  last_login_at: unknown;
  created_at: unknown;
  created_by_name: string | null;
}

const SELECT = `
  SELECT a.id::text, a.login_id, a.name, a.password_hash, a.role, a.must_change_password, a.is_active, a.session_version,
         a.failed_login_count, a.locked_until, a.last_login_at, a.created_at, c.name AS created_by_name
  FROM admin_accounts a
  LEFT JOIN admin_accounts c ON c.id = a.created_by`;

export async function findById(db: Queryable, id: string, lock = false): Promise<AccountRow | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  if (lock) await db.query(`SELECT 1 FROM admin_accounts WHERE id = $1 FOR UPDATE`, [id]);
  const { rows } = await db.query<AccountRow>(`${SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findByLoginId(db: Queryable, loginId: string): Promise<AccountRow | null> {
  const { rows } = await db.query<AccountRow>(`${SELECT} WHERE a.login_id = $1`, [loginId]);
  return rows[0] ?? null;
}

export async function listAccounts(db: Queryable): Promise<AccountRow[]> {
  const { rows } = await db.query<AccountRow>(`${SELECT} ORDER BY a.is_active DESC, a.role DESC, a.created_at, a.id`);
  return rows;
}

export async function insertAccount(
  db: Queryable,
  input: { loginId: string; name: string; passwordHash: string; role: Role; mustChangePassword: boolean; createdBy: string | null },
  now: Date,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO admin_accounts (login_id, name, password_hash, role, must_change_password, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id::text`,
    [input.loginId, input.name, input.passwordHash, input.role, input.mustChangePassword, input.createdBy, now],
  );
  return rows[0].id;
}

/** 비밀번호를 바꾸면 세션 버전을 올려 다른 곳의 로그인을 모두 끊는다. */
export async function setPassword(db: Queryable, id: string, passwordHash: string, mustChange: boolean, now: Date): Promise<number> {
  const { rows } = await db.query<{ session_version: number }>(
    `UPDATE admin_accounts
     SET password_hash = $2, must_change_password = $3, session_version = session_version + 1,
         failed_login_count = 0, locked_until = NULL, updated_at = $4
     WHERE id = $1 RETURNING session_version`,
    [id, passwordHash, mustChange, now],
  );
  return rows[0].session_version;
}

export async function setActive(db: Queryable, id: string, isActive: boolean, now: Date): Promise<void> {
  await db.query(
    `UPDATE admin_accounts SET is_active = $2, session_version = session_version + 1, updated_at = $3 WHERE id = $1`,
    [id, isActive, now],
  );
}

export async function setRole(db: Queryable, id: string, role: Role, now: Date): Promise<void> {
  await db.query(`UPDATE admin_accounts SET role = $2, updated_at = $3 WHERE id = $1`, [id, role, now]);
}

/** 로그인 실패를 센다. 연속 maxFailures 번이면 lockMinutes 동안 잠그고 횟수를 0 으로 되돌린다. */
export async function recordLoginFailure(db: Queryable, id: string, now: Date, maxFailures: number, lockMinutes: number) {
  const { rows } = await db.query<{ locked_until: unknown }>(
    `UPDATE admin_accounts SET
       locked_until = CASE WHEN failed_login_count + 1 >= $3 THEN $2::timestamptz + make_interval(mins => $4) ELSE locked_until END,
       failed_login_count = CASE WHEN failed_login_count + 1 >= $3 THEN 0 ELSE failed_login_count + 1 END
     WHERE id = $1 RETURNING locked_until`,
    [id, now, maxFailures, lockMinutes],
  );
  return isoOrNull(rows[0]?.locked_until);
}

export async function recordLoginSuccess(db: Queryable, id: string, now: Date): Promise<void> {
  await db.query(
    `UPDATE admin_accounts SET failed_login_count = 0, locked_until = NULL, last_login_at = $2 WHERE id = $1`,
    [id, now],
  );
}

/** 화면에 보낼 형태 */
export function toAccountView(row: AccountRow, now: Date) {
  const lockedUntil = isoOrNull(row.locked_until);
  return {
    id: row.id,
    loginId: row.login_id,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    isLocked: lockedUntil !== null && Date.parse(lockedUntil) > now.getTime(),
    lastLoginAt: isoOrNull(row.last_login_at),
    createdAt: iso(row.created_at),
    createdByName: row.created_by_name,
  };
}
