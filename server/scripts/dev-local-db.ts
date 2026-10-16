/**
 * 실제 DB 없이 관리자 서버를 띄운다. (메모리 PostgreSQL + 테스트용 기본 데이터)
 * 최고 관리자 계정: admin / burger-admin-2026, 대기 중인 가입 신청 1건. 이미지 업로드는 가짜 저장소에 기록만 한다.
 *   npm run dev:local --workspace=server
 */
import { createApp } from '../src/app.js';
import { SessionCodec } from '../src/auth/session.js';
import { ADMIN, createTestDatabase, FakeStorage, login, productInput } from '../tests/helpers.js';

const db = await createTestDatabase();
const publicOrigin = process.env.ADMIN_PUBLIC_ORIGIN ?? 'http://localhost:5173';
const app = createApp({
  db,
  sessions: new SessionCodec('local-dev-secret-local-dev-secret-0000', false),
  storage: new FakeStorage(),
  publicOrigin,
});
const port = Number(process.env.PORT) || 4100;
app.listen(port, async () => {
  // 화면 확인용 상품 몇 개
  const base = `http://localhost:${port}`;
  const cookie = await login(base, ADMIN.loginId, ADMIN.password, publicOrigin);
  const names = ['와퍼', '불고기와퍼', '치즈와퍼'];
  for (const [i, name] of names.entries()) {
    await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: publicOrigin },
      body: JSON.stringify(productInput({ name, slug: `local-${i}` })),
    });
  }
  // 승인 화면 확인용 가입 신청 하나
  await fetch(`${base}/api/auth/account-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: publicOrigin },
    body: JSON.stringify({ loginId: 'staff.han', name: '한신청', password: 'han-burger-2026', message: '메뉴 데이터 입력 담당' }),
  });
  console.log(`🧪 로컬 메모리 DB 관리자 서버: ${base}`);
  console.log(`   최고 관리자 계정: ${ADMIN.loginId} / ${ADMIN.password}`);
});
