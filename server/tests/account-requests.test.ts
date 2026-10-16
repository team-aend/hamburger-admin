import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createAdminAccount, login, startTestServer, type TestServer } from './helpers.js';

describe('관리자 가입 신청과 최고 관리자 승인', () => {
  let t: TestServer;
  let staffCookie: string;
  before(async () => {
    t = await startTestServer();
    await createAdminAccount(t.db, 'staff', '일반 관리자', 'staff-pass-1234', false, 'ADMIN');
    staffCookie = await login(t.url, 'staff', 'staff-pass-1234');
  });
  after(() => t.close());

  const apply = (body: Record<string, unknown>) => t.request('POST', '/api/auth/account-requests', body, { cookie: '' });
  const loginAs = (loginId: string, password: string) =>
    t.request('POST', '/api/auth/login', { loginId, password }, { cookie: '' });

  let requestId: string;

  it('로그인 없이 가입 신청할 수 있고, 같은 아이디는 중복 신청할 수 없다', async () => {
    const res = await apply({ loginId: 'New.Park', name: '박신규', password: 'park-burger-2026', message: '상품 데이터 입력 담당' });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    assert.equal((await apply({ loginId: 'new.park', name: '박신규', password: 'park-burger-2026' })).status, 409);
    assert.equal((await apply({ loginId: 'admin', name: '중복', password: 'other-pass-2026' })).status, 409, '이미 있는 계정 아이디');
    assert.equal((await apply({ loginId: 'new.weak', name: '약함', password: 'short' })).body.code, 'WEAK_PASSWORD');
  });

  it('승인 전에는 신청한 비밀번호로 로그인하면 "검토 중" 안내, 틀린 비밀번호는 일반 오류', async () => {
    const pending = await loginAs('new.park', 'park-burger-2026');
    assert.equal(pending.status, 403);
    assert.equal(pending.body.code, 'REQUEST_PENDING');
    assert.equal((await loginAs('new.park', 'wrong-pass-2026')).body.code, 'INVALID_CREDENTIALS');
  });

  it('일반 관리자는 신청 목록·계정 관리를 볼 수 없다', async () => {
    const res = await t.request('GET', '/api/admin/account-requests', undefined, { cookie: staffCookie });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'SUPER_ADMIN_REQUIRED');
    assert.equal((await t.request('GET', '/api/admin/accounts', undefined, { cookie: staffCookie })).status, 403);
    assert.equal((await t.request('GET', '/api/admin/products', undefined, { cookie: staffCookie })).status, 200, '상품 관리는 가능');
  });

  it('최고 관리자가 승인하면 신청한 비밀번호로 바로 로그인한다', async () => {
    const list = (await t.request('GET', '/api/admin/account-requests?status=PENDING')).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].message, '상품 데이터 입력 담당');
    assert.ok(!('passwordHash' in list[0]) && !('password_hash' in list[0]));
    requestId = list[0].id;

    const approved = await t.request('POST', `/api/admin/account-requests/${requestId}/approve`, { role: 'ADMIN' });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.account.loginId, 'new.park');
    assert.equal(approved.body.account.role, 'ADMIN');
    assert.equal(approved.body.account.createdByName, '관리자');

    const res = await loginAs('new.park', 'park-burger-2026');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.mustChangePassword, false);

    const again = await t.request('POST', `/api/admin/account-requests/${requestId}/approve`, {});
    assert.equal(again.body.code, 'ALREADY_REVIEWED');
  });

  it('반려하면 사유가 로그인 화면에 안내되고, 다시 신청할 수 있다', async () => {
    await apply({ loginId: 'new.choi', name: '최신청', password: 'choi-burger-2026' });
    const pending = (await t.request('GET', '/api/admin/account-requests?status=PENDING')).body.items[0];
    const rejected = await t.request('POST', `/api/admin/account-requests/${pending.id}/reject`, { reason: '외부 인원' });
    assert.equal(rejected.status, 204);

    const res = await loginAs('new.choi', 'choi-burger-2026');
    assert.equal(res.body.code, 'REQUEST_REJECTED');
    assert.match(res.body.message, /외부 인원/);

    const all = (await t.request('GET', '/api/admin/account-requests')).body.items;
    const row = all.find((r: { id: string }) => r.id === pending.id);
    assert.deepEqual([row.status, row.rejectReason, row.reviewedByName], ['REJECTED', '외부 인원', '관리자']);
  });

  it('최고 관리자 지정: 지정받으면 계정 관리를 할 수 있고, 자기 권한은 바꿀 수 없다', async () => {
    const accounts = (await t.request('GET', '/api/admin/accounts')).body.items;
    const staff = accounts.find((a: { loginId: string }) => a.loginId === 'staff');
    const promoted = await t.request('PATCH', `/api/admin/accounts/${staff.id}/role`, { role: 'SUPER_ADMIN' });
    assert.equal(promoted.body.role, 'SUPER_ADMIN');
    assert.equal((await t.request('GET', '/api/admin/accounts', undefined, { cookie: staffCookie })).status, 200);

    assert.equal((await t.request('PATCH', '/api/admin/accounts/1/role', { role: 'ADMIN' })).body.code, 'SELF_CHANGE_NOT_ALLOWED');
    assert.equal((await t.request('PATCH', `/api/admin/accounts/${staff.id}/role`, { role: 'OWNER' })).body.code, 'INVALID_ROLE');
  });

  it('승인·반려·권한 변경이 변경 기록에 남는다', async () => {
    const { rows } = await t.db.query<{ action: string }>(
      `SELECT action FROM admin_audit_logs WHERE action IN ('ADMIN_REQUEST_APPROVE', 'ADMIN_REQUEST_REJECT', 'ADMIN_ROLE_CHANGE') ORDER BY id`,
    );
    assert.deepEqual(rows.map((r) => r.action), ['ADMIN_REQUEST_APPROVE', 'ADMIN_REQUEST_REJECT', 'ADMIN_ROLE_CHANGE']);
  });
});

describe('가입 신청 남용 방지', () => {
  let t: TestServer;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  it('같은 IP 에서 1시간에 5번까지만 신청할 수 있다', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await t.request('POST', '/api/auth/account-requests', { loginId: `spam${i}`, name: '스팸', password: 'spam-pass-2026' }, { cookie: '' });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  });
});
