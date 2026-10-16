import { badRequest } from '../http/errors.js';

/**
 * 상품 입력 규칙. DB·HTTP 에 의존하지 않는다.
 * 요청 본문을 검증해 정규화된 입력으로 바꾸고, 어긋나면 화면에 보여줄 메시지와 함께 400 을 던진다.
 */

export const PRODUCT_STATUSES = ['ACTIVE', 'DISCONTINUED', 'UPCOMING', 'TEMPORARY'] as const;
export const VARIANT_TYPES = ['SINGLE', 'SET', 'LARGE_SET'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type VariantType = (typeof VARIANT_TYPES)[number];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_PRICE = 1_000_000;

export interface Nutrition {
  servingSizeG: number | null;
  caloriesKcal: number;
  proteinG: number | null;
  carbohydrateG: number | null;
  sugarG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  sodiumMg: number | null;
}

export interface VariantInput {
  id: string | null;
  name: string;
  variantType: VariantType;
  isDefault: boolean;
  isActive: boolean;
  nutrition: Nutrition | null;
  initialStorePrice: number | null;
}

export interface ProductInput {
  brandId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  isLimited: boolean;
  releasedAt: string | null;
  discontinuedAt: string | null;
  variants: VariantInput[];
  ingredientIds: string[];
  tagIds: string[];
}

type Body = Record<string, unknown>;

const isObject = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

export const isId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,18}$/.test(v);

function text(body: Body, key: string, label: string, max: number): string {
  const v = body[key];
  if (typeof v !== 'string' || !v.trim()) throw badRequest('INVALID_INPUT', `${label}을(를) 입력해 주세요.`);
  const trimmed = v.trim().replace(/\s+/g, ' ');
  if (trimmed.length > max) throw badRequest('INVALID_INPUT', `${label}은(는) ${max}자 이하로 입력해 주세요.`);
  return trimmed;
}

function optionalText(body: Body, key: string, max: number): string | null {
  const v = body[key];
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw badRequest('INVALID_INPUT', `${key} 형식이 올바르지 않습니다.`);
  const trimmed = v.trim();
  if (trimmed.length > max) throw badRequest('INVALID_INPUT', `${key}은(는) ${max}자 이하로 입력해 주세요.`);
  return trimmed || null;
}

function id(body: Body, key: string, label: string): string {
  const v = body[key];
  if (!isId(v)) throw badRequest('INVALID_INPUT', `${label}을(를) 선택해 주세요.`);
  return v;
}

function bool(body: Body, key: string): boolean {
  const v = body[key];
  if (typeof v !== 'boolean') throw badRequest('INVALID_INPUT', `${key} 값이 올바르지 않습니다.`);
  return v;
}

function date(body: Body, key: string, label: string): string | null {
  const v = body[key];
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw badRequest('INVALID_INPUT', `${label}은(는) YYYY-MM-DD 형식이어야 합니다.`);
  }
  return v;
}

function idList(body: Body, key: string, label: string): string[] {
  const v = body[key] ?? [];
  if (!Array.isArray(v) || !v.every(isId)) throw badRequest('INVALID_INPUT', `${label} 목록이 올바르지 않습니다.`);
  if (new Set(v).size !== v.length) throw badRequest('INVALID_INPUT', `${label}이(가) 중복되었습니다.`);
  return v;
}

export function parsePrice(v: unknown, label = '매장가'): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_PRICE) {
    throw badRequest('INVALID_PRICE', `${label}은(는) 1원 이상 ${MAX_PRICE.toLocaleString('ko-KR')}원 이하의 정수여야 합니다.`);
  }
  return v;
}

/** DECIMAL(5,1)·(6,1) 범위 안의 0 이상 숫자. 비어 있으면 null (0 으로 채우지 않는다) */
function nutrient(n: Body, key: keyof Nutrition, label: string, max: number): number | null {
  const v = n[key];
  if (v == null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) {
    throw badRequest('INVALID_NUTRITION', `${label}은(는) 0 이상 ${max} 이하로 입력해 주세요.`);
  }
  return Math.round(v * 10) / 10;
}

function parseNutrition(v: unknown, variantName: string): Nutrition | null {
  if (v == null) return null;
  if (!isObject(v)) throw badRequest('INVALID_NUTRITION', `${variantName}의 영양 정보 형식이 올바르지 않습니다.`);
  const caloriesKcal = nutrient(v, 'caloriesKcal', '열량', 99999);
  if (caloriesKcal == null) {
    throw badRequest('CALORIES_REQUIRED', `${variantName}의 열량을 입력하거나, 영양 정보 제공을 꺼 주세요.`);
  }
  return {
    caloriesKcal,
    servingSizeG: nutrient(v, 'servingSizeG', '중량', 99999),
    proteinG: nutrient(v, 'proteinG', '단백질', 9999),
    carbohydrateG: nutrient(v, 'carbohydrateG', '탄수화물', 9999),
    sugarG: nutrient(v, 'sugarG', '당류', 9999),
    fatG: nutrient(v, 'fatG', '지방', 9999),
    saturatedFatG: nutrient(v, 'saturatedFatG', '포화지방', 9999),
    sodiumMg: nutrient(v, 'sodiumMg', '나트륨', 99999),
  };
}

function parseVariant(v: unknown, index: number): VariantInput {
  if (!isObject(v)) throw badRequest('INVALID_INPUT', `${index + 1}번째 구성 형식이 올바르지 않습니다.`);
  const name = text(v, 'name', '구성 이름', 100);
  const variantType = v.variantType;
  if (!VARIANT_TYPES.includes(variantType as VariantType)) throw badRequest('INVALID_INPUT', `${name}의 종류가 올바르지 않습니다.`);
  if (v.id != null && !isId(v.id)) throw badRequest('INVALID_INPUT', `${name}의 ID 가 올바르지 않습니다.`);
  const id = (v.id as string | undefined) ?? null;
  return {
    id,
    name,
    variantType: variantType as VariantType,
    isDefault: bool(v, 'isDefault'),
    isActive: bool(v, 'isActive'),
    nutrition: parseNutrition(v.nutrition, name),
    // 기존 구성의 가격은 가격 변경 API 로만 바꾼다.
    initialStorePrice: id === null && v.initialStorePrice != null ? parsePrice(v.initialStorePrice, `${name} 매장가`) : null,
  };
}

export function parseProductInput(body: unknown): ProductInput {
  if (!isObject(body)) throw badRequest('INVALID_INPUT', '요청 형식이 올바르지 않습니다.');

  const slug = text(body, 'slug', 'slug', 200);
  if (!SLUG_PATTERN.test(slug)) throw badRequest('INVALID_SLUG', 'slug 는 영문 소문자, 숫자, - 만 쓸 수 있습니다.');

  const status = body.status;
  if (!PRODUCT_STATUSES.includes(status as ProductStatus)) throw badRequest('INVALID_INPUT', '판매 상태가 올바르지 않습니다.');

  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    throw badRequest('VARIANT_REQUIRED', '구성을 하나 이상 추가해 주세요.');
  }
  const variants = body.variants.map(parseVariant);
  if (variants.filter((v) => v.isDefault).length !== 1) {
    throw badRequest('DEFAULT_VARIANT', '기본 구성은 정확히 하나여야 합니다.');
  }
  if (!variants.find((v) => v.isDefault)!.isActive) {
    throw badRequest('DEFAULT_VARIANT', '기본 구성은 사용 중이어야 합니다.');
  }
  const existingIds = variants.flatMap((v) => (v.id ? [v.id] : []));
  if (new Set(existingIds).size !== existingIds.length) throw badRequest('INVALID_INPUT', '같은 구성이 두 번 들어 있습니다.');

  const releasedAt = date(body, 'releasedAt', '출시일');
  const discontinuedAt = date(body, 'discontinuedAt', '판매 종료일');
  if (releasedAt && discontinuedAt && discontinuedAt < releasedAt) {
    throw badRequest('INVALID_INPUT', '판매 종료일은 출시일보다 빠를 수 없습니다.');
  }

  return {
    brandId: id(body, 'brandId', '브랜드'),
    categoryId: id(body, 'categoryId', '카테고리'),
    name: text(body, 'name', '상품명', 150),
    slug,
    description: optionalText(body, 'description', 2000),
    status: status as ProductStatus,
    isLimited: bool(body, 'isLimited'),
    releasedAt,
    discontinuedAt,
    variants,
    ingredientIds: idList(body, 'ingredientIds', '재료'),
    tagIds: idList(body, 'tagIds', '태그'),
  };
}

/**
 * 저장 전 검사: 판매 중인 상품은 기본 구성의 매장가가 있어야 한다.
 * 가격이 없으면 사용자 화면에서 0원으로 취급되어 금액 필터·취향 리포트가 틀어진다.
 * @param currentPrices 기존 구성의 현재 매장가 (구성 ID → 가격)
 */
export function assertSellable(input: ProductInput, currentPrices: Map<string, number>): void {
  if (input.status !== 'ACTIVE') return;
  const def = input.variants.find((v) => v.isDefault)!;
  const price = def.id ? currentPrices.get(def.id) : def.initialStorePrice;
  if (!price) {
    throw badRequest('STORE_PRICE_REQUIRED', '판매 중인 상품은 기본 구성의 매장가가 있어야 합니다.');
  }
}

export function parsePriceChange(body: unknown): { price: number; reason: string | null } {
  if (!isObject(body)) throw badRequest('INVALID_INPUT', '요청 형식이 올바르지 않습니다.');
  return { price: parsePrice(body.price), reason: optionalText(body, 'reason', 200) };
}
