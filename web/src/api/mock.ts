/**
 * 목업 API (npm run dev:mock).
 * 백엔드 관리자 API 가 생기기 전에 화면을 개발·확인하기 위한 브라우저 메모리 구현이다.
 * 새로고침하면 초기 데이터로 돌아간다. 서버가 지켜야 할 규칙(가격 이력, 저장 전 검사)을 같은 방식으로 흉내 낸다.
 */
import { ApiError } from './client';
import type { AdminApi } from './admin';
import type {
  AccountRequest,
  AdminAccount,
  AdminBrand,
  AdminMeta,
  Brand,
  BrandInput,
  DashboardResponse,
  Nutrition,
  PriceHistoryEntry,
  ProductDetail,
  ProductInput,
  ProductListItem,
  QualityWarning,
  QualityWarningCode,
  SessionUser,
  Variant,
} from './types';

const meta: AdminMeta = {
  brands: [
    { id: '1', name: '버거킹', slug: 'burgerking', logoUrl: null, homepageUrl: 'https://www.burgerking.co.kr', isActive: true },
    { id: '2', name: '맥도날드', slug: 'mcdonalds', logoUrl: null, homepageUrl: 'https://www.mcdonalds.co.kr', isActive: true },
    { id: '3', name: '롯데리아', slug: 'lotteria', logoUrl: null, homepageUrl: 'https://www.lotteeatz.com', isActive: true },
    { id: '4', name: '맘스터치', slug: 'momstouch', logoUrl: null, homepageUrl: 'https://momstouch.co.kr', isActive: true },
    { id: '5', name: '노브랜드 버거', slug: 'nobrand-burger', logoUrl: null, homepageUrl: null, isActive: false },
  ],
  categories: [
    { id: '1', name: '햄버거', slug: 'burger' },
    { id: '4', name: '사이드', slug: 'side' },
  ],
  ingredients: [
    { id: '1', name: '소고기 패티', slug: 'beef-patty', group: 'PATTY' },
    { id: '2', name: '치킨 패티', slug: 'chicken-patty', group: 'PATTY' },
    { id: '3', name: '새우 패티', slug: 'shrimp-patty', group: 'PATTY' },
    { id: '4', name: '양상추', slug: 'lettuce', group: 'TOPPING' },
    { id: '5', name: '토마토', slug: 'tomato', group: 'TOPPING' },
    { id: '6', name: '양파', slug: 'onion', group: 'TOPPING' },
    { id: '7', name: '베이컨', slug: 'bacon', group: 'TOPPING' },
    { id: '8', name: '체다 치즈', slug: 'cheddar', group: 'CHEESE_SAUCE' },
    { id: '9', name: '불고기 소스', slug: 'bulgogi-sauce', group: 'CHEESE_SAUCE' },
    { id: '10', name: '마요네즈', slug: 'mayo', group: 'CHEESE_SAUCE' },
  ],
  tags: [
    { id: '1', name: '매운맛', slug: 'spicy' },
    { id: '2', name: '시그니처', slug: 'signature' },
    { id: '3', name: '가성비', slug: 'value' },
  ],
};

const nutrition = (caloriesKcal: number, proteinG: number, sodiumMg: number): Nutrition => ({
  servingSizeG: null,
  caloriesKcal,
  proteinG,
  carbohydrateG: null,
  sugarG: null,
  fatG: null,
  saturatedFatG: null,
  sodiumMg,
});

let seq = 1000;
const nextId = () => String(++seq);

interface StoredProduct extends Omit<ProductDetail, 'variants'> {
  variants: Omit<Variant, 'storePrice'>[];
}

const products: StoredProduct[] = [];
const prices: PriceHistoryEntry[] = [];

function seed(
  brandId: string,
  name: string,
  slug: string,
  opts: {
    single?: number | null;
    set?: number | null;
    kcal?: Nutrition | null;
    ingredientIds?: string[];
    image?: boolean;
    status?: ProductDetail['status'];
    history?: number[];
  },
) {
  const id = nextId();
  const singleId = nextId();
  const setId = nextId();
  products.push({
    id,
    brandId,
    categoryId: '1',
    name,
    slug,
    description: null,
    imageUrl: opts.image ? `https://placehold.co/400x300/f5d9a8/7a4b12?text=${encodeURIComponent(name)}` : null,
    status: opts.status ?? 'ACTIVE',
    isLimited: false,
    releasedAt: null,
    discontinuedAt: null,
    ingredientIds: opts.ingredientIds ?? [],
    tagIds: [],
    updatedAt: '2026-10-10T09:00:00.000Z',
    variants: [
      { id: singleId, name: '단품', variantType: 'SINGLE', isDefault: true, isActive: true, nutrition: opts.kcal ?? null },
      { id: setId, name: '세트', variantType: 'SET', isDefault: false, isActive: true, nutrition: null },
    ],
  });

  const history = opts.history ?? [];
  const singlePrices = opts.single == null ? history : [...history, opts.single];
  singlePrices.forEach((price, i) => {
    const startedAt = new Date(Date.UTC(2026, 3 + i * 2, 1)).toISOString();
    const isLast = i === singlePrices.length - 1;
    prices.push({
      id: nextId(),
      variantId: singleId,
      price,
      startedAt,
      endedAt: isLast ? null : new Date(Date.UTC(2026, 5 + i * 2, 1)).toISOString(),
    });
  });
  if (opts.set != null) {
    prices.push({ id: nextId(), variantId: setId, price: opts.set, startedAt: '2026-04-01T00:00:00.000Z', endedAt: null });
  }
}

seed('1', '와퍼', 'whopper', { single: 7900, set: 9900, kcal: nutrition(642, 28, 980), ingredientIds: ['1', '4', '5', '6', '10'], image: true, history: [7100, 7400] });
seed('1', '불고기와퍼', 'bulgogi-whopper', { single: 7900, set: 9900, kcal: nutrition(696, 29, 1150), ingredientIds: ['1', '4', '9'] });
seed('1', '치즈와퍼', 'cheese-whopper', { single: 8500, set: 10500, kcal: null, ingredientIds: ['1', '4', '8'] });
seed('2', '빅맥', 'bigmac', { single: 6300, set: 7800, kcal: nutrition(582, 27, 1020), ingredientIds: ['1', '4', '8'], image: true, history: [5500] });
seed('2', '맥스파이시 상하이 버거', 'mcspicy-shanghai', { single: 6200, set: 7700, kcal: nutrition(501, 25, 1080) });
seed('3', '불고기버거', 'bulgogi-burger', { single: null, set: 7100, kcal: nutrition(400, 15, 760), ingredientIds: ['1', '4', '9'] });
seed('3', '새우버거', 'shrimp-burger', { single: 5100, set: 7100, kcal: nutrition(420, 13, 810), ingredientIds: ['3', '4', '10'], image: true });
seed('4', '싸이버거', 'thigh-burger', { single: 5100, set: 7200, kcal: nutrition(616, 26, 1130), ingredientIds: ['2', '4', '10'], image: true });
seed('4', '화이트갈릭싸이버거', 'white-garlic-thigh', { single: 5900, set: 8000, kcal: null, status: 'TEMPORARY' });

const delay = <T>(value: T, ms = 200) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

const currentPrice = (variantId: string) =>
  prices.find((p) => p.variantId === variantId && p.endedAt === null)?.price ?? null;

const brandName = (brandId: string) => meta.brands.find((b) => b.id === brandId)?.name ?? '';

function findProduct(id: string): StoredProduct {
  const product = products.find((p) => p.id === id);
  if (!product) throw new ApiError(404, '상품을 찾을 수 없습니다.', 'NOT_FOUND');
  return product;
}

function toDetail(p: StoredProduct): ProductDetail {
  return { ...p, variants: p.variants.map((v) => ({ ...v, storePrice: currentPrice(v.id) })) };
}

function toListItem(p: StoredProduct): ProductListItem {
  const main = p.variants.find((v) => v.isDefault) ?? p.variants[0];
  return {
    id: p.id,
    name: p.name,
    brandId: p.brandId,
    brandName: brandName(p.brandId),
    categoryName: meta.categories.find((c) => c.id === p.categoryId)?.name ?? '',
    status: p.status,
    isLimited: p.isLimited,
    imageUrl: p.imageUrl,
    storePrice: main ? currentPrice(main.id) : null,
    caloriesKcal: main?.nutrition?.caloriesKcal ?? null,
    updatedAt: p.updatedAt,
  };
}

/** 서버의 저장 전 검사와 같은 규칙 */
function validate(input: ProductInput, selfId?: string) {
  const duplicate = products.some(
    (p) => p.id !== selfId && p.brandId === input.brandId && p.slug === input.slug,
  );
  if (duplicate) throw new ApiError(409, '같은 브랜드에 같은 slug 가 이미 있습니다.', 'DUPLICATE_SLUG');

  const defaults = input.variants.filter((v) => v.isDefault);
  if (defaults.length !== 1) throw new ApiError(400, '기본 구성은 정확히 하나여야 합니다.', 'DEFAULT_VARIANT');

  if (input.status === 'ACTIVE') {
    const def = defaults[0];
    const price = def.id ? currentPrice(def.id) : def.initialStorePrice ?? null;
    if (!price) {
      throw new ApiError(400, '판매 중인 상품은 기본 구성의 매장가가 있어야 합니다.', 'STORE_PRICE_REQUIRED');
    }
  }
}

function applyInput(target: StoredProduct, input: ProductInput) {
  const { variants, ...rest } = input;
  Object.assign(target, rest, { updatedAt: new Date().toISOString() });
  target.variants = variants.map((v) => {
    const id = v.id ?? nextId();
    if (!v.id && v.initialStorePrice) {
      prices.push({ id: nextId(), variantId: id, price: v.initialStorePrice, startedAt: new Date().toISOString(), endedAt: null });
    }
    return {
      id,
      name: v.name,
      variantType: v.variantType,
      isDefault: v.isDefault,
      isActive: v.isActive,
      nutrition: v.nutrition,
    };
  });
}

const brandUpdatedAt = new Map<string, string>();
const WORLDCUP_ROUND_SIZES = [8, 16];

function findBrand(id: string) {
  const brand = meta.brands.find((b) => b.id === id);
  if (!brand) throw new ApiError(404, '브랜드를 찾을 수 없습니다.', 'NOT_FOUND');
  return brand;
}

function toAdminBrand(brand: Brand): AdminBrand {
  const owned = products.filter((p) => p.brandId === brand.id);
  return {
    ...brand,
    productCount: owned.length,
    activeProductCount: owned.filter((p) => p.status === 'ACTIVE').length,
    updatedAt: brandUpdatedAt.get(brand.id) ?? '2026-10-01T09:00:00.000Z',
  };
}

function validateBrand(input: BrandInput, selfId?: string) {
  if (meta.brands.some((b) => b.id !== selfId && b.slug === input.slug)) {
    throw new ApiError(409, '같은 slug 의 브랜드가 이미 있습니다.', 'DUPLICATE_SLUG');
  }
}

/** 백엔드 eligibleProductsQuery 와 같은 기준: 햄버거 카테고리, 판매 중, 브랜드 사용 중 */
const isWorldcupEligible = (p: StoredProduct, excludeBrandId?: string) =>
  p.categoryId === '1' &&
  p.status === 'ACTIVE' &&
  p.brandId !== excludeBrandId &&
  !!meta.brands.find((b) => b.id === p.brandId)?.isActive;

const WARNING_RULES: { code: QualityWarningCode; test: (p: StoredProduct) => boolean }[] = [
  { code: 'NO_IMAGE', test: (p) => !p.imageUrl },
  { code: 'NO_NUTRITION', test: (p) => !p.variants.find((v) => v.isDefault)?.nutrition },
  {
    code: 'NO_STORE_PRICE',
    test: (p) => {
      const def = p.variants.find((v) => v.isDefault);
      return !def || !currentPrice(def.id);
    },
  },
  { code: 'NO_INGREDIENTS', test: (p) => p.ingredientIds.length === 0 },
];

/** 목업 최고 관리자 계정. 비밀번호 규칙·임시 비밀번호·가입 승인 흐름은 서버와 같게 흉내 낸다. */
export const MOCK_ADMIN = { loginId: 'admin', password: 'burger-admin-2026' };

interface MockAccount extends AdminAccount {
  password: string;
}

const accounts: MockAccount[] = [
  {
    id: '1',
    loginId: MOCK_ADMIN.loginId,
    name: '목업 관리자',
    role: 'SUPER_ADMIN',
    password: MOCK_ADMIN.password,
    isActive: true,
    mustChangePassword: false,
    isLocked: false,
    lastLoginAt: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    createdByName: null,
  },
];

interface MockRequest extends AccountRequest {
  password: string;
}

const requests: MockRequest[] = [
  {
    id: '900',
    loginId: 'staff.han',
    name: '한신청',
    password: 'han-burger-2026',
    message: '브랜드별 메뉴 데이터 입력을 맡았습니다.',
    status: 'PENDING',
    reviewedByName: null,
    reviewedAt: null,
    rejectReason: null,
    createdAt: '2026-10-15T02:00:00.000Z',
  },
];

let currentAccountId: string | null = null;

const toSessionUser = (a: MockAccount): SessionUser => ({
  id: a.id,
  loginId: a.loginId,
  name: a.name,
  mustChangePassword: a.mustChangePassword,
  role: a.role,
});
const toAccount = ({ password: _password, ...a }: MockAccount): AdminAccount => a;
const toRequest = ({ password: _password, ...r }: MockRequest): AccountRequest => r;

const temporaryPassword = () =>
  Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 56)]).join('') + '2';

function findAccount(id: string) {
  const account = accounts.find((a) => a.id === id);
  if (!account) throw new ApiError(404, '관리자 계정을 찾을 수 없습니다.', 'NOT_FOUND');
  return account;
}

/** 계정 관리·가입 승인은 최고 관리자만 */
function requireSuper(): MockAccount {
  const me = findAccount(currentAccountId ?? '');
  if (me.role !== 'SUPER_ADMIN') throw new ApiError(403, '최고 관리자만 할 수 있습니다.', 'SUPER_ADMIN_REQUIRED');
  return me;
}

function checkLoginId(raw: string): string {
  const id = raw.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{3,29}$/.test(id)) {
    throw new ApiError(400, '아이디는 4~30자의 영문 소문자, 숫자, . _ - 만 쓸 수 있습니다.', 'INVALID_LOGIN_ID');
  }
  if (accounts.some((a) => a.loginId === id)) throw new ApiError(409, '이미 사용 중인 아이디입니다.', 'DUPLICATE_LOGIN_ID');
  if (requests.some((r) => r.loginId === id && r.status === 'PENDING')) {
    throw new ApiError(409, '가입 신청이 대기 중인 아이디입니다.', 'DUPLICATE_LOGIN_ID');
  }
  return id;
}

function checkPassword(password: string, loginId: string) {
  if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/\d/.test(password) || password.includes(loginId)) {
    throw new ApiError(400, '비밀번호는 10자 이상, 영문과 숫자를 모두 넣고 아이디는 넣을 수 없습니다.', 'WEAK_PASSWORD');
  }
}

function pendingRequest(id: string): MockRequest {
  const request = requests.find((r) => r.id === id);
  if (!request) throw new ApiError(404, '가입 신청을 찾을 수 없습니다.', 'NOT_FOUND');
  if (request.status !== 'PENDING') throw new ApiError(409, '이미 처리된 신청입니다.', 'ALREADY_REVIEWED');
  return request;
}

export const mockApi: AdminApi = {
  getSession: () => {
    const account = accounts.find((a) => a.id === currentAccountId && a.isActive);
    return delay({ user: account ? toSessionUser(account) : null });
  },

  login: async ({ loginId, password }) => {
    const id = loginId.trim().toLowerCase();
    const account = accounts.find((a) => a.loginId === id);
    if (!account) {
      const request = [...requests].reverse().find((r) => r.loginId === id && r.status !== 'APPROVED');
      if (request && request.password === password) {
        if (request.status === 'PENDING') {
          throw new ApiError(403, '가입 신청을 검토 중입니다. 최고 관리자가 승인하면 로그인할 수 있습니다.', 'REQUEST_PENDING');
        }
        const reason = request.rejectReason ? ` (사유: ${request.rejectReason})` : '';
        throw new ApiError(403, `가입 신청이 반려되었습니다.${reason}`, 'REQUEST_REJECTED');
      }
    }
    if (!account || account.password !== password) {
      throw new ApiError(401, '아이디 또는 비밀번호가 올바르지 않습니다.', 'INVALID_CREDENTIALS');
    }
    if (!account.isActive) throw new ApiError(403, '사용이 중지된 계정입니다. 다른 관리자에게 문의해 주세요.', 'ACCOUNT_DISABLED');
    currentAccountId = account.id;
    account.lastLoginAt = new Date().toISOString();
    return delay({ user: toSessionUser(account) });
  },

  changePassword: async ({ currentPassword, newPassword }) => {
    const account = findAccount(currentAccountId ?? '');
    if (account.password !== currentPassword) throw new ApiError(400, '현재 비밀번호가 올바르지 않습니다.', 'WRONG_PASSWORD');
    checkPassword(newPassword, account.loginId);
    account.password = newPassword;
    account.mustChangePassword = false;
    return delay({ user: toSessionUser(account) });
  },

  logout: async () => {
    currentAccountId = null;
    return delay(undefined);
  },

  submitAccountRequest: async ({ loginId, name, password, message }) => {
    const id = checkLoginId(loginId);
    checkPassword(password, id);
    requests.push({
      id: nextId(),
      loginId: id,
      name: name.trim(),
      password,
      message,
      status: 'PENDING',
      reviewedByName: null,
      reviewedAt: null,
      rejectReason: null,
      createdAt: new Date().toISOString(),
    });
    return delay(undefined);
  },

  listAccounts: async () => {
    requireSuper();
    return delay({ items: accounts.map(toAccount) });
  },

  createAccount: async ({ loginId, name, role }) => {
    const me = requireSuper();
    const id = checkLoginId(loginId);
    const password = temporaryPassword();
    const account: MockAccount = {
      id: nextId(),
      loginId: id,
      name: name.trim(),
      role,
      password,
      isActive: true,
      mustChangePassword: true,
      isLocked: false,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      createdByName: me.name,
    };
    accounts.push(account);
    return delay({ account: toAccount(account), temporaryPassword: password });
  },

  setAccountActive: async (id, isActive) => {
    requireSuper();
    if (id === currentAccountId) throw new ApiError(400, '자기 계정은 중지할 수 없습니다.', 'SELF_CHANGE_NOT_ALLOWED');
    const account = findAccount(id);
    account.isActive = isActive;
    return delay(toAccount(account));
  },

  setAccountRole: async (id, role) => {
    requireSuper();
    if (id === currentAccountId) throw new ApiError(400, '자기 권한은 바꿀 수 없습니다.', 'SELF_CHANGE_NOT_ALLOWED');
    const account = findAccount(id);
    account.role = role;
    return delay(toAccount(account));
  },

  resetAccountPassword: async (id) => {
    requireSuper();
    if (id === currentAccountId) {
      throw new ApiError(400, '자기 비밀번호는 "비밀번호 변경"에서 바꿔 주세요.', 'SELF_CHANGE_NOT_ALLOWED');
    }
    const account = findAccount(id);
    account.password = temporaryPassword();
    account.mustChangePassword = true;
    account.isLocked = false;
    return delay({ account: toAccount(account), temporaryPassword: account.password });
  },

  listAccountRequests: async (status) => {
    requireSuper();
    const items = requests
      .filter((r) => !status || r.status === status)
      .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.createdAt.localeCompare(a.createdAt));
    return delay({ items: items.map(toRequest) });
  },

  approveAccountRequest: async (id, role) => {
    const me = requireSuper();
    const request = pendingRequest(id);
    const account: MockAccount = {
      id: nextId(),
      loginId: request.loginId,
      name: request.name,
      role,
      password: request.password,
      isActive: true,
      mustChangePassword: false,
      isLocked: false,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      createdByName: me.name,
    };
    accounts.push(account);
    Object.assign(request, { status: 'APPROVED', reviewedByName: me.name, reviewedAt: new Date().toISOString() });
    return delay({ account: toAccount(account) });
  },

  rejectAccountRequest: async (id, reason) => {
    const me = requireSuper();
    const request = pendingRequest(id);
    Object.assign(request, { status: 'REJECTED', reviewedByName: me.name, reviewedAt: new Date().toISOString(), rejectReason: reason });
    return delay(undefined);
  },

  getDashboard: () => {
    const live = products.filter((p) => p.status !== 'DISCONTINUED');
    const warnings: QualityWarning[] = WARNING_RULES.map(({ code, test }) => {
      const hits = live.filter(test);
      return {
        code,
        count: hits.length,
        samples: hits.slice(0, 5).map((p) => ({ id: p.id, name: p.name, brandName: brandName(p.brandId) })),
      };
    });

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const changes = prices
      .filter((p) => prices.some((prev) => prev.variantId === p.variantId && prev.endedAt === p.startedAt))
      .map((p) => {
        const product = products.find((x) => x.variants.some((v) => v.id === p.variantId))!;
        const variant = product.variants.find((v) => v.id === p.variantId)!;
        const prev = prices.find((x) => x.variantId === p.variantId && x.endedAt === p.startedAt);
        return {
          productId: product.id,
          productName: product.name,
          brandName: brandName(product.brandId),
          variantName: variant.name,
          previousPrice: prev?.price ?? null,
          price: p.price,
          changedAt: p.startedAt,
        };
      })
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt));

    const response: DashboardResponse = {
      productCount: products.length,
      activeBrandCount: meta.brands.filter((b) => b.isActive).length,
      priceChangesLast7Days: changes.filter((c) => Date.parse(c.changedAt) >= weekAgo).length,
      warnings,
      recentPriceChanges: changes.slice(0, 10),
    };
    return delay(response);
  },

  getMeta: () => delay(meta),

  listProducts: ({ q, brandId, status, page, pageSize }) => {
    const keyword = q?.trim().toLowerCase();
    const filtered = products
      .filter((p) => !keyword || p.name.toLowerCase().includes(keyword) || p.slug.includes(keyword))
      .filter((p) => !brandId || p.brandId === brandId)
      .filter((p) => !status || p.status === status)
      .map(toListItem);
    const start = (page - 1) * pageSize;
    return delay({ items: filtered.slice(start, start + pageSize), total: filtered.length });
  },

  getProduct: async (id) => delay(toDetail(findProduct(id))),

  createProduct: async (input) => {
    validate(input);
    const product = { id: nextId() } as StoredProduct;
    applyInput(product, input);
    products.push(product);
    return delay(toDetail(product));
  },

  updateProduct: async (id, input) => {
    const product = findProduct(id);
    validate(input, id);
    applyInput(product, input);
    return delay(toDetail(product));
  },

  uploadProductImage: async (id, file) => {
    const product = findProduct(id);
    if (!file.type.startsWith('image/')) throw new ApiError(400, '이미지 파일만 올릴 수 있습니다.');
    product.imageUrl = URL.createObjectURL(file);
    return delay({ imageUrl: product.imageUrl });
  },

  getPriceHistory: async (productId) => {
    const variantIds = new Set(findProduct(productId).variants.map((v) => v.id));
    const items = prices
      .filter((p) => variantIds.has(p.variantId))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return delay({ items });
  },

  /** 서버와 같은 순서: 현재 행 종료 → 새 행 추가 (uq_variant_active_price) */
  changeStorePrice: async (variantId, { price }) => {
    if (!Number.isInteger(price) || price <= 0) throw new ApiError(400, '가격은 1원 이상의 정수여야 합니다.');
    const now = new Date().toISOString();
    const current = prices.find((p) => p.variantId === variantId && p.endedAt === null);
    if (current?.price === price) throw new ApiError(400, '현재 가격과 같습니다.', 'SAME_PRICE');
    if (current) current.endedAt = now;
    prices.push({ id: nextId(), variantId, price, startedAt: now, endedAt: null });
    const product = products.find((p) => p.variants.some((v) => v.id === variantId));
    if (product) product.updatedAt = now;
    return delay(undefined);
  },

  listBrands: () => delay({ items: meta.brands.map(toAdminBrand) }),

  createBrand: async (input) => {
    validateBrand(input);
    const brand: Brand = { id: nextId(), ...input, logoUrl: null, isActive: true };
    meta.brands.push(brand);
    brandUpdatedAt.set(brand.id, new Date().toISOString());
    return delay(toAdminBrand(brand));
  },

  updateBrand: async (id, input) => {
    const brand = findBrand(id);
    validateBrand(input, id);
    Object.assign(brand, input);
    brandUpdatedAt.set(id, new Date().toISOString());
    return delay(toAdminBrand(brand));
  },

  getBrandDeactivationImpact: async (id) => {
    findBrand(id);
    return delay({
      activeProductCount: products.filter((p) => p.brandId === id && p.status === 'ACTIVE').length,
      worldcupEligibleNow: products.filter((p) => isWorldcupEligible(p)).length,
      worldcupEligibleAfter: products.filter((p) => isWorldcupEligible(p, id)).length,
      roundSizes: WORLDCUP_ROUND_SIZES,
    });
  },

  setBrandActive: async (id, { isActive }) => {
    const brand = findBrand(id);
    brand.isActive = isActive;
    brandUpdatedAt.set(id, new Date().toISOString());
    return delay(toAdminBrand(brand));
  },

  uploadBrandLogo: async (id, file) => {
    const brand = findBrand(id);
    if (!file.type.startsWith('image/')) throw new ApiError(400, '이미지 파일만 올릴 수 있습니다.');
    brand.logoUrl = URL.createObjectURL(file);
    brandUpdatedAt.set(id, new Date().toISOString());
    return delay({ logoUrl: brand.logoUrl });
  },
};
