import { iso, type Queryable } from '../db/database.js';
import type { Nutrition, ProductInput, ProductStatus, VariantType } from './rules.js';

/** 상품 SQL. 트랜잭션 범위와 처리 순서는 service 가 정한다. */

export interface VariantView {
  id: string;
  name: string;
  variantType: VariantType;
  isDefault: boolean;
  isActive: boolean;
  storePrice: number | null;
  nutrition: Nutrition | null;
}

export interface ProductDetail {
  id: string;
  brandId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  status: ProductStatus;
  isLimited: boolean;
  releasedAt: string | null;
  discontinuedAt: string | null;
  variants: VariantView[];
  ingredientIds: string[];
  tagIds: string[];
  updatedAt: string;
}

export interface ProductListItem {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  categoryName: string;
  status: ProductStatus;
  isLimited: boolean;
  imageUrl: string | null;
  storePrice: number | null;
  caloriesKcal: number | null;
  updatedAt: string;
}

export interface ProductListQuery {
  q: string | null;
  brandId: string | null;
  status: ProductStatus | null;
  page: number;
  pageSize: number;
}

/** 대표 구성: 기본 구성, 없으면 가장 먼저 만든 구성 */
const DEFAULT_VARIANT_JOIN = `
  LEFT JOIN LATERAL (
    SELECT v.id FROM product_variants v WHERE v.product_id = p.id ORDER BY v.is_default DESC, v.id LIMIT 1
  ) dv ON TRUE`;

const CURRENT_STORE_PRICE = `channel = 'STORE' AND ended_at IS NULL`;

export async function listProducts(db: Queryable, q: ProductListQuery) {
  const where = `
    WHERE ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.slug ILIKE '%' || $1 || '%')
      AND ($2::bigint IS NULL OR p.brand_id = $2::bigint)
      AND ($3::text IS NULL OR p.status = $3)`;
  const params = [q.q, q.brandId, q.status];

  const [{ rows }, count] = await Promise.all([
    db.query<{
      id: string; name: string; brand_id: string; brand_name: string; category_name: string; status: ProductStatus;
      is_limited: boolean; image_url: string | null; store_price: number | null; calories_kcal: number | null; updated_at: unknown;
    }>(
      `SELECT p.id::text, p.name, p.brand_id::text, b.name AS brand_name, c.name AS category_name, p.status,
              p.is_limited, p.image_url, pp.price AS store_price, n.calories_kcal::float8 AS calories_kcal, p.updated_at
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       ${DEFAULT_VARIANT_JOIN}
       LEFT JOIN product_prices pp ON pp.product_variant_id = dv.id AND pp.${CURRENT_STORE_PRICE}
       LEFT JOIN nutrition n ON n.product_variant_id = dv.id
       ${where}
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT $4 OFFSET $5`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    ),
    db.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM products p ${where}`, params),
  ]);

  const items: ProductListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    brandId: r.brand_id,
    brandName: r.brand_name,
    categoryName: r.category_name,
    status: r.status,
    isLimited: r.is_limited,
    imageUrl: r.image_url,
    storePrice: r.store_price,
    caloriesKcal: r.calories_kcal,
    updatedAt: iso(r.updated_at),
  }));
  return { items, total: count.rows[0]?.total ?? 0 };
}

/** lock=true 면 트랜잭션 끝까지 상품 행을 잠근다. (동시 수정 방지) */
export async function findProductDetail(db: Queryable, id: string, lock = false): Promise<ProductDetail | null> {
  const { rows } = await db.query<{
    id: string; brand_id: string; category_id: string; name: string; slug: string; description: string | null;
    image_url: string | null; status: ProductStatus; is_limited: boolean; released_at: string | null;
    discontinued_at: string | null; updated_at: unknown;
  }>(
    `SELECT id::text, brand_id::text, category_id::text, name, slug, description, image_url, status, is_limited,
            released_at::text, discontinued_at::text, updated_at
     FROM products WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  const p = rows[0];
  if (!p) return null;

  const [variants, ingredients, tags] = await Promise.all([
    db.query<{
      id: string; name: string; variant_type: VariantType; is_default: boolean; is_active: boolean; store_price: number | null;
      has_nutrition: boolean; serving_size_g: number | null; calories_kcal: number | null; protein_g: number | null;
      carbohydrate_g: number | null; sugar_g: number | null; fat_g: number | null; saturated_fat_g: number | null; sodium_mg: number | null;
    }>(
      `SELECT v.id::text, v.name, v.variant_type, v.is_default, v.is_active, pp.price AS store_price,
              n.id IS NOT NULL AS has_nutrition, n.serving_size_g::float8, n.calories_kcal::float8, n.protein_g::float8,
              n.carbohydrate_g::float8, n.sugar_g::float8, n.fat_g::float8, n.saturated_fat_g::float8, n.sodium_mg::float8
       FROM product_variants v
       LEFT JOIN product_prices pp ON pp.product_variant_id = v.id AND pp.${CURRENT_STORE_PRICE}
       LEFT JOIN nutrition n ON n.product_variant_id = v.id
       WHERE v.product_id = $1
       ORDER BY v.is_default DESC, v.id`,
      [id],
    ),
    db.query<{ id: string }>(
      `SELECT ingredient_id::text AS id FROM product_ingredients WHERE product_id = $1 ORDER BY sort_order, ingredient_id`,
      [id],
    ),
    db.query<{ id: string }>(`SELECT tag_id::text AS id FROM product_tags WHERE product_id = $1 ORDER BY tag_id`, [id]),
  ]);

  return {
    id: p.id,
    brandId: p.brand_id,
    categoryId: p.category_id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    imageUrl: p.image_url,
    status: p.status,
    isLimited: p.is_limited,
    releasedAt: p.released_at,
    discontinuedAt: p.discontinued_at,
    updatedAt: iso(p.updated_at),
    ingredientIds: ingredients.rows.map((r) => r.id),
    tagIds: tags.rows.map((r) => r.id),
    variants: variants.rows.map((v) => ({
      id: v.id,
      name: v.name,
      variantType: v.variant_type,
      isDefault: v.is_default,
      isActive: v.is_active,
      storePrice: v.store_price,
      nutrition: v.has_nutrition
        ? {
            servingSizeG: v.serving_size_g,
            caloriesKcal: v.calories_kcal!,
            proteinG: v.protein_g,
            carbohydrateG: v.carbohydrate_g,
            sugarG: v.sugar_g,
            fatG: v.fat_g,
            saturatedFatG: v.saturated_fat_g,
            sodiumMg: v.sodium_mg,
          }
        : null,
    })),
  };
}

/** 참조하는 브랜드·카테고리·재료·태그가 모두 있는지 */
export async function findMissingReferences(db: Queryable, input: ProductInput): Promise<string | null> {
  const { rows } = await db.query<{ brand: boolean; category: boolean; ingredients: number; tags: number }>(
    `SELECT EXISTS (SELECT 1 FROM brands WHERE id = $1) AS brand,
            EXISTS (SELECT 1 FROM categories WHERE id = $2) AS category,
            (SELECT COUNT(*)::int FROM ingredients WHERE id = ANY($3::bigint[])) AS ingredients,
            (SELECT COUNT(*)::int FROM tags WHERE id = ANY($4::bigint[])) AS tags`,
    [input.brandId, input.categoryId, input.ingredientIds, input.tagIds],
  );
  const r = rows[0];
  if (!r.brand) return '브랜드';
  if (!r.category) return '카테고리';
  if (r.ingredients !== input.ingredientIds.length) return '재료';
  if (r.tags !== input.tagIds.length) return '태그';
  return null;
}

export async function isSlugTaken(db: Queryable, brandId: string, slug: string, exceptId: string | null): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM products WHERE brand_id = $1 AND slug = $2 AND ($3::bigint IS NULL OR id <> $3::bigint)`,
    [brandId, slug, exceptId],
  );
  return rows.length > 0;
}

export async function insertProduct(tx: Queryable, input: ProductInput, now: Date): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO products (brand_id, category_id, name, slug, description, status, is_limited, released_at, discontinued_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id::text`,
    [input.brandId, input.categoryId, input.name, input.slug, input.description, input.status, input.isLimited, input.releasedAt, input.discontinuedAt, now],
  );
  return rows[0].id;
}

export async function updateProductRow(tx: Queryable, id: string, input: ProductInput, now: Date): Promise<void> {
  await tx.query(
    `UPDATE products SET brand_id = $2, category_id = $3, name = $4, slug = $5, description = $6, status = $7,
            is_limited = $8, released_at = $9, discontinued_at = $10, updated_at = $11
     WHERE id = $1`,
    [id, input.brandId, input.categoryId, input.name, input.slug, input.description, input.status, input.isLimited, input.releasedAt, input.discontinuedAt, now],
  );
}

export async function touchProduct(tx: Queryable, id: string, now: Date): Promise<void> {
  await tx.query(`UPDATE products SET updated_at = $2 WHERE id = $1`, [id, now]);
}

export async function setProductImage(tx: Queryable, id: string, imageUrl: string, now: Date): Promise<void> {
  await tx.query(`UPDATE products SET image_url = $2, updated_at = $3 WHERE id = $1`, [id, imageUrl, now]);
}

/**
 * 구성 저장. uq_product_default_variant(상품당 기본 구성 1개) 때문에
 * 기존 기본 구성을 먼저 모두 해제한 뒤 하나씩 저장한다.
 */
export async function saveVariants(tx: Queryable, productId: string, input: ProductInput, now: Date): Promise<void> {
  await tx.query(`UPDATE product_variants SET is_default = FALSE, updated_at = $2 WHERE product_id = $1 AND is_default`, [productId, now]);

  for (const v of input.variants) {
    let variantId = v.id;
    if (variantId) {
      await tx.query(
        `UPDATE product_variants SET name = $3, variant_type = $4, is_default = $5, is_active = $6, updated_at = $7
         WHERE id = $1 AND product_id = $2`,
        [variantId, productId, v.name, v.variantType, v.isDefault, v.isActive, now],
      );
    } else {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO product_variants (product_id, name, variant_type, is_default, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id::text`,
        [productId, v.name, v.variantType, v.isDefault, v.isActive, now],
      );
      variantId = rows[0].id;
      if (v.initialStorePrice) {
        await tx.query(
          `INSERT INTO product_prices (product_variant_id, price, channel, started_at, created_at) VALUES ($1, $2, 'STORE', $3, $3)`,
          [variantId, v.initialStorePrice, now],
        );
      }
    }

    // 브랜드가 영양 정보를 주지 않으면 행을 두지 않는다. (0 으로 채우지 않음)
    if (v.nutrition) {
      const n = v.nutrition;
      await tx.query(
        `INSERT INTO nutrition (product_variant_id, serving_size_g, calories_kcal, protein_g, carbohydrate_g, sugar_g, fat_g, saturated_fat_g, sodium_mg, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         ON CONFLICT (product_variant_id) DO UPDATE SET
           serving_size_g = EXCLUDED.serving_size_g, calories_kcal = EXCLUDED.calories_kcal, protein_g = EXCLUDED.protein_g,
           carbohydrate_g = EXCLUDED.carbohydrate_g, sugar_g = EXCLUDED.sugar_g, fat_g = EXCLUDED.fat_g,
           saturated_fat_g = EXCLUDED.saturated_fat_g, sodium_mg = EXCLUDED.sodium_mg, updated_at = EXCLUDED.updated_at`,
        [variantId, n.servingSizeG, n.caloriesKcal, n.proteinG, n.carbohydrateG, n.sugarG, n.fatG, n.saturatedFatG, n.sodiumMg, now],
      );
    } else {
      await tx.query(`DELETE FROM nutrition WHERE product_variant_id = $1`, [variantId]);
    }
  }
}

/** 재료는 입력 순서가 표시 순서(sort_order)다. */
export async function replaceIngredientsAndTags(tx: Queryable, productId: string, input: ProductInput): Promise<void> {
  await tx.query(`DELETE FROM product_ingredients WHERE product_id = $1`, [productId]);
  await tx.query(`DELETE FROM product_tags WHERE product_id = $1`, [productId]);
  if (input.ingredientIds.length > 0) {
    await tx.query(
      `INSERT INTO product_ingredients (product_id, ingredient_id, sort_order)
       SELECT $1, ingredient_id, ord::int - 1 FROM unnest($2::bigint[]) WITH ORDINALITY AS t(ingredient_id, ord)`,
      [productId, input.ingredientIds],
    );
  }
  if (input.tagIds.length > 0) {
    await tx.query(`INSERT INTO product_tags (product_id, tag_id) SELECT $1, unnest($2::bigint[])`, [productId, input.tagIds]);
  }
}

export interface PriceRow {
  id: string;
  variantId: string;
  price: number;
  startedAt: string;
  endedAt: string | null;
}

export async function listStorePrices(db: Queryable, productId: string): Promise<PriceRow[]> {
  const { rows } = await db.query<{ id: string; variant_id: string; price: number; started_at: unknown; ended_at: unknown }>(
    `SELECT pp.id::text, pp.product_variant_id::text AS variant_id, pp.price, pp.started_at, pp.ended_at
     FROM product_prices pp
     JOIN product_variants v ON v.id = pp.product_variant_id
     WHERE v.product_id = $1 AND pp.channel = 'STORE'
     ORDER BY pp.started_at DESC, pp.id DESC`,
    [productId],
  );
  return rows.map((r) => ({
    id: r.id,
    variantId: r.variant_id,
    price: r.price,
    startedAt: iso(r.started_at),
    endedAt: r.ended_at == null ? null : iso(r.ended_at),
  }));
}

/** 가격 변경 동안 구성 행을 잠근다. 동시에 두 관리자가 바꿔도 순서대로 처리된다. */
export async function lockVariant(tx: Queryable, variantId: string) {
  const { rows } = await tx.query<{ id: string; product_id: string; name: string }>(
    `SELECT id::text, product_id::text, name FROM product_variants WHERE id = $1 FOR UPDATE`,
    [variantId],
  );
  return rows[0] ?? null;
}

export async function findCurrentStorePrice(tx: Queryable, variantId: string) {
  const { rows } = await tx.query<{ id: string; price: number }>(
    `SELECT id::text, price FROM product_prices WHERE product_variant_id = $1 AND ${CURRENT_STORE_PRICE}`,
    [variantId],
  );
  return rows[0] ?? null;
}

/**
 * uq_variant_active_price(구성·채널당 현재 가격 1개) 때문에 반드시 기존 행을 먼저 종료한 뒤 새 행을 넣는다.
 * 종료 시각과 새 가격 시작 시각을 같게 두어 이력이 끊기지 않게 한다.
 */
export async function replaceStorePrice(tx: Queryable, variantId: string, currentId: string | null, price: number, now: Date) {
  if (currentId) {
    await tx.query(`UPDATE product_prices SET ended_at = $2 WHERE id = $1`, [currentId, now]);
  }
  await tx.query(
    `INSERT INTO product_prices (product_variant_id, price, channel, started_at, created_at) VALUES ($1, $2, 'STORE', $3, $3)`,
    [variantId, price, now],
  );
}
