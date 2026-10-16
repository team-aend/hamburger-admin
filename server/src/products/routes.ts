import { Router } from 'express';
import multer from 'multer';
import { badRequest, handle } from '../http/errors.js';
import { isId, parsePriceChange, parseProductInput, PRODUCT_STATUSES, type ProductStatus } from './rules.js';
import type { ProductService } from './service.js';

const MAX_PAGE_SIZE = 100;

export const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

function idParam(value: string | undefined, label: string): string {
  if (!isId(value)) throw badRequest('INVALID_ID', `${label} ID 가 올바르지 않습니다.`);
  return value;
}

/**
 * /api/admin/products, /api/admin/variants
 * 응답 형식은 web/src/api/types.ts 와 같다.
 */
export function createProductRouter(products: ProductService): Router {
  const router = Router();

  router.get(
    '/products',
    handle(async (req, res) => {
      const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 100) : null;
      const brandId = typeof req.query.brandId === 'string' && req.query.brandId ? idParam(req.query.brandId, '브랜드') : null;
      const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
      if (status && !PRODUCT_STATUSES.includes(status as ProductStatus)) throw badRequest('INVALID_INPUT', '판매 상태가 올바르지 않습니다.');
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
      res.json(await products.list({ q, brandId, status: status as ProductStatus | null, page, pageSize }));
    }),
  );

  router.get(
    '/products/:id',
    handle(async (req, res) => {
      res.json(await products.getDetail(idParam(req.params.id, '상품')));
    }),
  );

  router.post(
    '/products',
    handle(async (req, res) => {
      res.status(201).json(await products.create(req.admin!.id, parseProductInput(req.body)));
    }),
  );

  router.put(
    '/products/:id',
    handle(async (req, res) => {
      res.json(await products.update(req.admin!.id, idParam(req.params.id, '상품'), parseProductInput(req.body)));
    }),
  );

  router.post(
    '/products/:id/image',
    imageUpload.single('file'),
    handle(async (req, res) => {
      res.json(await products.uploadImage(req.admin!.id, idParam(req.params.id, '상품'), req.file));
    }),
  );

  router.get(
    '/products/:id/prices',
    handle(async (req, res) => {
      res.json(await products.listPrices(idParam(req.params.id, '상품')));
    }),
  );

  router.post(
    '/variants/:variantId/prices',
    handle(async (req, res) => {
      const { price, reason } = parsePriceChange(req.body);
      await products.changeStorePrice(req.admin!.id, idParam(req.params.variantId, '구성'), price, reason);
      res.status(204).end();
    }),
  );

  return router;
}
