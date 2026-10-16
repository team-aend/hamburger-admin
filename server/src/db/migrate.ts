import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvironment, readConfig } from '../config.js';
import { createPgDatabase, type Database } from './database.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

/**
 * server/migrations/*.sql 을 파일명 순서대로 한 트랜잭션에서 실행한다.
 * 사용자 서버와 같은 방식으로 모든 SQL 은 IF NOT EXISTS 로 작성해 여러 번 실행해도 안전하다.
 * 관리자 전용 테이블(admin_*)만 만든다. 사용자 서버의 테이블은 바꾸지 않는다.
 */
export async function runMigrations(db: Database, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  await db.transaction(async (tx) => {
    for (const file of files) {
      await tx.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
  });
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnvironment();
  const { databaseUrl } = readConfig();
  if (!databaseUrl) {
    console.error('DATABASE_URL 이 설정되지 않았습니다. server/.env 를 확인해 주세요.');
    process.exit(1);
  }
  const db = createPgDatabase(databaseUrl);
  try {
    const files = await runMigrations(db);
    files.forEach((f) => console.log(`✅ ${f}`));
    console.log(`🎉 관리자 마이그레이션 ${files.length}개 적용 완료`);
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
