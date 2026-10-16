import pg from 'pg';

/** SQL 을 실행할 수 있는 연결. 트랜잭션 안의 연결도 같은 모양이다. */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Queryable {
  /** 한 연결에서 실행하고, 실패하면 전부 되돌린다. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createPgDatabase(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 60_000,
    statement_timeout: 10_000,
  });
  // 오류 객체에 접속 정보가 들어 있을 수 있어 출력하지 않는다.
  pool.on('error', () => console.error('DATABASE_POOL_ERROR'));

  return {
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (text, params) => client.query(text, params as unknown[]) as never });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** PostgreSQL 고유 제약 위반 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

/** pg 는 timestamptz 를 Date 로, PGlite 등은 문자열로 줄 수 있다. */
export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export function isoOrNull(value: unknown): string | null {
  return value == null ? null : iso(value);
}

/** DATE 컬럼은 YYYY-MM-DD 로 주고받는다. */
export function dateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}
