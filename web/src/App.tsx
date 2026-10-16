import { Button, Result } from 'antd';
import { Link, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { AdminLayout } from './layouts/AdminLayout';
import { AccountListPage } from './pages/accounts/AccountListPage';
import { BrandListPage } from './pages/brands/BrandListPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductEditPage } from './pages/products/ProductEditPage';
import { ProductListPage } from './pages/products/ProductListPage';

export function App() {
  return (
    <RequireAdmin>
      {(user) => (
        <Routes>
          <Route element={<AdminLayout user={user} />}>
            <Route index element={<DashboardPage />} />
            <Route path="products" element={<ProductListPage />} />
            <Route path="products/new" element={<ProductEditPage />} />
            <Route path="products/:id" element={<ProductEditPage />} />
            <Route path="brands" element={<BrandListPage />} />
            <Route path="accounts" element={<AccountListPage />} />
            <Route
              path="*"
              element={
                <Result
                  status="404"
                  title="페이지를 찾을 수 없습니다"
                  extra={<Link to="/"><Button>대시보드로</Button></Link>}
                />
              }
            />
          </Route>
        </Routes>
      )}
    </RequireAdmin>
  );
}
