import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

/**
 * 메모리 기반 IP 별 요청 제한. 서버가 한 대일 때만 정확하다. (관리자 서버는 한 대로 운영)
 * 로그인하지 않은 사람도 부를 수 있는 API(가입 신청)에 붙인다.
 */
export function rateLimit({ windowMs, max, message }: { windowMs: number; max: number; message: string }): RequestHandler {
  const hits = new Map<string, number[]>();
  return (req, _res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      next(new AppError(429, 'RATE_LIMITED', message));
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear(); // 메모리 보호
    next();
  };
}
