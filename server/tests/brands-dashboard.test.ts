import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { productInput, startTestServer, type TestServer } from './helpers.js';

describe('브랜드 관리와 대시보드', () => {
  let t: TestServer;
  before(async () => {
    t = await startTestServer();
    // 버거킹 판매 중 버거 5개, 맥도날드 4개 → 월드컵 참가 가능 9개
    for (let i = 0; i < 9; i++) {
      const res = await t.request('POST', '/api/admin/products', productInput({ brandId: i < 5 ? '1' : '2', slug: `burger-${i}`, name: `버거 ${i}` }));
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    // 사이드 메뉴는 월드컵 대상이 아니다
    await t.request('POST', '/api/admin/products', productInput({ categoryId: '2', slug: 'fries', name: '감자튀김' }));
  });
  after(() => t.close());

  it('브랜드 등록·수정, slug 중복은 409', async () => {
    const created = await t.request('POST', '/api/admin/brands', { name: '  프랭크  버거 ', slug: 'frank', homepageUrl: 'https://frankburger.co.kr/' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.name, '프랭크 버거');
    assert.equal(created.body.homepageUrl, 'https://frankburger.co.kr');

    const dup = await t.request('POST', '/api/admin/brands', { name: '중복', slug: 'burgerking' });
    assert.equal(dup.status, 409);

    const bad = await t.request('PUT', `/api/admin/brands/${created.body.id}`, { name: '프랭크', slug: 'frank', homepageUrl: 'javascript:alert(1)' });
    assert.equal(bad.body.code, 'INVALID_URL');

    const updated = await t.request('PUT', `/api/admin/brands/${created.body.id}`, { name: '프랭크버거', slug: 'frank-burger', homepageUrl: null });
    assert.equal(updated.body.slug, 'frank-burger');
  });

  it('목록에 상품 수가 나온다', async () => {
    const { items } = (await t.request('GET', '/api/admin/brands')).body;
    const bk = items.find((b: { slug: string }) => b.slug === 'burgerking');
    assert.equal(bk.productCount, 6);
    assert.equal(bk.activeProductCount, 6);
  });

  it('중지 영향: 월드컵 참가 가능 상품이 9개 → 4개로 줄어든다', async () => {
    const res = await t.request('GET', '/api/admin/brands/1/deactivation-impact');
    assert.deepEqual(res.body, { activeProductCount: 6, worldcupEligibleNow: 9, worldcupEligibleAfter: 4, roundSizes: [8, 16] });
  });

  it('중지하면 사유와 함께 기록되고, 다시 켤 수 있다', async () => {
    const off = await t.request('PATCH', '/api/admin/brands/1/active', { isActive: false, reason: '테스트 중지' });
    assert.equal(off.body.isActive, false);
    const audit = await t.db.query<{ reason: string }>(`SELECT reason FROM admin_audit_logs WHERE action = 'BRAND_DEACTIVATE'`);
    assert.equal(audit.rows[0].reason, '테스트 중지');

    const dash = (await t.request('GET', '/api/admin/dashboard')).body;
    assert.equal(dash.activeBrandCount, 2);

    const on = await t.request('PATCH', '/api/admin/brands/1/active', { isActive: true });
    assert.equal(on.body.isActive, true);
  });

  it('로고는 PNG·WebP·JPG 만 받는다 (SVG 거부)', async () => {
    const svg = new FormData();
    svg.append('file', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'a.svg');
    assert.equal((await t.request('POST', '/api/admin/brands/1/logo', svg)).body.code, 'INVALID_FILE_TYPE');
    const png = new FormData();
    png.append('file', new Blob([new Uint8Array([1])], { type: 'image/png' }), 'a.png');
    const res = await t.request('POST', '/api/admin/brands/1/logo', png);
    assert.equal(res.body.logoUrl, 'https://storage.test/brands/1/1.png');
  });

  it('대시보드: 품질 경고와 최근 가격 변경', async () => {
    const { items } = (await t.request('GET', `/api/admin/products?q=${encodeURIComponent('버거 0')}`)).body;
    const detail = (await t.request('GET', `/api/admin/products/${items[0].id}`)).body;
    await t.request('POST', `/api/admin/variants/${detail.variants[0].id}/prices`, { price: 8500 });

    const dash = (await t.request('GET', '/api/admin/dashboard')).body;
    assert.equal(dash.productCount, 10);
    const warning = (code: string) => dash.warnings.find((w: { code: string }) => w.code === code).count;
    assert.equal(warning('NO_IMAGE'), 10);
    assert.equal(warning('NO_NUTRITION'), 0);
    assert.equal(warning('NO_STORE_PRICE'), 0);
    assert.equal(warning('NO_INGREDIENTS'), 0);
    assert.equal(dash.priceChangesLast7Days, 1);
    const latest = dash.recentPriceChanges[0];
    assert.deepEqual([latest.productName, latest.previousPrice, latest.price], ['버거 0', 7900, 8500]);
  });

  it('meta: 폼 선택지', async () => {
    const meta = (await t.request('GET', '/api/admin/meta')).body;
    assert.deepEqual(
      meta.ingredients.map((i: { group: string }) => i.group),
      ['CHEESE_SAUCE', 'PATTY', 'TOPPING'],
    );
    assert.equal(meta.brands[0].isActive, true);
  });
});
