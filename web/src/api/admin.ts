import { request, toQueryString } from './client';
import { mockApi } from './mock';
import type {
  AccountRequest,
  AccountRequestInput,
  AccountRequestStatus,
  AdminAccount,
  AdminBrand,
  AdminMeta,
  BrandActiveInput,
  BrandDeactivationImpact,
  BrandInput,
  BrandListResponse,
  DashboardResponse,
  ImageUploadResponse,
  LoginInput,
  LogoUploadResponse,
  PasswordChangeInput,
  PriceChangeInput,
  PriceHistoryResponse,
  ProductDetail,
  ProductInput,
  ProductListQuery,
  ProductListResponse,
  SessionResponse,
  TemporaryPasswordResponse,
  UserRole,
} from './types';

export interface AdminApi {
  getSession(): Promise<SessionResponse>;
  login(input: LoginInput): Promise<SessionResponse>;
  changePassword(input: PasswordChangeInput): Promise<SessionResponse>;
  logout(): Promise<void>;
  submitAccountRequest(input: AccountRequestInput): Promise<void>;
  listAccounts(): Promise<{ items: AdminAccount[] }>;
  createAccount(input: { loginId: string; name: string; role: UserRole }): Promise<TemporaryPasswordResponse>;
  setAccountActive(id: string, isActive: boolean): Promise<AdminAccount>;
  setAccountRole(id: string, role: UserRole): Promise<AdminAccount>;
  resetAccountPassword(id: string): Promise<TemporaryPasswordResponse>;
  listAccountRequests(status?: AccountRequestStatus): Promise<{ items: AccountRequest[] }>;
  approveAccountRequest(id: string, role: UserRole): Promise<{ account: AdminAccount }>;
  rejectAccountRequest(id: string, reason: string | null): Promise<void>;
  getDashboard(): Promise<DashboardResponse>;
  getMeta(): Promise<AdminMeta>;
  listProducts(query: ProductListQuery): Promise<ProductListResponse>;
  getProduct(id: string): Promise<ProductDetail>;
  createProduct(input: ProductInput): Promise<ProductDetail>;
  updateProduct(id: string, input: ProductInput): Promise<ProductDetail>;
  uploadProductImage(id: string, file: File): Promise<ImageUploadResponse>;
  getPriceHistory(productId: string): Promise<PriceHistoryResponse>;
  changeStorePrice(variantId: string, input: PriceChangeInput): Promise<void>;
  listBrands(): Promise<BrandListResponse>;
  createBrand(input: BrandInput): Promise<AdminBrand>;
  updateBrand(id: string, input: BrandInput): Promise<AdminBrand>;
  getBrandDeactivationImpact(id: string): Promise<BrandDeactivationImpact>;
  setBrandActive(id: string, input: BrandActiveInput): Promise<AdminBrand>;
  uploadBrandLogo(id: string, file: File): Promise<LogoUploadResponse>;
}

function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  return request(path, { method: 'POST', body: form });
}

const httpApi: AdminApi = {
  getSession: () => request('/auth/me'),
  login: (input) => request('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  changePassword: (input) => request('/auth/password', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  listAccounts: () => request('/admin/accounts'),
  createAccount: (input) => request('/admin/accounts', { method: 'POST', body: JSON.stringify(input) }),
  setAccountActive: (id, isActive) =>
    request(`/admin/accounts/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  setAccountRole: (id, role) =>
    request(`/admin/accounts/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  resetAccountPassword: (id) => request(`/admin/accounts/${id}/reset-password`, { method: 'POST' }),
  submitAccountRequest: (input) =>
    request('/auth/account-requests', { method: 'POST', body: JSON.stringify(input) }),
  listAccountRequests: (status) => request(`/admin/account-requests${toQueryString({ status })}`),
  approveAccountRequest: (id, role) =>
    request(`/admin/account-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ role }) }),
  rejectAccountRequest: (id, reason) =>
    request(`/admin/account-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getDashboard: () => request('/admin/dashboard'),
  getMeta: () => request('/admin/meta'),
  listProducts: (query) =>
    request(`/admin/products${toQueryString({ ...query })}`),
  getProduct: (id) => request(`/admin/products/${id}`),
  createProduct: (input) =>
    request('/admin/products', { method: 'POST', body: JSON.stringify(input) }),
  updateProduct: (id, input) =>
    request(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  uploadProductImage: (id, file) => upload(`/admin/products/${id}/image`, file),
  getPriceHistory: (productId) => request(`/admin/products/${productId}/prices`),
  changeStorePrice: (variantId, input) =>
    request(`/admin/variants/${variantId}/prices`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listBrands: () => request('/admin/brands'),
  createBrand: (input) =>
    request('/admin/brands', { method: 'POST', body: JSON.stringify(input) }),
  updateBrand: (id, input) =>
    request(`/admin/brands/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  getBrandDeactivationImpact: (id) => request(`/admin/brands/${id}/deactivation-impact`),
  setBrandActive: (id, input) =>
    request(`/admin/brands/${id}/active`, { method: 'PATCH', body: JSON.stringify(input) }),
  uploadBrandLogo: (id, file) => upload(`/admin/brands/${id}/logo`, file),
};

export const isMockMode = import.meta.env.VITE_API_MOCK === 'true';

export const api: AdminApi = isMockMode ? mockApi : httpApi;
