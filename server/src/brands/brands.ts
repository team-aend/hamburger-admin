import { Router } from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { iso, isUniqueViolation, type Database, type Queryable } from '../db/database.js';
import { badRequest, conflict, handle, notFound } from '../http/errors.js';
import { isId, SLUG_PATTERN } from '../products/rules.js';
import { imageUpload } from '../products/routes.js';
import { checkImage, type ImageStorage, type UploadedFile } from '../storage/imageStorage.js';

/**
 * 브랜드 관리: /api/admin/brands
 * 브랜드는 상품이 참조하므로 삭제하지 않고 사용·중지만 한다.
 */

export interface BrandInput {
  name: string;
  slug: string;
  homepageUrl: string | null;
}

/** 월드컵 강수. 사용자 서버 src/worldcup/domain/options.ts 와 같다. */
export const WORLDCUP_ROUND_SIZES = [8, 16];

/**
 * 월드컵 참가 기준. 사용자 서버 src/worldcup/infrastructure/pgProducts.ts 의 eligibleProductsQuery 와 같다:
 * 햄버거 카테고리, 판매 중, 브랜드 사용 중. 사용자 서버의 기준이 바뀌면 함께 바꾼다.
 */
const WORLDCUP_ELIGIBLE = `
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  JOIN categories c ON c.id = p.category_id
  WHERE c.slug = 'burger' AND p.status = 'ACTIVE' AND b.is_active = TRUE`;

const LOGO_TYPES = ['image/png', 'image/webp', 'image/jpeg'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function parseBrandInput(body: unknown): BrandInput {
  if (typeof body !== 'object' || body === null) throw badRequest('INVALID_INPUT', '요청 형식이 올바르지 않습니다.');
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw badRequest('INVALID_INPUT', '브랜드명을 입력해 주세요.');
  if (name.length > 100) throw badRequest('INVALID_INPUT', '브랜드명은 100자 이하로 입력해 주세요.');

  const slug = typeof b.slug === 'string' ? b.slug.trim() : '';
  if (!SLUG_PATTERN.test(slug) || slug.length > 100) {
    throw badRequest('INVALID_SLUG', 'slug 는 100자 이하의 영문 소문자, 숫자, - 만 쓸 수 있습니다.');
  }

  let homepageUrl: string | null = null;
  if (b.homepageUrl != null && b.homepageUrl !== '') {
    if (typeof b.homepageUrl !== 'string') throw badRequest('INVALID_URL', '홈페이지 주소가 올바르지 않습니다.');
    try {
      const url = new URL(b.homepageUrl.trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
      homepageUrl = url.toString().replace(/\/$/, '');
    } catch {
      throw badRequest('INVALID_URL', 'https:// 로 시작하는 홈페이지 주소를 입력해 주세요.');
    }
  }
  return { name, slug, homepageUrl };
}

interface BrandRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  homepage_url: string | null;
  is_active: boolean;
  product_count: number;
  active_product_count: number;
  updated_at: unknown;
}

const BRAND_SELECT = `
  SELECT b.id::text, b.name, b.slug, b.logo_url, b.homepage_url, b.is_active, b.updated_at,
         (SELECT COUNT(*)::int FROM products p WHERE p.brand_id = b.id) AS product_count,
         (SELECT COUNT(*)::int FROM products p WHERE p.brand_id = b.id AND p.status = 'ACTIVE') AS active_product_count
  FROM brands b`;

const toBrand = (r: BrandRow) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  logoUrl: r.logo_url,
  homepageUrl: r.homepage_url,
  isActive: r.is_active,
  productCount: r.product_count,
  activeProductCount: r.active_product_count,
  updatedAt: iso(r.updated_at),
});

export type AdminBrand = ReturnType<typeof toBrand>;

async function findBrand(db: Queryable, id: string, lock = false): Promise<AdminBrand | null> {
  // FOR UPDATE 는 집계 서브쿼리와 함께 쓸 수 없어 먼저 잠근다.
  if (lock) await db.query(`SELECT 1 FROM brands WHERE id = $1 FOR UPDATE`, [id]);
  const { rows } = await db.query<BrandRow>(`${BRAND_SELECT} WHERE b.id = $1`, [id]);
  return rows[0] ? toBrand(rows[0]) : null;
}

export interface BrandServiceDeps {
  db: Database;
  storage: ImageStorage;
  now: () => Date;
}

export function createBrandService({ db, storage, now }: BrandServiceDeps) {
  async function get(id: string) {
    const brand = await findBrand(db, id);
    if (!brand) throw notFound('브랜드를 찾을 수 없습니다.');
    return brand;
  }

  async function ensureSlugFree(tx: Queryable, slug: string, exceptId: string | null) {
    const { rows } = await tx.query(`SELECT 1 FROM brands WHERE slug = $1 AND ($2::bigint IS NULL OR id <> $2::bigint)`, [slug, exceptId]);
    if (rows.length > 0) throw conflict('DUPLICATE_SLUG', '같은 slug 의 브랜드가 이미 있습니다.');
  }

  async function write<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    try {
      return await db.transaction(fn);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('DUPLICATE_SLUG', '같은 slug 의 브랜드가 이미 있습니다.');
      throw error;
    }
  }

  return {
    async list() {
      const { rows } = await db.query<BrandRow>(`${BRAND_SELECT} ORDER BY b.is_active DESC, b.name`);
      return { items: rows.map(toBrand) };
    },

    async create(adminId: string, input: BrandInput) {
      const id = await write(async (tx) => {
        await ensureSlugFree(tx, input.slug, null);
        const at = now();
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO brands (name, slug, homepage_url, is_active, created_at, updated_at) VALUES ($1, $2, $3, TRUE, $4, $4) RETURNING id::text`,
          [input.name, input.slug, input.homepageUrl, at],
        );
        const created = await findBrand(tx, rows[0].id);
        await recordAudit(tx, { adminId, action: 'BRAND_CREATE', targetType: 'BRAND', targetId: rows[0].id, before: null, after: created });
        return rows[0].id;
      });
      return get(id);
    },

    async update(adminId: string, id: string, input: BrandInput) {
      await write(async (tx) => {
        const before = await findBrand(tx, id, true);
        if (!before) throw notFound('브랜드를 찾을 수 없습니다.');
        await ensureSlugFree(tx, input.slug, id);
        await tx.query(`UPDATE brands SET name = $2, slug = $3, homepage_url = $4, updated_at = $5 WHERE id = $1`, [
          id, input.name, input.slug, input.homepageUrl, now(),
        ]);
        await recordAudit(tx, { adminId, action: 'BRAND_UPDATE', targetType: 'BRAND', targetId: id, before, after: await findBrand(tx, id) });
      });
      return get(id);
    },

    /** 중지하면 검색·랭킹·월드컵에서 빠지는 범위 */
    async deactivationImpact(id: string) {
      const brand = await get(id);
      const { rows } = await db.query<{ now_count: number; after_count: number }>(
        `SELECT COUNT(*)::int AS now_count, COUNT(*) FILTER (WHERE p.brand_id <> $1)::int AS after_count ${WORLDCUP_ELIGIBLE}`,
        [id],
      );
      return {
        activeProductCount: brand.activeProductCount,
        worldcupEligibleNow: rows[0].now_count,
        worldcupEligibleAfter: rows[0].after_count,
        roundSizes: WORLDCUP_ROUND_SIZES,
      };
    },

    async setActive(adminId: string, id: string, isActive: boolean, reason: string | null) {
      await db.transaction(async (tx) => {
        const before = await findBrand(tx, id, true);
        if (!before) throw notFound('브랜드를 찾을 수 없습니다.');
        if (before.isActive === isActive) return;
        await tx.query(`UPDATE brands SET is_active = $2, updated_at = $3 WHERE id = $1`, [id, isActive, now()]);
        await recordAudit(tx, {
          adminId,
          action: isActive ? 'BRAND_ACTIVATE' : 'BRAND_DEACTIVATE',
          targetType: 'BRAND',
          targetId: id,
          before: { isActive: before.isActive, activeProductCount: before.activeProductCount },
          after: { isActive },
          reason,
        });
      });
      return get(id);
    },

    async uploadLogo(adminId: string, id: string, file: UploadedFile | undefined) {
      const image = checkImage(file, LOGO_TYPES, MAX_LOGO_BYTES);
      await get(id);
      const logoUrl = await storage.upload(`brands/${id}`, image);
      let previous: string | null = null;
      try {
        await db.transaction(async (tx) => {
          const before = await findBrand(tx, id, true);
          if (!before) throw notFound('브랜드를 찾을 수 없습니다.');
          previous = before.logoUrl;
          await tx.query(`UPDATE brands SET logo_url = $2, updated_at = $3 WHERE id = $1`, [id, logoUrl, now()]);
          await recordAudit(tx, { adminId, action: 'BRAND_LOGO', targetType: 'BRAND', targetId: id, before: { logoUrl: previous }, after: { logoUrl } });
        });
      } catch (error) {
        await storage.removeByUrl(logoUrl);
        throw error;
      }
      await storage.removeByUrl(previous);
      return { logoUrl };
    },
  };
}

export type BrandService = ReturnType<typeof createBrandService>;

function idParam(value: string | undefined): string {
  if (!isId(value)) throw badRequest('INVALID_ID', '브랜드 ID 가 올바르지 않습니다.');
  return value;
}

export function createBrandRouter(brands: BrandService): Router {
  const router = Router();

  router.get('/brands', handle(async (_req, res) => {
    res.json(await brands.list());
  }));

  router.post('/brands', handle(async (req, res) => {
    res.status(201).json(await brands.create(req.admin!.id, parseBrandInput(req.body)));
  }));

  router.put('/brands/:id', handle(async (req, res) => {
    res.json(await brands.update(req.admin!.id, idParam(req.params.id), parseBrandInput(req.body)));
  }));

  router.get('/brands/:id/deactivation-impact', handle(async (req, res) => {
    res.json(await brands.deactivationImpact(idParam(req.params.id)));
  }));

  router.patch('/brands/:id/active', handle(async (req, res) => {
    const { isActive, reason } = (req.body ?? {}) as { isActive?: unknown; reason?: unknown };
    if (typeof isActive !== 'boolean') throw badRequest('INVALID_INPUT', 'isActive 값이 올바르지 않습니다.');
    const reasonText = typeof reason === 'string' ? reason.trim().slice(0, 200) || null : null;
    res.json(await brands.setActive(req.admin!.id, idParam(req.params.id), isActive, reasonText));
  }));

  router.post('/brands/:id/logo', imageUpload.single('file'), handle(async (req, res) => {
    res.json(await brands.uploadLogo(req.admin!.id, idParam(req.params.id), req.file));
  }));

  return router;
}
