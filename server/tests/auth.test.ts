import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ADMIN, createAdminAccount, login, ORIGIN, startTestServer, type TestServer } from './helpers.js';

describe('관리자 로그인', () => {
  let t: TestServer;
  let clock = new Date('2026-10-16T09:00:00.000Z');
  before(async () => {
    t = await startTestServer(() => clock);
  });
  after(() => t.close());

  const loginRequest = (loginId: string, password: string) =>
    t.request('POST', '/api/auth/login', { loginId, password }, { cookie: '' });

  it('세션이 없으면 관리자 API 는 401', async () => {
    const res = await t.request('GET', '/api/admin/products', undefined, { cookie: '' });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED');
  });

  it('아이디·비밀번호로 로그인하면 /api/auth/me 가 관리자를 돌려준다', async () => {
    const res = await loginRequest(' ADMIN ', ADMIN.password);
    assert.equal(res.status, 200, '아이디는 대소문자·앞뒤 공백을 무시');
    const me = await t.request('GET', '/api/auth/me');
    assert.deepEqual(me.body.user, { id: '1', loginId: 'admin', name: '관리자', mustChangePassword: false, role: 'SUPER_ADMIN' });
  });

  it('틀린 비밀번호와 없는 아이디는 같은 메시지', async () => {
    const wrong = await loginRequest(ADMIN.loginId, 'wrong-password-1');
    const missing = await loginRequest('nobody', 'wrong-password-1');
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, missing.body);
    assert.equal(wrong.headers.get('set-cookie'), null);
  });

  it('5번 연속 틀리면 15분 동안 잠기고, 시간이 지나면 풀린다', async () => {
    await createAdminAccount(t.db, 'locker', '잠김', 'locker-pass-1234', false);
    for (let i = 0; i < 5; i++) assert.equal((await loginRequest('locker', `bad-pass-${i}000`)).status, 401);

    const locked = await loginRequest('locker', 'locker-pass-1234');
    assert.equal(locked.status, 429, '맞는 비밀번호도 잠금 중에는 거부');
    assert.equal(locked.body.code, 'ACCOUNT_LOCKED');

    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    assert.equal((await loginRequest('locker', 'locker-pass-1234')).status, 200);
  });

  it('임시 비밀번호로 로그인하면 비밀번호를 바꾸기 전까지 관리 기능을 쓸 수 없다', async () => {
    await createAdminAccount(t.db, 'newbie', '신규', 'temp-pass-1234', true);
    const cookie = await login(t.url, 'newbie', 'temp-pass-1234');

    const blocked = await t.request('GET', '/api/admin/products', undefined, { cookie });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');

    const weak = await t.request('POST', '/api/auth/password', { currentPassword: 'temp-pass-1234', newPassword: 'short1' }, { cookie });
    assert.equal(weak.body.code, 'WEAK_PASSWORD');
    const hasId = await t.request('POST', '/api/auth/password', { currentPassword: 'temp-pass-1234', newPassword: 'newbie-123456' }, { cookie });
    assert.equal(hasId.body.code, 'WEAK_PASSWORD', '아이디를 포함한 비밀번호');

    const changed = await t.request('POST', '/api/auth/password', { currentPassword: 'temp-pass-1234', newPassword: 'burger-pick-77' }, { cookie });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const newCookie = (changed.headers.get('set-cookie') ?? '').split(';')[0];

    assert.equal((await t.request('GET', '/api/admin/products', undefined, { cookie: newCookie })).status, 200);
    assert.equal((await t.request('GET', '/api/admin/products', undefined, { cookie })).status, 401, '이전 세션은 끊긴다');
  });

  it('다른 출처에서 온 쓰기 요청은 403', async () => {
    const res = await t.request('POST', '/api/admin/brands', { name: 'x', slug: 'x' }, { origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'INVALID_ORIGIN');
  });

  it('위조한 세션 쿠키는 무시한다', async () => {
    const [name, token] = t.adminCookie.split('=');
    const [body, signature] = token.split('.');

    // 서명은 그대로 두고 계정 ID 만 바꾼 쿠키
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    const swapped = Buffer.from(JSON.stringify({ ...payload, aid: '2' })).toString('base64url');
    const res = await t.request('GET', '/api/auth/me', undefined, { cookie: `${name}=${swapped}.${signature}` });
    assert.equal(res.body.user, null);

    // 서명 끝 글자만 바꾼 쿠키
    const last = signature.at(-1) === 'A' ? 'B' : 'A';
    const tampered = await t.request('GET', '/api/admin/products', undefined, {
      cookie: `${name}=${body}.${signature.slice(0, -1)}${last}`,
    });
    assert.equal(tampered.status, 401);
  });
});

describe('관리자 계정 관리', () => {
  let t: TestServer;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  let staffId: string;
  let temporaryPassword: string;

  it('계정을 만들면 임시 비밀번호를 한 번 돌려주고, 그 비밀번호로 로그인할 수 있다', async () => {
    const res = await t.request('POST', '/api/admin/accounts', { loginId: 'Staff.Kim', name: '김직원' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.account.loginId, 'staff.kim');
    assert.equal(res.body.account.mustChangePassword, true);
    assert.equal(res.body.account.createdByName, '관리자');
    assert.match(res.body.temporaryPassword, /^[a-zA-Z2-9]{12}$/);
    staffId = res.body.account.id;
    temporaryPassword = res.body.temporaryPassword;

    const me = await t.request('GET', '/api/auth/me', undefined, { cookie: await login(t.url, 'staff.kim', temporaryPassword) });
    assert.equal(me.body.user.mustChangePassword, true);

    const list = (await t.request('GET', '/api/admin/accounts')).body.items;
    assert.equal(list.length, 2);
    assert.ok(list.every((a: Record<string, unknown>) => !('passwordHash' in a) && !('password_hash' in a)), '해시는 응답에 없다');
  });

  it('아이디 중복·형식 오류', async () => {
    assert.equal((await t.request('POST', '/api/admin/accounts', { loginId: 'staff.kim', name: '중복' })).status, 409);
    assert.equal((await t.request('POST', '/api/admin/accounts', { loginId: 'ab', name: '짧음' })).body.code, 'INVALID_LOGIN_ID');
    assert.equal((await t.request('POST', '/api/admin/accounts', { loginId: '한글아이디', name: 'x' })).body.code, 'INVALID_LOGIN_ID');
  });

  it('중지하면 로그인 세션이 바로 끊기고, 다시 로그인할 수 없다', async () => {
    const cookie = await login(t.url, 'staff.kim', temporaryPassword);
    const off = await t.request('PATCH', `/api/admin/accounts/${staffId}/active`, { isActive: false });
    assert.equal(off.body.isActive, false);
    assert.equal((await t.request('GET', '/api/auth/me', undefined, { cookie })).body.user, null);

    const relogin = await t.request('POST', '/api/auth/login', { loginId: 'staff.kim', password: temporaryPassword }, { cookie: '' });
    assert.equal(relogin.body.code, 'ACCOUNT_DISABLED');

    await t.request('PATCH', `/api/admin/accounts/${staffId}/active`, { isActive: true });
  });

  it('비밀번호 초기화: 새 임시 비밀번호만 통하고 기존 비밀번호는 막힌다', async () => {
    const res = await t.request('POST', `/api/admin/accounts/${staffId}/reset-password`);
    assert.equal(res.status, 200);
    assert.notEqual(res.body.temporaryPassword, temporaryPassword);
    assert.equal(await login(t.url, 'staff.kim', temporaryPassword), '');
    assert.notEqual(await login(t.url, 'staff.kim', res.body.temporaryPassword), '');
  });

  it('자기 계정은 중지·초기화할 수 없다', async () => {
    assert.equal((await t.request('PATCH', '/api/admin/accounts/1/active', { isActive: false })).body.code, 'SELF_CHANGE_NOT_ALLOWED');
    assert.equal((await t.request('POST', '/api/admin/accounts/1/reset-password')).body.code, 'SELF_CHANGE_NOT_ALLOWED');
  });

  it('변경 기록에 비밀번호가 남지 않는다', async () => {
    const { rows } = await t.db.query<{ action: string; data: string }>(
      `SELECT action, COALESCE(before_data::text, '') || COALESCE(after_data::text, '') AS data FROM admin_audit_logs ORDER BY id`,
    );
    assert.deepEqual(
      rows.map((r) => r.action),
      ['ADMIN_CREATE', 'ADMIN_DEACTIVATE', 'ADMIN_ACTIVATE', 'ADMIN_PASSWORD_RESET'],
    );
    assert.ok(rows.every((r) => !r.data.includes(temporaryPassword) && !r.data.includes('scrypt')));
  });

  it('로그인 요청도 다른 출처면 거부한다', async () => {
    const res = await fetch(`${t.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ loginId: ADMIN.loginId, password: ADMIN.password }),
    });
    assert.equal(res.status, 403);
    assert.notEqual(ORIGIN, 'https://evil.example');
  });
});
