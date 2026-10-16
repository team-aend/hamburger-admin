import crypto from 'node:crypto';
import { badRequest } from '../http/errors.js';

/**
 * 비밀번호 해시: Node 내장 scrypt. 저장 형식 "scrypt$N$r$p$salt$hash" (base64url)
 * 형식에 매개변수를 함께 저장해 나중에 강도를 올려도 기존 해시를 검증할 수 있다.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** 없는 아이디로 로그인할 때도 같은 시간이 걸리게 비교할 가짜 해시 */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

/** 임시 비밀번호: 헷갈리는 글자(0 O 1 l I)를 뺀 12자, 영문·숫자를 반드시 포함 */
const LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
export function generateTemporaryPassword(length = 12): string {
  const all = LETTERS + DIGITS;
  for (;;) {
    const value = Array.from({ length }, () => all[crypto.randomInt(all.length)]).join('');
    if (/[a-zA-Z]/.test(value) && /\d/.test(value)) return value;
  }
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

/** 새 비밀번호 규칙: 10~72자, 영문과 숫자 포함, 아이디를 포함하지 않음 */
export function assertPasswordPolicy(password: unknown, loginId: string): string {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw badRequest('WEAK_PASSWORD', `비밀번호는 ${PASSWORD_MIN}자 이상 ${PASSWORD_MAX}자 이하로 입력해 주세요.`);
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw badRequest('WEAK_PASSWORD', '비밀번호에는 영문과 숫자가 모두 들어가야 합니다.');
  }
  if (password.toLowerCase().includes(loginId.toLowerCase())) {
    throw badRequest('WEAK_PASSWORD', '비밀번호에 아이디를 넣을 수 없습니다.');
  }
  return password;
}
