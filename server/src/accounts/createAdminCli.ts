/**
 * 첫 최고 관리자 계정 만들기 (서버에서 한 번만)
 *   npm run admin:create -- <아이디> <이름>
 * 이후 관리자는 관리자 페이지에서 최고 관리자가 등록하거나, 가입 신청을 승인해 만든다.
 * 임시 비밀번호를 화면에 한 번만 출력한다. 처음 로그인할 때 바꿔야 한다.
 */
import { loadEnvironment, readConfig } from '../config.js';
import { createPgDatabase } from '../db/database.js';
import { AppError } from '../http/errors.js';
import { createAccount, parseNewAccount } from './accounts.js';

loadEnvironment();
const [loginId, ...nameParts] = process.argv.slice(2);
const { databaseUrl } = readConfig();

if (!loginId || nameParts.length === 0) {
  console.error('사용법: npm run admin:create -- <아이디> <이름>');
  process.exit(1);
}
if (!databaseUrl) {
  console.error('DATABASE_URL 이 설정되지 않았습니다. server/.env 를 확인해 주세요.');
  process.exit(1);
}

const db = createPgDatabase(databaseUrl);
try {
  const input = parseNewAccount({ loginId, name: nameParts.join(' ') });
  const { temporaryPassword } = await createAccount(db, { ...input, role: 'SUPER_ADMIN', createdBy: null }, new Date());
  console.log(`✅ 최고 관리자 계정을 만들었습니다: ${input.loginId} (${input.name})`);
  console.log(`   임시 비밀번호: ${temporaryPassword}`);
  console.log('   처음 로그인할 때 비밀번호를 바꿔야 합니다. 이 비밀번호는 다시 볼 수 없습니다.');
} catch (error) {
  console.error('❌', error instanceof AppError ? error.message : error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.close();
}
