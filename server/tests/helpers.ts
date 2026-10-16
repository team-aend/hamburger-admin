import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { hashPassword } from '../src/accounts/password.js';
import { insertAccount, type Role } from '../src/accounts/repository.js';
import { createApp } from '../src/app.js';
import { SessionCodec } from '../src/auth/session.js';
import type { Database, Queryable } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import type { ImageStorage } from '../src/storage/imageStorage.js';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');
export const ORIGIN = 'http://admin.test';
/** 기본 최고 관리자 계정 (임시 비밀번호 상태가 아님) */
export const ADMIN = { loginId: 'admin', password: 'burger-admin-2026' };

/** 파라미터가 없으면 여러 문장을 한 번에 실행할 수 있게 exec 를 쓴다. (마이그레이션 파일) */
function queryable(target: PGlite | Transaction): Queryable {
  return {
    async query(text, params) {
      if (params && params.length > 0) return (await target.query(text, params)) as never;
      const results = await target.exec(text);
      return { rows: (results.at(-1)?.rows ?? []) as never };
    },
  };
}

/**
 * 실제 PostgreSQL(WASM)에 사용자 서버 스키마 + 관리자 마이그레이션을 올린 테스트 DB.
 * PGlite 는 연결이 하나라 트랜잭션은 차례로 실행된다.
 */
export async function createTestDatabase(): Promise<Database & { pg: PGlite }> {
  const pg = new PGlite();
  await pg.exec(fs.readFileSync(path.join(FIXTURES, 'backend_schema.sql'), 'utf8'));
  const db = {
    pg,
    ...queryable(pg),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) => pg.transaction((tx) => fn(queryable(tx))),
    close: () => pg.close(),
  };
  await runMigrations(db);
  await seed(db);
  return db;
}

/**
 * 기본 데이터
 * - 최고 관리자 계정 1: admin (ADMIN.password)
 * - 브랜드 1 버거킹, 2 맥도날드 / 카테고리 1 burger / 재료 1 소고기 패티, 2 양상추, 3 치즈 / 태그 1 매운맛
 */
async function seed(db: Queryable) {
  await createAdminAccount(db, ADMIN.loginId, '관리자', ADMIN.password, false, 'SUPER_ADMIN');
  await db.query(`
    INSERT INTO categories (id, name, slug) VALUES (1, '햄버거', 'burger'), (2, '사이드', 'side');
    INSERT INTO brands (id, name, slug, is_active) VALUES (1, '버거킹', 'burgerking', TRUE), (2, '맥도날드', 'mcdonalds', TRUE);
    INSERT INTO ingredients (id, name, slug, ingredient_group) VALUES (1, '소고기 패티', 'beef-patty', 'PATTY'), (2, '양상추', 'lettuce', 'TOPPING'), (3, '체다 치즈', 'cheddar', 'CHEESE_SAUCE');
    INSERT INTO tags (id, name, slug) VALUES (1, '매운맛', 'spicy');
    SELECT setval('brands_id_seq', 10); SELECT setval('categories_id_seq', 10);
    SELECT setval('ingredients_id_seq', 10); SELECT setval('tags_id_seq', 10);
  `);
}

/** 비밀번호를 정해서 계정을 만든다. (실제 서비스에서는 서버가 임시 비밀번호를 만든다) */
export async function createAdminAccount(
  db: Queryable,
  loginId: string,
  name: string,
  password: string,
  mustChangePassword: boolean,
  role: Role = 'ADMIN',
) {
  return insertAccount(db, { loginId, name, passwordHash: await hashPassword(password), role, mustChangePassword, createdBy: null }, new Date());
}

/** 로그인해서 세션 쿠키("이름=값")를 돌려준다. 실패하면 빈 문자열 */
export async function login(url: string, loginId: string, password: string, origin = ORIGIN): Promise<string> {
  const res = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ loginId, password }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

export class FakeStorage implements ImageStorage {
  uploaded: string[] = [];
  removed: string[] = [];
  async upload(folder: string) {
    const url = `https://storage.test/${folder}/${this.uploaded.length + 1}.png`;
    this.uploaded.push(url);
    return url;
  }
  async removeByUrl(url: string | null) {
    if (url) this.removed.push(url);
  }
}

export interface TestServer {
  db: Database & { pg: PGlite };
  storage: FakeStorage;
  url: string;
  /** 기본 관리자(admin) 세션 쿠키 */
  adminCookie: string;
  request(method: string, path: string, body?: unknown, options?: { cookie?: string; origin?: string | null }): Promise<{ status: number; body: any; headers: Headers }>;
  close(): Promise<void>;
}

export async function startTestServer(now?: () => Date): Promise<TestServer> {
  const db = await createTestDatabase();
  const storage = new FakeStorage();
  const app = createApp({
    db,
    sessions: new SessionCodec('test-secret-test-secret-test-secret-123', false),
    storage,
    publicOrigin: ORIGIN,
    now,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const adminCookie = await login(url, ADMIN.loginId, ADMIN.password);

  async function request(method: string, p: string, body?: unknown, options: { cookie?: string; origin?: string | null } = {}) {
    const headers: Record<string, string> = {};
    const cookie = options.cookie ?? adminCookie;
    if (cookie) headers.Cookie = cookie;
    const origin = options.origin === undefined ? ORIGIN : options.origin;
    if (origin) headers.Origin = origin;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${url}${p}`, { method, headers, body: payload, redirect: 'manual' });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }

  return {
    db,
    storage,
    url,
    adminCookie,
    request,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}

/** 판매 중인 기본 상품 입력 (단품 7,900원 + 세트) */
export function productInput(overrides: Record<string, unknown> = {}) {
  return {
    brandId: '1',
    categoryId: '1',
    name: '와퍼',
    slug: 'whopper',
    description: null,
    status: 'ACTIVE',
    isLimited: false,
    releasedAt: null,
    discontinuedAt: null,
    ingredientIds: ['2', '1'],
    tagIds: [],
    variants: [
      {
        name: '단품',
        variantType: 'SINGLE',
        isDefault: true,
        isActive: true,
        initialStorePrice: 7900,
        nutrition: { caloriesKcal: 642, proteinG: 28, sodiumMg: 980 },
      },
      { name: '세트', variantType: 'SET', isDefault: false, isActive: true, initialStorePrice: 9900, nutrition: null },
    ],
    ...overrides,
  };
}
