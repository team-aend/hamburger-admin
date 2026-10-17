import { PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Flex, Image, Input, Select, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/api/admin';
import type { ProductListItem, ProductStatus } from '@/api/types';
import { formatWon, STATUS_COLOR, STATUS_LABEL } from '@/lib/labels';

const PAGE_SIZE = 20;

export function ProductListPage() {
  const navigate = useNavigate();
  // 필터를 주소에 두어 새로고침·뒤로 가기 후에도 유지한다.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const brandId = params.get('brandId') ?? undefined;
  const status = (params.get('status') as ProductStatus | null) ?? undefined;
  const page = Number(params.get('page')) || 1;

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.getMeta(), staleTime: Infinity });
  const list = useQuery({
    queryKey: ['products', { q, brandId, status, page }],
    queryFn: () => api.listProducts({ q, brandId, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          상품 관리
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/products/new')}>
          상품 등록
        </Button>
      </Flex>

      <Flex gap={8} wrap style={{ margin: '16px 0' }}>
        <Input.Search
          allowClear
          placeholder="상품명·slug 검색"
          defaultValue={q}
          onSearch={(value) => update({ q: value || undefined })}
          style={{ width: 260 }}
        />
        <Select
          allowClear
          placeholder="브랜드"
          value={brandId}
          onChange={(value) => update({ brandId: value })}
          options={meta.data?.brands.map((b) => ({ value: b.id, label: b.name }))}
          style={{ width: 160 }}
        />
        <Select
          allowClear
          placeholder="판매 상태"
          value={status}
          onChange={(value) => update({ status: value })}
          options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          style={{ width: 160 }}
        />
      </Flex>

      {list.error && <Alert type="error" showIcon title={list.error.message} style={{ marginBottom: 16 }} />}

      <Table<ProductListItem>
        rowKey="id"
        loading={list.isFetching}
        dataSource={list.data?.items}
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: list.data?.total,
          showSizeChanger: false,
          showTotal: (total) => `총 ${total}개`,
          onChange: (p) => update({ page: String(p) }),
        }}
        onRow={(record) => ({ onClick: () => navigate(`/products/${record.id}`), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: '이미지',
            dataIndex: 'imageUrl',
            width: 80,
            render: (url: string | null) =>
              url ? (
                <Image src={url} width={48} height={48} style={{ objectFit: 'cover', borderRadius: 6 }} preview={false} />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    background: '#f5f5f5',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 24,
                  }}
                  title="기본 이미지 (미등록)"
                >
                  🍔
                </div>
              ),
          },
          { title: '브랜드', dataIndex: 'brandName', width: 110 },
          {
            title: '상품명',
            dataIndex: 'name',
            render: (name: string, r) => (
              <>
                <Link to={`/products/${r.id}`} onClick={(e) => e.stopPropagation()}>
                  {name}
                </Link>
                {r.isLimited && <Tag style={{ marginLeft: 8 }}>한정</Tag>}
              </>
            ),
          },
          {
            title: '판매 상태',
            dataIndex: 'status',
            width: 130,
            render: (s: ProductStatus) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
          },
          {
            title: '매장가(기본 구성)',
            dataIndex: 'storePrice',
            align: 'right',
            width: 150,
            render: (price: number | null) =>
              price == null ? <Tag color="red">없음</Tag> : formatWon(price),
          },
          {
            title: '열량',
            dataIndex: 'caloriesKcal',
            align: 'right',
            width: 100,
            render: (kcal: number | null) =>
              kcal == null ? <Tag color="orange">없음</Tag> : `${kcal.toLocaleString('ko-KR')}kcal`,
          },
          {
            title: '수정일',
            dataIndex: 'updatedAt',
            width: 120,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
          },
        ]}
      />
    </>
  );
}
