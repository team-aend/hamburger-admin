import { Router } from 'express';
import { iso, type Queryable } from '../db/database.js';
import { handle } from '../http/errors.js';

/**
 * GET /api/admin/dashboard — 데이터 품질 경고와 운영 지표
 * 경고 대상은 판매 종료가 아닌 상품. 대표 구성은 기본 구성(없으면 가장 먼저 만든 구성)이다.
 */

const SAMPLE_SIZE = 5;

const WARNINGS = {
  NO_IMAGE: `COALESCE(p.image_url, '') = ''`,
  NO_NUTRITION: `n.id IS NULL`,
  NO_STORE_PRICE: `COALESCE(pp.price, 0) <= 0`,
  NO_INGREDIENTS: `NOT EXISTS (SELECT 1 FROM product_ingredients pi WHERE pi.product_id = p.id)`,
} as const;

type WarningCode = keyof typeof WARNINGS;

export async function getDashboard(db: Queryable) {
  const flags = Object.entries(WARNINGS)
    .map(([code, condition]) => `(${condition}) AS "${code}"`)
    .join(', ');

  const [summary, flagged, changes] = await Promise.all([
    db.query<{ product_count: number; active_brand_count: number; price_changes_7d: number }>(
      `SELECT (SELECT COUNT(*)::int FROM products) AS product_count,
              (SELECT COUNT(*)::int FROM brands WHERE is_active) AS active_brand_count,
              (SELECT COUNT(*)::int FROM product_prices cur
                WHERE cur.channel = 'STORE' AND cur.started_at >= NOW() - INTERVAL '7 days'
                  AND EXISTS (SELECT 1 FROM product_prices prev
                              WHERE prev.product_variant_id = cur.product_variant_id AND prev.channel = 'STORE'
                                AND prev.started_at < cur.started_at)) AS price_changes_7d`,
    ),
    db.query<Record<WarningCode, boolean> & { id: string; name: string; brand_name: string }>(
      `SELECT p.id::text, p.name, b.name AS brand_name, ${flags}
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       LEFT JOIN LATERAL (
         SELECT v.id FROM product_variants v WHERE v.product_id = p.id ORDER BY v.is_default DESC, v.id LIMIT 1
       ) dv ON TRUE
       LEFT JOIN product_prices pp ON pp.product_variant_id = dv.id AND pp.channel = 'STORE' AND pp.ended_at IS NULL
       LEFT JOIN nutrition n ON n.product_variant_id = dv.id
       WHERE p.status <> 'DISCONTINUED'
       ORDER BY b.is_active DESC, p.updated_at DESC, p.id DESC`,
    ),
    db.query<{
      product_id: string; product_name: string; brand_name: string; variant_name: string;
      previous_price: number; price: number; changed_at: unknown;
    }>(
      `SELECT * FROM (
         SELECT p.id::text AS product_id, p.name AS product_name, b.name AS brand_name, v.name AS variant_name,
                LAG(pp.price) OVER (PARTITION BY pp.product_variant_id ORDER BY pp.started_at, pp.id) AS previous_price,
                pp.price, pp.started_at AS changed_at
         FROM product_prices pp
         JOIN product_variants v ON v.id = pp.product_variant_id
         JOIN products p ON p.id = v.product_id
         JOIN brands b ON b.id = p.brand_id
         WHERE pp.channel = 'STORE'
       ) t
       WHERE previous_price IS NOT NULL
       ORDER BY changed_at DESC
       LIMIT 10`,
    ),
  ]);

  const warnings = (Object.keys(WARNINGS) as WarningCode[]).map((code) => {
    const hits = flagged.rows.filter((r) => r[code]);
    return {
      code,
      count: hits.length,
      samples: hits.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, name: r.name, brandName: r.brand_name })),
    };
  });

  const s = summary.rows[0];
  return {
    productCount: s.product_count,
    activeBrandCount: s.active_brand_count,
    priceChangesLast7Days: s.price_changes_7d,
    warnings,
    recentPriceChanges: changes.rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      brandName: r.brand_name,
      variantName: r.variant_name,
      previousPrice: r.previous_price,
      price: r.price,
      changedAt: iso(r.changed_at),
    })),
  };
}

/** GET /api/admin/meta — 상품 폼의 선택지 */
export async function getMeta(db: Queryable) {
  const [brands, categories, ingredients, tags] = await Promise.all([
    db.query(`SELECT id::text, name, slug, logo_url AS "logoUrl", homepage_url AS "homepageUrl", is_active AS "isActive" FROM brands ORDER BY is_active DESC, name`),
    db.query(`SELECT id::text, name, slug FROM categories ORDER BY id`),
    db.query(`SELECT id::text, name, slug, ingredient_group AS "group" FROM ingredients ORDER BY ingredient_group, name`),
    db.query(`SELECT id::text, name, slug FROM tags ORDER BY name`),
  ]);
  return { brands: brands.rows, categories: categories.rows, ingredients: ingredients.rows, tags: tags.rows };
}

export function createDashboardRouter(db: Queryable): Router {
  const router = Router();
  router.get('/dashboard', handle(async (_req, res) => {
    res.json(await getDashboard(db));
  }));
  router.get('/meta', handle(async (_req, res) => {
    res.json(await getMeta(db));
  }));
  return router;
}
