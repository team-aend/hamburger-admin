import { Router } from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { iso, isoOrNull, isUniqueViolation, type Database, type Queryable } from '../db/database.js';
import { badRequest, conflict, handle, notFound } from '../http/errors.js';
import { generateTemporaryPassword, hashPassword } from './password.js';
import * as repo from './repository.js';

/**
 * 관리자 계정 관리: /api/admin/accounts, /api/admin/account-requests (최고 관리자 전용)
 *
 * 계정이 생기는 경로
 * 1. 최고 관리자가 직접 등록: 서버가 임시 비밀번호를 만들어 한 번만 보여주고, 받은 사람은 처음 로그인할 때 바꾼다.
 * 2. 가입 신청 승인: 신청자가 정한 비밀번호로 바로 로그인할 수 있다.
 */

export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,29}$/;

export function parseLoginId(value: unknown): string {
  const loginId = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    throw badRequest('INVALID_LOGIN_ID', '아이디는 4~30자의 영문 소문자, 숫자, . _ - 만 쓸 수 있습니다.');
  }
  return loginId;
}

export function parseName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 50) throw badRequest('INVALID_INPUT', '이름을 50자 이하로 입력해 주세요.');
  return name;
}

function parseRole(value: unknown): repo.Role {
  if (value === undefined) return 'ADMIN';
  if (!repo.ROLES.includes(value as repo.Role)) throw badRequest('INVALID_ROLE', '권한 값이 올바르지 않습니다.');
  return value as repo.Role;
}

export function parseNewAccount(body: unknown): { loginId: string; name: string; role: repo.Role } {
  const b = (body ?? {}) as Record<string, unknown>;
  return { loginId: parseLoginId(b.loginId), name: parseName(b.name), role: parseRole(b.role) };
}

/** 계정·대기 중인 신청 어디에도 없는 아이디인지 */
export async function assertLoginIdAvailable(db: Queryable, loginId: string): Promise<void> {
  const { rows } = await db.query<{ taken: string }>(
    `SELECT CASE
       WHEN EXISTS (SELECT 1 FROM admin_accounts WHERE login_id = $1) THEN 'ACCOUNT'
       WHEN EXISTS (SELECT 1 FROM admin_account_requests WHERE login_id = $1 AND status = 'PENDING') THEN 'REQUEST'
     END AS taken`,
    [loginId],
  );
  if (rows[0]?.taken === 'ACCOUNT') throw conflict('DUPLICATE_LOGIN_ID', '이미 사용 중인 아이디입니다.');
  if (rows[0]?.taken === 'REQUEST') throw conflict('DUPLICATE_LOGIN_ID', '가입 신청이 대기 중인 아이디입니다.');
}

/** 임시 비밀번호로 계정 생성. 관리자 페이지와 첫 최고 관리자 생성 명령어가 함께 쓴다. */
export async function createAccount(
  db: Queryable,
  input: { loginId: string; name: string; role: repo.Role; createdBy: string | null },
  now: Date,
): Promise<{ id: string; temporaryPassword: string }> {
  await assertLoginIdAvailable(db, input.loginId);
  const temporaryPassword = generateTemporaryPassword();
  try {
    const id = await repo.insertAccount(
      db,
      { ...input, passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
      now,
    );
    return { id, temporaryPassword };
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('DUPLICATE_LOGIN_ID', '이미 사용 중인 아이디입니다.');
    throw error;
  }
}

// ── 가입 신청 ──────────────────────────────────────────────

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface RequestRow {
  id: string;
  login_id: string;
  name: string;
  password_hash: string;
  message: string | null;
  status: RequestStatus;
  reviewed_by_name: string | null;
  reviewed_at: unknown;
  reject_reason: string | null;
  created_at: unknown;
}

const REQUEST_SELECT = `
  SELECT r.id::text, r.login_id, r.name, r.password_hash, r.message, r.status, a.name AS reviewed_by_name,
         r.reviewed_at, r.reject_reason, r.created_at
  FROM admin_account_requests r
  LEFT JOIN admin_accounts a ON a.id = r.reviewed_by`;

const toRequestView = (r: RequestRow) => ({
  id: r.id,
  loginId: r.login_id,
  name: r.name,
  message: r.message,
  status: r.status,
  reviewedByName: r.reviewed_by_name,
  reviewedAt: isoOrNull(r.reviewed_at),
  rejectReason: r.reject_reason,
  createdAt: iso(r.created_at),
});

/** 로그인 화면 안내용: 이 아이디의 가장 최근 신청 (계정이 없을 때만 쓴다) */
export async function findLatestRequest(db: Queryable, loginId: string): Promise<RequestRow | null> {
  const { rows } = await db.query<RequestRow>(
    `${REQUEST_SELECT} WHERE r.login_id = $1 AND r.status <> 'APPROVED' ORDER BY r.created_at DESC, r.id DESC LIMIT 1`,
    [loginId],
  );
  return rows[0] ?? null;
}

/** 대기 중인 신청이 너무 많으면 더 받지 않는다. (스팸 방지) */
const MAX_PENDING_REQUESTS = 50;

export async function submitRequest(
  db: Database,
  input: { loginId: string; name: string; passwordHash: string; message: string | null },
  now: Date,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await assertLoginIdAvailable(tx, input.loginId);
      const { rows } = await tx.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM admin_account_requests WHERE status = 'PENDING'`,
      );
      if (rows[0].count >= MAX_PENDING_REQUESTS) {
        throw badRequest('TOO_MANY_REQUESTS', '대기 중인 가입 신청이 많아 지금은 신청할 수 없습니다. 최고 관리자에게 문의해 주세요.');
      }
      await tx.query(
        `INSERT INTO admin_account_requests (login_id, name, password_hash, message, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [input.loginId, input.name, input.passwordHash, input.message, now],
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('DUPLICATE_LOGIN_ID', '가입 신청이 대기 중인 아이디입니다.');
    throw error;
  }
}

// ── 최고 관리자 기능 ──────────────────────────────────────────

export function createAccountService({ db, now }: { db: Database; now: () => Date }) {
  async function view(id: string) {
    const row = await repo.findById(db, id);
    if (!row) throw notFound('관리자 계정을 찾을 수 없습니다.');
    return repo.toAccountView(row, now());
  }

  async function lockRequest(tx: Queryable, id: string): Promise<RequestRow> {
    await tx.query(`SELECT 1 FROM admin_account_requests WHERE id = $1 FOR UPDATE`, [id]);
    const { rows } = await tx.query<RequestRow>(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
    const request = rows[0];
    if (!request) throw notFound('가입 신청을 찾을 수 없습니다.');
    if (request.status !== 'PENDING') throw conflict('ALREADY_REVIEWED', '이미 처리된 신청입니다.');
    return request;
  }

  /** 계정 상태를 바꾸는 공통 처리. 자기 계정은 바꿀 수 없다. (최고 관리자가 0명이 되지 않게) */
  async function changeAccount(
    adminId: string,
    id: string,
    selfMessage: string,
    fn: (tx: Queryable, before: repo.AccountRow) => Promise<void>,
  ) {
    if (id === adminId) throw badRequest('SELF_CHANGE_NOT_ALLOWED', selfMessage);
    await db.transaction(async (tx) => {
      const before = await repo.findById(tx, id, true);
      if (!before) throw notFound('관리자 계정을 찾을 수 없습니다.');
      await fn(tx, before);
    });
  }

  return {
    async list() {
      const at = now();
      return { items: (await repo.listAccounts(db)).map((row) => repo.toAccountView(row, at)) };
    },

    async create(adminId: string, input: { loginId: string; name: string; role: repo.Role }) {
      const { id, temporaryPassword } = await db.transaction(async (tx) => {
        const created = await createAccount(tx, { ...input, createdBy: adminId }, now());
        await recordAudit(tx, {
          adminId,
          action: 'ADMIN_CREATE',
          targetType: 'ADMIN_ACCOUNT',
          targetId: created.id,
          before: null,
          after: input,
        });
        return created;
      });
      return { account: await view(id), temporaryPassword };
    },

    /** 중지하면 그 계정의 로그인 세션이 바로 끊긴다. */
    async setActive(adminId: string, id: string, isActive: boolean) {
      await changeAccount(adminId, id, '자기 계정은 중지할 수 없습니다.', async (tx, before) => {
        if (before.is_active === isActive) return;
        await repo.setActive(tx, id, isActive, now());
        await recordAudit(tx, {
          adminId,
          action: isActive ? 'ADMIN_ACTIVATE' : 'ADMIN_DEACTIVATE',
          targetType: 'ADMIN_ACCOUNT',
          targetId: id,
          before: { isActive: before.is_active },
          after: { isActive },
        });
      });
      return view(id);
    },

    /** 최고 관리자 지정·해제 */
    async setRole(adminId: string, id: string, role: repo.Role) {
      await changeAccount(adminId, id, '자기 권한은 바꿀 수 없습니다.', async (tx, before) => {
        if (before.role === role) return;
        await repo.setRole(tx, id, role, now());
        await recordAudit(tx, {
          adminId,
          action: 'ADMIN_ROLE_CHANGE',
          targetType: 'ADMIN_ACCOUNT',
          targetId: id,
          before: { role: before.role },
          after: { role },
        });
      });
      return view(id);
    },

    /** 임시 비밀번호를 새로 만든다. 잠금도 풀리고 기존 로그인은 끊긴다. */
    async resetPassword(adminId: string, id: string) {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      await changeAccount(adminId, id, '자기 비밀번호는 "비밀번호 변경"에서 바꿔 주세요.', async (tx) => {
        await repo.setPassword(tx, id, passwordHash, true, now());
        await recordAudit(tx, {
          adminId,
          action: 'ADMIN_PASSWORD_RESET',
          targetType: 'ADMIN_ACCOUNT',
          targetId: id,
          before: null,
          after: { mustChangePassword: true },
        });
      });
      return { account: await view(id), temporaryPassword };
    },

    async listRequests(status: RequestStatus | null) {
      const { rows } = await db.query<RequestRow>(
        `${REQUEST_SELECT} WHERE ($1::text IS NULL OR r.status = $1)
         ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC, r.id DESC LIMIT 200`,
        [status],
      );
      return { items: rows.map(toRequestView) };
    },

    /** 승인: 신청자가 정한 비밀번호로 계정을 만든다. 신청 후 같은 아이디가 생겼으면 승인할 수 없다. */
    async approveRequest(adminId: string, id: string, role: repo.Role) {
      try {
        const accountId = await db.transaction(async (tx) => {
          const request = await lockRequest(tx, id);
          if (await repo.findByLoginId(tx, request.login_id)) {
            throw conflict('DUPLICATE_LOGIN_ID', '이미 같은 아이디의 계정이 있습니다. 반려해 주세요.');
          }
          const at = now();
          const accountId = await repo.insertAccount(
            tx,
            { loginId: request.login_id, name: request.name, passwordHash: request.password_hash, role, mustChangePassword: false, createdBy: adminId },
            at,
          );
          await tx.query(
            `UPDATE admin_account_requests SET status = 'APPROVED', reviewed_by = $2, reviewed_at = $3, account_id = $4 WHERE id = $1`,
            [id, adminId, at, accountId],
          );
          await recordAudit(tx, {
            adminId,
            action: 'ADMIN_REQUEST_APPROVE',
            targetType: 'ADMIN_ACCOUNT',
            targetId: accountId,
            before: { requestId: id },
            after: { loginId: request.login_id, name: request.name, role },
          });
          return accountId;
        });
        return { account: await view(accountId) };
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('DUPLICATE_LOGIN_ID', '이미 같은 아이디의 계정이 있습니다. 반려해 주세요.');
        throw error;
      }
    },

    async rejectRequest(adminId: string, id: string, reason: string | null) {
      await db.transaction(async (tx) => {
        const request = await lockRequest(tx, id);
        await tx.query(
          `UPDATE admin_account_requests SET status = 'REJECTED', reviewed_by = $2, reviewed_at = $3, reject_reason = $4 WHERE id = $1`,
          [id, adminId, now(), reason],
        );
        await recordAudit(tx, {
          adminId,
          action: 'ADMIN_REQUEST_REJECT',
          targetType: 'ADMIN_ACCOUNT_REQUEST',
          targetId: id,
          before: { loginId: request.login_id, name: request.name },
          after: { status: 'REJECTED' },
          reason,
        });
      });
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;

const idParam = (value: string | undefined, label: string) => {
  if (!value || !/^\d{1,18}$/.test(value)) throw badRequest('INVALID_ID', `${label} ID 가 올바르지 않습니다.`);
  return value;
};

export function createAccountRouter(service: AccountService): Router {
  const router = Router();

  router.get('/accounts', handle(async (_req, res) => {
    res.json(await service.list());
  }));

  router.post('/accounts', handle(async (req, res) => {
    res.status(201).json(await service.create(req.admin!.id, parseNewAccount(req.body)));
  }));

  router.patch('/accounts/:id/active', handle(async (req, res) => {
    const { isActive } = (req.body ?? {}) as { isActive?: unknown };
    if (typeof isActive !== 'boolean') throw badRequest('INVALID_INPUT', 'isActive 값이 올바르지 않습니다.');
    res.json(await service.setActive(req.admin!.id, idParam(req.params.id, '계정'), isActive));
  }));

  router.patch('/accounts/:id/role', handle(async (req, res) => {
    const { role } = (req.body ?? {}) as { role?: unknown };
    if (role === undefined) throw badRequest('INVALID_ROLE', '권한 값이 올바르지 않습니다.');
    res.json(await service.setRole(req.admin!.id, idParam(req.params.id, '계정'), parseRole(role)));
  }));

  router.post('/accounts/:id/reset-password', handle(async (req, res) => {
    res.json(await service.resetPassword(req.admin!.id, idParam(req.params.id, '계정')));
  }));

  router.get('/account-requests', handle(async (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
    if (status && !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) throw badRequest('INVALID_INPUT', '상태 값이 올바르지 않습니다.');
    res.json(await service.listRequests(status as RequestStatus | null));
  }));

  router.post('/account-requests/:id/approve', handle(async (req, res) => {
    const { role } = (req.body ?? {}) as { role?: unknown };
    res.json(await service.approveRequest(req.admin!.id, idParam(req.params.id, '신청'), parseRole(role)));
  }));

  router.post('/account-requests/:id/reject', handle(async (req, res) => {
    const { reason } = (req.body ?? {}) as { reason?: unknown };
    const text = typeof reason === 'string' ? reason.trim().slice(0, 200) || null : null;
    await service.rejectRequest(req.admin!.id, idParam(req.params.id, '신청'), text);
    res.status(204).end();
  }));

  return router;
}
