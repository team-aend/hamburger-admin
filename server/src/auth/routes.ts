import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { findLatestRequest, parseLoginId, parseName, submitRequest } from '../accounts/accounts.js';
import { assertPasswordPolicy, getDummyHash, hashPassword, verifyPassword } from '../accounts/password.js';
import * as accounts from '../accounts/repository.js';
import { recordAudit } from '../audit/auditLog.js';
import { isoOrNull, type Database } from '../db/database.js';
import { AppError, badRequest, handle } from '../http/errors.js';
import { rateLimit } from '../http/rateLimit.js';
import type { SessionCodec } from './session.js';

/** 연속으로 이만큼 틀리면 잠근다. */
const MAX_LOGIN_FAILURES = 5;
const LOCK_MINUTES = 15;

export interface SessionAdmin {
  id: string;
  loginId: string;
  name: string;
  mustChangePassword: boolean;
  /** SUPER_ADMIN 만 계정 관리·가입 승인을 할 수 있다. */
  role: accounts.Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** requireAdmin 을 통과한 관리자 */
      admin?: SessionAdmin;
    }
  }
}

export interface AuthDeps {
  db: Database;
  sessions: SessionCodec | null;
  now: () => Date;
}

const toSessionAdmin = (row: accounts.AccountRow): SessionAdmin => ({
  id: row.id,
  loginId: row.login_id,
  name: row.name,
  mustChangePassword: row.must_change_password,
  role: row.role,
});

/** 세션 쿠키 → 사용 중인 계정. 중지됐거나 비밀번호가 바뀌어 세션 버전이 다르면 세션을 지운다. */
async function loadAccount(deps: AuthDeps, req: Request, res: Response): Promise<accounts.AccountRow | null> {
  const session = deps.sessions?.readSession(req);
  if (!session) return null;
  const row = await accounts.findById(deps.db, session.accountId);
  if (!row || !row.is_active || row.session_version !== session.sessionVersion) {
    deps.sessions!.clearSession(res);
    return null;
  }
  return row;
}

/**
 * /api/admin/* 전체에 붙인다. 화면 차단과 별개로 서버에서 매번 검사한다.
 * 임시 비밀번호로 로그인한 상태면 비밀번호를 바꾸기 전까지 관리 기능을 막는다.
 */
export function requireAdmin(deps: AuthDeps): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    loadAccount(deps, req, res)
      .then((row) => {
        if (!row) return next(new AppError(401, 'ADMIN_LOGIN_REQUIRED', '관리자 로그인이 필요합니다.'));
        if (row.must_change_password) {
          return next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', '임시 비밀번호를 먼저 바꿔 주세요.'));
        }
        req.admin = toSessionAdmin(row);
        next();
      })
      .catch(next);
  };
}

/** requireAdmin 뒤에 붙인다. 계정 관리·가입 승인은 최고 관리자만 */
export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (req.admin?.role !== 'SUPER_ADMIN') {
    next(new AppError(403, 'SUPER_ADMIN_REQUIRED', '최고 관리자만 할 수 있습니다.'));
    return;
  }
  next();
};

/**
 * 쓰기 요청은 관리자 화면에서 온 것만 받는다. (SameSite=Lax 쿠키에 더한 CSRF 방어)
 * Origin 헤더가 없는 요청(서버 간 호출, 일부 브라우저의 같은 출처 요청)은 쿠키 정책에 맡긴다.
 */
export function checkOrigin(publicOrigin: string): RequestHandler {
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (req.method !== 'GET' && req.method !== 'HEAD' && origin && origin !== publicOrigin) {
      next(new AppError(403, 'INVALID_ORIGIN', '허용되지 않은 요청입니다.'));
      return;
    }
    next();
  };
}

const INVALID_CREDENTIALS = () => new AppError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');

export function createAuthRouter(deps: AuthDeps): Router {
  const router = Router();
  const sessionsOrFail = () => {
    if (!deps.sessions) throw new AppError(503, 'SESSION_NOT_CONFIGURED', '관리자 서버에 ADMIN_SESSION_SECRET 이 설정되지 않았습니다.');
    return deps.sessions;
  };

  /** GET /api/auth/me — 로그인한 관리자, 아니면 null */
  router.get(
    '/me',
    handle(async (req, res) => {
      const row = await loadAccount(deps, req, res);
      res.set('Cache-Control', 'no-store');
      res.json({ user: row ? toSessionAdmin(row) : null });
    }),
  );

  /** POST /api/auth/login { loginId, password } */
  router.post(
    '/login',
    handle(async (req, res) => {
      const sessions = sessionsOrFail();
      const { loginId, password } = (req.body ?? {}) as { loginId?: unknown; password?: unknown };
      if (typeof loginId !== 'string' || typeof password !== 'string' || !loginId.trim() || !password) {
        throw badRequest('INVALID_INPUT', '아이디와 비밀번호를 입력해 주세요.');
      }
      const now = deps.now();
      const row = await accounts.findByLoginId(deps.db, loginId.trim().toLowerCase());

      if (!row) {
        // 가입 신청 상태는 신청할 때 정한 비밀번호가 맞을 때만 알려준다.
        const request = await findLatestRequest(deps.db, loginId.trim().toLowerCase());
        if (request && (await verifyPassword(password, request.password_hash))) {
          if (request.status === 'PENDING') {
            throw new AppError(403, 'REQUEST_PENDING', '가입 신청을 검토 중입니다. 최고 관리자가 승인하면 로그인할 수 있습니다.');
          }
          throw new AppError(
            403,
            'REQUEST_REJECTED',
            `가입 신청이 반려되었습니다.${request.reject_reason ? ` (사유: ${request.reject_reason})` : ''}`,
          );
        }
        // 없는 아이디도 같은 시간이 걸리게 해서 아이디 존재 여부를 알 수 없게 한다.
        if (!request) await verifyPassword(password, await getDummyHash());
        throw INVALID_CREDENTIALS();
      }
      const lockedUntil = isoOrNull(row.locked_until);
      if (lockedUntil && Date.parse(lockedUntil) > now.getTime()) {
        const minutes = Math.ceil((Date.parse(lockedUntil) - now.getTime()) / 60_000);
        throw new AppError(429, 'ACCOUNT_LOCKED', `비밀번호를 ${MAX_LOGIN_FAILURES}번 틀려 잠겼습니다. ${minutes}분 뒤에 다시 시도해 주세요.`);
      }
      if (!(await verifyPassword(password, row.password_hash))) {
        await accounts.recordLoginFailure(deps.db, row.id, now, MAX_LOGIN_FAILURES, LOCK_MINUTES);
        throw INVALID_CREDENTIALS();
      }
      // 비밀번호가 맞을 때만 중지 여부를 알려준다.
      if (!row.is_active) throw new AppError(403, 'ACCOUNT_DISABLED', '사용이 중지된 계정입니다. 다른 관리자에게 문의해 주세요.');

      await accounts.recordLoginSuccess(deps.db, row.id, now);
      sessions.setSession(res, { accountId: row.id, sessionVersion: row.session_version });
      res.json({ user: toSessionAdmin(row) });
    }),
  );

  /**
   * POST /api/auth/password { currentPassword, newPassword }
   * 임시 비밀번호 상태에서도 쓸 수 있다. 바꾸면 다른 곳의 로그인은 모두 끊기고 지금 세션만 새로 발급한다.
   */
  router.post(
    '/password',
    handle(async (req, res) => {
      const sessions = sessionsOrFail();
      const row = await loadAccount(deps, req, res);
      if (!row) throw new AppError(401, 'ADMIN_LOGIN_REQUIRED', '관리자 로그인이 필요합니다.');

      const { currentPassword, newPassword } = (req.body ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
      if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, row.password_hash))) {
        throw badRequest('WRONG_PASSWORD', '현재 비밀번호가 올바르지 않습니다.');
      }
      const next = assertPasswordPolicy(newPassword, row.login_id);
      if (next === currentPassword) throw badRequest('SAME_PASSWORD', '현재 비밀번호와 다른 비밀번호를 입력해 주세요.');

      const passwordHash = await hashPassword(next);
      const sessionVersion = await deps.db.transaction(async (tx) => {
        const version = await accounts.setPassword(tx, row.id, passwordHash, false, deps.now());
        await recordAudit(tx, {
          adminId: row.id,
          action: 'ADMIN_PASSWORD_CHANGE',
          targetType: 'ADMIN_ACCOUNT',
          targetId: row.id,
          before: { mustChangePassword: row.must_change_password },
          after: { mustChangePassword: false },
        });
        return version;
      });
      sessions.setSession(res, { accountId: row.id, sessionVersion });
      res.json({ user: { ...toSessionAdmin(row), mustChangePassword: false } });
    }),
  );

  /**
   * POST /api/auth/account-requests { loginId, name, password, message } — 관리자 가입 신청 (로그인 없이)
   * 최고 관리자가 승인하면 이 비밀번호로 로그인할 수 있다.
   */
  router.post(
    '/account-requests',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: '가입 신청을 너무 많이 보냈습니다. 1시간 뒤에 다시 시도해 주세요.' }),
    handle(async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const loginId = parseLoginId(b.loginId);
      const name = parseName(b.name);
      const password = assertPasswordPolicy(b.password, loginId);
      const message = typeof b.message === 'string' ? b.message.trim().slice(0, 300) || null : null;
      await submitRequest(deps.db, { loginId, name, passwordHash: await hashPassword(password), message }, deps.now());
      res.status(201).json({ status: 'PENDING' });
    }),
  );

  /** POST /api/auth/logout */
  router.post('/logout', (_req, res) => {
    deps.sessions?.clearSession(res);
    res.status(204).end();
  });

  return router;
}
