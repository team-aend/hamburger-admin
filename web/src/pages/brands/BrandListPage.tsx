import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Avatar, Button, Flex, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/admin';
import type { AdminBrand } from '@/api/types';
import { BrandDeactivateModal } from './BrandDeactivateModal';
import { BrandFormModal } from './BrandFormModal';
import { BRAND_RELATED_QUERIES } from './queries';

export function BrandListPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  // undefined = 닫힘, null = 새 브랜드
  const [editing, setEditing] = useState<AdminBrand | null | undefined>(undefined);
  const [deactivating, setDeactivating] = useState<AdminBrand | null>(null);

  const brands = useQuery({ queryKey: ['brands'], queryFn: () => api.listBrands() });

  const activate = useMutation({
    mutationFn: (brand: AdminBrand) => api.setBrandActive(brand.id, { isActive: true, reason: null }),
    onSuccess: (brand) => {
      message.success(`${brand.name}을(를) 다시 사용합니다.`);
      BRAND_RELATED_QUERIES.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    },
    onError: (error) => message.error(error.message),
  });

  const onToggle = (brand: AdminBrand, checked: boolean) => {
    if (checked) activate.mutate(brand);
    else setDeactivating(brand); // 중지는 영향 범위를 확인한 뒤에만
  };

  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          브랜드 관리
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>
          브랜드 등록
        </Button>
      </Flex>
      <Typography.Paragraph type="secondary" style={{ margin: '8px 0 16px' }}>
        브랜드를 중지하면 그 브랜드 상품이 검색, 랭킹, 월드컵에서 빠집니다. 상품이 연결되어 있어 삭제 대신 중지를 씁니다.
      </Typography.Paragraph>

      {brands.error && <Alert type="error" showIcon title={brands.error.message} style={{ marginBottom: 16 }} />}

      <Table<AdminBrand>
        rowKey="id"
        loading={brands.isPending}
        dataSource={brands.data?.items}
        pagination={false}
        scroll={{ x: 800 }}
        columns={[
          {
            title: '로고',
            dataIndex: 'logoUrl',
            width: 72,
            render: (url: string | null, b) => (
              <Avatar shape="square" size={40} src={url ?? undefined}>
                {b.name.slice(0, 1)}
              </Avatar>
            ),
          },
          {
            title: '브랜드',
            dataIndex: 'name',
            render: (name: string, b) => (
              <>
                <div>{name}</div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {b.slug}
                </Typography.Text>
              </>
            ),
          },
          {
            title: '홈페이지',
            dataIndex: 'homepageUrl',
            render: (url: string | null) =>
              url ? (
                <a href={url} target="_blank" rel="noreferrer">
                  {url.replace(/^https?:\/\//, '')}
                </a>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
          {
            title: '상품 (판매 중 / 전체)',
            align: 'right',
            width: 170,
            render: (_, b) => (
              <Link to={`/products?brandId=${b.id}`}>
                {b.activeProductCount} / {b.productCount}개
              </Link>
            ),
          },
          {
            title: '사용',
            dataIndex: 'isActive',
            width: 110,
            render: (isActive: boolean, b) => (
              <Flex align="center" gap={8}>
                <Switch
                  checked={isActive}
                  loading={activate.isPending && activate.variables?.id === b.id}
                  onChange={(checked) => onToggle(b, checked)}
                />
                {!isActive && <Tag>중지</Tag>}
              </Flex>
            ),
          },
          {
            title: '',
            width: 90,
            align: 'right',
            render: (_, b) => (
              <Button icon={<EditOutlined />} onClick={() => setEditing(b)}>
                수정
              </Button>
            ),
          },
        ]}
      />

      {editing !== undefined && <BrandFormModal brand={editing} onClose={() => setEditing(undefined)} />}
      {deactivating && <BrandDeactivateModal brand={deactivating} onClose={() => setDeactivating(null)} />}
    </>
  );
}
