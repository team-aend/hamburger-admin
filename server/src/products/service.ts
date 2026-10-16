import { recordAudit } from '../audit/auditLog.js';
import { isUniqueViolation, type Database, type Queryable } from '../db/database.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { checkImage, type ImageStorage, type UploadedFile } from '../storage/imageStorage.js';
import * as repo from './repository.js';
import { assertSellable, type ProductInput } from './rules.js';

export interface ProductServiceDeps {
  db: Database;
  storage: ImageStorage;
  now: () => Date;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 상품 관리 유스케이스. 쓰기는 모두 한 트랜잭션에서 처리하고 같은 트랜잭션에 변경 기록을 남긴다. */
export function createProductService({ db, storage, now }: ProductServiceDeps) {
  async function getDetail(id: string) {
    const product = await repo.findProductDetail(db, id);
    if (!product) throw notFound('상품을 찾을 수 없습니다.');
    return product;
  }

  /** 등록·수정 공통 검사 */
  async function validate(tx: Queryable, input: ProductInput, existing: repo.ProductDetail | null) {
    const missing = await repo.findMissingReferences(tx, input);
    if (missing) throw badRequest('INVALID_REFERENCE', `선택한 ${missing}을(를) 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.`);

    if (await repo.isSlugTaken(tx, input.brandId, input.slug, existing?.id ?? null)) {
      throw conflict('DUPLICATE_SLUG', '같은 브랜드에 같은 slug 가 이미 있습니다.');
    }

    const existingIds = new Set(existing?.variants.map((v) => v.id) ?? []);
    const inputIds = new Set(input.variants.flatMap((v) => (v.id ? [v.id] : [])));
    if ([...inputIds].some((id) => !existingIds.has(id))) {
      throw badRequest('INVALID_VARIANT', '이 상품의 구성이 아닌 항목이 있습니다. 새로고침 후 다시 시도해 주세요.');
    }
    // 가격 이력·좋아요가 구성에 연결되어 있어 삭제하지 않는다.
    if ([...existingIds].some((id) => !inputIds.has(id))) {
      throw badRequest('VARIANT_DELETE_NOT_ALLOWED', '기존 구성은 삭제할 수 없습니다. 대신 "사용"을 꺼 주세요.');
    }

    const prices = new Map(existing?.variants.flatMap((v) => (v.storePrice ? [[v.id, v.storePrice] as const] : [])) ?? []);
    assertSellable(input, prices);
  }

  async function writeProduct(adminId: string, input: ProductInput, id: string | null) {
    try {
      const productId = await db.transaction(async (tx) => {
        const at = now();
        const before = id ? await repo.findProductDetail(tx, id, true) : null;
        if (id && !before) throw notFound('상품을 찾을 수 없습니다.');
        await validate(tx, input, before);

        const productId = id ?? (await repo.insertProduct(tx, input, at));
        if (id) await repo.updateProductRow(tx, id, input, at);
        await repo.saveVariants(tx, productId, input, at);
        await repo.replaceIngredientsAndTags(tx, productId, input);

        const after = await repo.findProductDetail(tx, productId);
        await recordAudit(tx, {
          adminId,
          action: id ? 'PRODUCT_UPDATE' : 'PRODUCT_CREATE',
          targetType: 'PRODUCT',
          targetId: productId,
          before,
          after,
        });
        return productId;
      });
      return getDetail(productId);
    } catch (error) {
      // 검사와 저장 사이에 다른 관리자가 같은 slug 를 쓴 경우
      if (isUniqueViolation(error)) throw conflict('DUPLICATE_SLUG', '같은 브랜드에 같은 slug 가 이미 있습니다.');
      throw error;
    }
  }

  return {
    list: (query: repo.ProductListQuery) => repo.listProducts(db, query),
    getDetail,
    create: (adminId: string, input: ProductInput) => writeProduct(adminId, input, null),
    update: (adminId: string, id: string, input: ProductInput) => writeProduct(adminId, input, id),

    async listPrices(productId: string) {
      await getDetail(productId);
      return { items: await repo.listStorePrices(db, productId) };
    },

    /** 매장가 변경: 현재 행 종료 → 새 행 추가. 가격 이력·가격 변동 알림이 이 기록으로 동작한다. */
    async changeStorePrice(adminId: string, variantId: string, price: number, reason: string | null) {
      await db.transaction(async (tx) => {
        const variant = await repo.lockVariant(tx, variantId);
        if (!variant) throw notFound('구성을 찾을 수 없습니다.');
        const current = await repo.findCurrentStorePrice(tx, variantId);
        if (current?.price === price) throw badRequest('SAME_PRICE', '현재 가격과 같습니다.');

        const at = now();
        await repo.replaceStorePrice(tx, variantId, current?.id ?? null, price, at);
        await repo.touchProduct(tx, variant.product_id, at);
        await recordAudit(tx, {
          adminId,
          action: 'PRICE_CHANGE',
          targetType: 'VARIANT',
          targetId: variantId,
          before: { productId: variant.product_id, variantName: variant.name, price: current?.price ?? null },
          after: { productId: variant.product_id, variantName: variant.name, price, startedAt: at.toISOString() },
          reason,
        });
      });
    },

    /** 저장소에 먼저 올리고, DB 반영이 실패하면 올린 파일을 지운다. 성공하면 이전 파일을 정리한다. */
    async uploadImage(adminId: string, productId: string, file: UploadedFile | undefined) {
      const image = checkImage(file, IMAGE_TYPES, MAX_IMAGE_BYTES);
      await getDetail(productId);
      const imageUrl = await storage.upload(`products/${productId}`, image);
      let previous: string | null = null;
      try {
        await db.transaction(async (tx) => {
          const before = await repo.findProductDetail(tx, productId, true);
          if (!before) throw notFound('상품을 찾을 수 없습니다.');
          previous = before.imageUrl;
          await repo.setProductImage(tx, productId, imageUrl, now());
          await recordAudit(tx, {
            adminId,
            action: 'PRODUCT_IMAGE',
            targetType: 'PRODUCT',
            targetId: productId,
            before: { imageUrl: previous },
            after: { imageUrl },
          });
        });
      } catch (error) {
        await storage.removeByUrl(imageUrl);
        throw error;
      }
      await storage.removeByUrl(previous);
      return { imageUrl };
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;
