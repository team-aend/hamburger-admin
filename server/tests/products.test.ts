import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { productInput, startTestServer, type TestServer } from './helpers.js';

describe('상품 관리', () => {
  let t: TestServer;
  let clock = new Date('2026-10-01T00:00:00.000Z');
  before(async () => {
    t = await startTestServer(() => clock);
  });
  after(() => t.close());

  let productId: string;
  let singleId: string;

  it('상품을 등록하면 구성·가격·영양 정보·재료 순서가 저장된다', async () => {
    const res = await t.request('POST', '/api/admin/products', productInput());
    assert.equal(res.status, 201, JSON.stringify(res.body));
    productId = res.body.id;
    const [single, set] = res.body.variants;
    singleId = single.id;
    assert.equal(single.storePrice, 7900);
    assert.equal(single.nutrition.caloriesKcal, 642);
    assert.equal(single.nutrition.fatG, null, '비워 둔 항목은 0 이 아니라 null');
    assert.equal(set.storePrice, 9900);
    assert.equal(set.nutrition, null);
    assert.deepEqual(res.body.ingredientIds, ['2', '1'], '선택한 순서가 표시 순서');

    const nutritionRows = await t.db.query('SELECT 1 FROM nutrition n JOIN product_variants v ON v.id = n.product_variant_id WHERE v.product_id = $1', [productId]);
    assert.equal(nutritionRows.rows.length, 1, '영양 정보를 주지 않은 세트에는 행을 만들지 않는다');
  });

  it('판매 중인데 기본 구성 매장가가 없으면 저장하지 않는다', async () => {
    const input = productInput({ slug: 'no-price' });
    (input.variants[0] as Record<string, unknown>).initialStorePrice = null;
    const res = await t.request('POST', '/api/admin/products', input);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'STORE_PRICE_REQUIRED');
  });

  it('출시 예정 상품은 매장가 없이 저장할 수 있다', async () => {
    const input = productInput({ slug: 'upcoming', status: 'UPCOMING' });
    (input.variants[0] as Record<string, unknown>).initialStorePrice = null;
    const res = await t.request('POST', '/api/admin/products', input);
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  it('같은 브랜드에 같은 slug 는 409, 다른 브랜드는 허용', async () => {
    const dup = await t.request('POST', '/api/admin/products', productInput());
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'DUPLICATE_SLUG');
    const other = await t.request('POST', '/api/admin/products', productInput({ brandId: '2' }));
    assert.equal(other.status, 201);
  });

  it('입력 검사: 열량 없는 영양 정보, 기본 구성 2개, 없는 재료', async () => {
    const noKcal = productInput({ slug: 'a' });
    (noKcal.variants[0] as Record<string, unknown>).nutrition = { proteinG: 10 };
    assert.equal((await t.request('POST', '/api/admin/products', noKcal)).body.code, 'CALORIES_REQUIRED');

    const twoDefaults = productInput({ slug: 'b' });
    (twoDefaults.variants[1] as Record<string, unknown>).isDefault = true;
    assert.equal((await t.request('POST', '/api/admin/products', twoDefaults)).body.code, 'DEFAULT_VARIANT');

    const missing = await t.request('POST', '/api/admin/products', productInput({ slug: 'c', ingredientIds: ['999'] }));
    assert.equal(missing.body.code, 'INVALID_REFERENCE');
  });

  it('기본 구성을 바꾸고 영양 정보를 끄면 그대로 저장된다 (기본 구성 고유 제약)', async () => {
    const detail = (await t.request('GET', `/api/admin/products/${productId}`)).body;
    const variants = detail.variants.map((v: Record<string, unknown>) => ({
      id: v.id,
      name: v.name,
      variantType: v.variantType,
      isActive: v.isActive,
      isDefault: v.variantType === 'SET',
      nutrition: null,
    }));
    const res = await t.request('PUT', `/api/admin/products/${productId}`, productInput({ variants, tagIds: ['1'] }));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.variants[0].variantType, 'SET', '기본 구성이 맨 앞');
    assert.equal(res.body.variants[0].isDefault, true);
    assert.deepEqual(res.body.tagIds, ['1']);
    const left = await t.db.query('SELECT 1 FROM nutrition n JOIN product_variants v ON v.id = n.product_variant_id WHERE v.product_id = $1', [productId]);
    assert.equal(left.rows.length, 0);
  });

  it('기존 구성은 삭제할 수 없다', async () => {
    const detail = (await t.request('GET', `/api/admin/products/${productId}`)).body;
    const only = detail.variants[0];
    const res = await t.request(
      'PUT',
      `/api/admin/products/${productId}`,
      productInput({
        variants: [{ id: only.id, name: only.name, variantType: only.variantType, isDefault: true, isActive: true, nutrition: null }],
      }),
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VARIANT_DELETE_NOT_ALLOWED');
  });

  it('매장가 변경: 현재 행 종료 → 새 행, 이력이 끊기지 않는다', async () => {
    clock = new Date('2026-10-10T00:00:00.000Z');
    const res = await t.request('POST', `/api/admin/variants/${singleId}/prices`, { price: 8200, reason: '10월 인상' });
    assert.equal(res.status, 204, JSON.stringify(res.body));

    const history = (await t.request('GET', `/api/admin/products/${productId}/prices`)).body.items.filter(
      (p: { variantId: string }) => p.variantId === singleId,
    );
    assert.deepEqual(
      history.map((p: Record<string, unknown>) => [p.price, p.startedAt, p.endedAt]),
      [
        [8200, '2026-10-10T00:00:00.000Z', null],
        [7900, '2026-10-01T00:00:00.000Z', '2026-10-10T00:00:00.000Z'],
      ],
    );

    const audit = await t.db.query<{ action: string; reason: string; after_data: { price: number } }>(
      `SELECT action, reason, after_data FROM admin_audit_logs WHERE action = 'PRICE_CHANGE'`,
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].reason, '10월 인상');
    assert.equal(audit.rows[0].after_data.price, 8200);
  });

  it('같은 가격·잘못된 가격·없는 구성은 거부한다', async () => {
    assert.equal((await t.request('POST', `/api/admin/variants/${singleId}/prices`, { price: 8200 })).body.code, 'SAME_PRICE');
    assert.equal((await t.request('POST', `/api/admin/variants/${singleId}/prices`, { price: 0 })).body.code, 'INVALID_PRICE');
    assert.equal((await t.request('POST', `/api/admin/variants/${singleId}/prices`, { price: 81.5 })).body.code, 'INVALID_PRICE');
    assert.equal((await t.request('POST', '/api/admin/variants/999999/prices', { price: 8000 })).status, 404);
    const current = await t.db.query('SELECT 1 FROM product_prices WHERE product_variant_id = $1 AND ended_at IS NULL', [singleId]);
    assert.equal(current.rows.length, 1, '현재 가격은 항상 하나');
  });

  it('목록: 검색·브랜드·상태 필터와 대표 구성 가격', async () => {
    const all = (await t.request('GET', '/api/admin/products?pageSize=50')).body;
    assert.equal(all.total, 3);
    const bk = (await t.request('GET', `/api/admin/products?brandId=1&q=whopper`)).body;
    assert.equal(bk.total, 1);
    assert.equal(bk.items[0].storePrice, 9900, '기본 구성(세트)의 매장가');
    const upcoming = (await t.request('GET', '/api/admin/products?status=UPCOMING')).body;
    assert.equal(upcoming.items[0].storePrice, null);
    assert.equal((await t.request('GET', '/api/admin/products?status=WRONG')).status, 400);
  });

  it('이미지: 형식 검사 후 저장하고 이전 파일을 정리한다', async () => {
    const bad = new FormData();
    bad.append('file', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
    assert.equal((await t.request('POST', `/api/admin/products/${productId}/image`, bad)).body.code, 'INVALID_FILE_TYPE');

    const upload = async () => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'a.png');
      return t.request('POST', `/api/admin/products/${productId}/image`, form);
    };
    const first = await upload();
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const second = await upload();
    assert.deepEqual(t.storage.removed, [first.body.imageUrl]);
    const detail = (await t.request('GET', `/api/admin/products/${productId}`)).body;
    assert.equal(detail.imageUrl, second.body.imageUrl);
  });

  it('모든 변경이 변경 기록에 남는다', async () => {
    const { rows } = await t.db.query<{ action: string; admin_account_id: string }>(
      'SELECT action, admin_account_id::text FROM admin_audit_logs ORDER BY id',
    );
    assert.deepEqual([...new Set(rows.map((r) => r.action))], ['PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRICE_CHANGE', 'PRODUCT_IMAGE']);
    assert.ok(rows.every((r) => r.admin_account_id === '1'));
  });
});
