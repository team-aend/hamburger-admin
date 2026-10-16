import crypto from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';

/**
 * 관리자 세션 쿠키. 사용자 서버의 bp_session 과 이름·비밀값을 다르게 둔다.
 * (로컬에서는 쿠키가 포트와 무관하게 localhost 에 함께 저장되므로 이름이 겹치면 안 된다)
 */
export const SESSION_COOKIE = 'bpa_session';

const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12시간

export interface Session {
  accountId: string;
  /** admin_accounts.session_version 과 다르면 끊긴 세션 (비밀번호 변경·초기화·중지) */
  sessionVersion: number;
}

export class SessionCodec {
  private readonly secret: string;
  private readonly secure: boolean;

  constructor(secret: string, secure: boolean) {
    this.secret = secret;
    this.secure = secure;
  }

  private signature(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
  }

  private options(maxAge: number): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.secure, path: '/', maxAge };
  }

  setSession(res: Response, session: Session): void {
    const body = Buffer.from(
      JSON.stringify({ aid: session.accountId, sv: session.sessionVersion, exp: Date.now() + SESSION_MAX_AGE_MS }),
    ).toString('base64url');
    res.cookie(SESSION_COOKIE, `${body}.${this.signature(body)}`, this.options(SESSION_MAX_AGE_MS));
  }

  readSession(req: Request): Session | null {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return null;
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    // 디코딩한 바이트가 아니라 문자열을 비교한다. (base64url 은 끝 글자가 달라도 같은 바이트로 풀릴 수 있음)
    const expected = Buffer.from(this.signature(body));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as { aid: string; sv: number; exp: number };
      if (payload.exp <= Date.now() || typeof payload.aid !== 'string' || typeof payload.sv !== 'number') return null;
      return { accountId: payload.aid, sessionVersion: payload.sv };
    } catch {
      return null;
    }
  }

  clearSession(res: Response): void {
    const { maxAge: _maxAge, ...options } = this.options(0);
    res.clearCookie(SESSION_COOKIE, options);
  }
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const index = part.indexOf('=');
      if (index < 0) return [];
      try {
        return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
      } catch {
        return [];
      }
    }),
  );
}
