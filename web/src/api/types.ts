/**
 * 관리자 API 계약. 관리자 서버(server/)가 이 형식으로 응답한다.
 * PostgreSQL BIGINT ID 는 문자열로 주고받는다.
 * 가격은 매장가(STORE)만 관리한다.
 */

/** SUPER_ADMIN 최고 관리자: 계정 관리·가입 승인 가능 / ADMIN 관리자: 상품·브랜드 관리 */
export type UserRole = 'SUPER_ADMIN' | 'ADMIN';

/** 로그인한 관리자 계정 (사용자 회원과 별개) */
export interface SessionUser {
  id: string;
  loginId: string;
  name: string;
  /** 임시 비밀번호 상태. 바꾸기 전에는 관리 기능을 쓸 수 없다. */
  mustChangePassword: boolean;
  role: UserRole;
}

/** GET /api/auth/me, POST /api/auth/login, POST /api/auth/password */
export interface SessionResponse {
  user: SessionUser | null;
}

export interface LoginInput {
  loginId: string;
  password: string;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

/** GET /api/admin/accounts */
export interface AdminAccount {
  id: string;
  loginId: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  /** 비밀번호를 5번 틀려 잠긴 상태 (15분) */
  isLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

/** POST /api/auth/account-requests — 로그인 없이 보내는 관리자 가입 신청 */
export interface AccountRequestInput {
  loginId: string;
  name: string;
  password: string;
  message: string | null;
}

export type AccountRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** GET /api/admin/account-requests (최고 관리자) */
export interface AccountRequest {
  id: string;
  loginId: string;
  name: string;
  message: string | null;
  status: AccountRequestStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

/** POST /api/admin/accounts, POST /api/admin/accounts/:id/reset-password — 임시 비밀번호는 이 응답에서 한 번만 받는다. */
export interface TemporaryPasswordResponse {
  account: AdminAccount;
  temporaryPassword: string;
}

export type ProductStatus = 'ACTIVE' | 'DISCONTINUED' | 'UPCOMING' | 'TEMPORARY';
export type VariantType = 'SINGLE' | 'SET' | 'LARGE_SET';
export type IngredientGroup = 'PATTY' | 'TOPPING' | 'CHEESE_SAUCE';

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  homepageUrl: string | null;
  isActive: boolean;
}

/** GET /api/admin/brands */
export interface AdminBrand extends Brand {
  productCount: number;
  /** 판매 중(ACTIVE) 상품 수 */
  activeProductCount: number;
  updatedAt: string;
}

export interface BrandListResponse {
  items: AdminBrand[];
}

/** POST /api/admin/brands, PUT /api/admin/brands/:id — 사용 여부는 별도 API 로 바꾼다. */
export interface BrandInput {
  name: string;
  slug: string;
  homepageUrl: string | null;
}

/**
 * GET /api/admin/brands/:id/deactivation-impact
 * 브랜드를 중지하면 검색·랭킹·월드컵에서 빠지는 범위.
 * 월드컵 참가 기준은 백엔드 eligibleProductsQuery 와 같다: 햄버거 카테고리, 판매 중, 브랜드 사용 중.
 */
export interface BrandDeactivationImpact {
  activeProductCount: number;
  worldcupEligibleNow: number;
  worldcupEligibleAfter: number;
  /** 월드컵 강수 (현재 8강, 16강) */
  roundSizes: number[];
}

/** PATCH /api/admin/brands/:id/active */
export interface BrandActiveInput {
  isActive: boolean;
  reason: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Ingredient {
  id: string;
  name: string;
  slug: string;
  group: IngredientGroup;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

/** GET /api/admin/meta — 폼 선택지 */
export interface AdminMeta {
  brands: Brand[];
  categories: Category[];
  ingredients: Ingredient[];
  tags: Tag[];
}

/** 브랜드가 제공하지 않는 값은 null. 0 으로 채우지 않는다. */
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

export interface Variant {
  id: string;
  name: string;
  variantType: VariantType;
  isDefault: boolean;
  isActive: boolean;
  /** 현재 매장가. 없으면 null */
  storePrice: number | null;
  /** 브랜드가 영양 정보를 주지 않으면 null */
  nutrition: Nutrition | null;
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
  /** 기본 구성의 현재 매장가 */
  storePrice: number | null;
  caloriesKcal: number | null;
  updatedAt: string;
}

export interface ProductListQuery {
  q?: string;
  brandId?: string;
  status?: ProductStatus;
  page: number;
  pageSize: number;
}

/** GET /api/admin/products */
export interface ProductListResponse {
  items: ProductListItem[];
  total: number;
}

/** GET /api/admin/products/:id */
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
  variants: Variant[];
  /** 표시 순서대로 */
  ingredientIds: string[];
  tagIds: string[];
  updatedAt: string;
}

export interface VariantInput {
  /** 기존 구성 수정이면 id, 새 구성이면 생략 */
  id?: string;
  name: string;
  variantType: VariantType;
  isDefault: boolean;
  isActive: boolean;
  nutrition: Nutrition | null;
  /** 새 구성을 만들 때만 사용. 기존 구성의 가격은 가격 변경 API 로 바꾼다. */
  initialStorePrice?: number | null;
}

/** POST /api/admin/products, PUT /api/admin/products/:id */
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

export interface PriceHistoryEntry {
  id: string;
  variantId: string;
  price: number;
  startedAt: string;
  endedAt: string | null;
}

/** GET /api/admin/products/:id/prices — 매장가 이력, 최신순 */
export interface PriceHistoryResponse {
  items: PriceHistoryEntry[];
}

/**
 * POST /api/admin/variants/:variantId/prices
 * 서버는 한 트랜잭션에서 현재 가격 행에 ended_at 을 찍은 뒤 새 행을 추가한다.
 */
export interface PriceChangeInput {
  price: number;
  reason: string | null;
}

export type QualityWarningCode =
  | 'NO_IMAGE'
  | 'NO_NUTRITION'
  | 'NO_STORE_PRICE'
  | 'NO_INGREDIENTS';

export interface QualityWarning {
  code: QualityWarningCode;
  count: number;
  /** 바로 고칠 수 있도록 일부 상품만 */
  samples: { id: string; name: string; brandName: string }[];
}

/** GET /api/admin/dashboard */
export interface DashboardResponse {
  productCount: number;
  activeBrandCount: number;
  priceChangesLast7Days: number;
  warnings: QualityWarning[];
  recentPriceChanges: {
    productId: string;
    productName: string;
    brandName: string;
    variantName: string;
    previousPrice: number | null;
    price: number;
    changedAt: string;
  }[];
}

/** POST /api/admin/products/:id/image (multipart, field: file) */
export interface ImageUploadResponse {
  imageUrl: string;
}

/** POST /api/admin/brands/:id/logo (multipart, field: file) */
export interface LogoUploadResponse {
  logoUrl: string;
}
