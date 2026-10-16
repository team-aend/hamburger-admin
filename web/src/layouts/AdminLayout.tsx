import {
  DashboardOutlined,
  KeyOutlined,
  LogoutOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Avatar, Badge, Button, Flex, Layout, Menu, Modal, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api, isMockMode } from '@/api/admin';
import type { SessionUser } from '@/api/types';
import { PasswordChangeForm } from '@/auth/PasswordChangeForm';
import { usePendingRequests } from '@/pages/accounts/AccountListPage';

const { Sider, Header, Content } = Layout;

export function AdminLayout({ user }: { user: SessionUser }) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [changingPassword, setChangingPassword] = useState(false);
  const isSuper = user.role === 'SUPER_ADMIN';
  const pendingCount = usePendingRequests(isSuper).data?.items.length ?? 0;

  // 관리자 계정 메뉴는 최고 관리자에게만 보인다. (서버도 최고 관리자만 허용)
  const menu = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">대시보드</Link> },
    { key: '/products', icon: <ShoppingOutlined />, label: <Link to="/products">상품 관리</Link> },
    { key: '/brands', icon: <ShopOutlined />, label: <Link to="/brands">브랜드 관리</Link> },
    ...(isSuper
      ? [
          {
            key: '/accounts',
            icon: <TeamOutlined />,
            label: (
              <Link to={pendingCount > 0 ? '/accounts?tab=requests' : '/accounts'}>
                관리자 계정 <Badge count={pendingCount} size="small" style={{ marginLeft: 4 }} />
              </Link>
            ),
          },
        ]
      : []),
  ];
  const selected = menu.find((m) => m.key !== '/' && pathname.startsWith(m.key))?.key ?? '/';

  const logout = async () => {
    await api.logout();
    queryClient.clear();
    queryClient.setQueryData(['session'], { user: null });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={0} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '20px 24px', fontWeight: 700, fontSize: 18 }}>🍔 버거픽 관리자</div>
        <Menu mode="inline" selectedKeys={[selected]} items={menu} style={{ borderInlineEnd: 0 }} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
          <Flex justify="end" align="center" gap={12} style={{ height: '100%' }}>
            <Avatar>{user.name.slice(0, 1)}</Avatar>
            <Typography.Text>
              {user.name} <Typography.Text type="secondary">({user.loginId})</Typography.Text>
            </Typography.Text>
            {isSuper && <Tag color="gold">최고 관리자</Tag>}
            <Button icon={<KeyOutlined />} onClick={() => setChangingPassword(true)}>
              비밀번호 변경
            </Button>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              로그아웃
            </Button>
          </Flex>
        </Header>
        {isMockMode && (
          <Alert
            banner
            type="warning"
            title="목업 모드입니다. 데이터는 브라우저 메모리에만 있고 새로고침하면 초기화됩니다."
          />
        )}
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>

      <Modal title="비밀번호 변경" open={changingPassword} footer={null} onCancel={() => setChangingPassword(false)} destroyOnHidden>
        <Typography.Paragraph type="secondary">바꾸면 다른 기기에서 로그인한 세션은 모두 로그아웃됩니다.</Typography.Paragraph>
        <PasswordChangeForm
          loginId={user.loginId}
          onDone={() => {
            setChangingPassword(false);
            message.success('비밀번호를 바꿨습니다.');
          }}
        />
      </Modal>
    </Layout>
  );
}
