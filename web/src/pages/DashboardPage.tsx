import { CheckCircleTwoTone, WarningTwoTone } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, List, Row, Skeleton, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { api } from '@/api/admin';
import type { DashboardResponse } from '@/api/types';
import { formatWon, WARNING_INFO } from '@/lib/labels';

type PriceChangeRow = DashboardResponse['recentPriceChanges'][number];

export function DashboardPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  if (error) return <Alert type="error" showIcon title={error.message} />;
  if (isPending) return <Skeleton active />;

  return (
    <>
      <Typography.Title level={3}>대시보드</Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card><Statistic title="상품" value={data.productCount} suffix="개" /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="활성 브랜드" value={data.activeBrandCount} suffix="개" /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="최근 7일 가격 변경" value={data.priceChangesLast7Days} suffix="건" /></Card>
        </Col>
      </Row>

      <Typography.Title level={4} style={{ marginTop: 32 }}>
        데이터 품질 경고
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        판매 종료가 아닌 상품 기준입니다. 하나씩 고치면 사용자 화면에 바로 반영됩니다.
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {data.warnings.map((w) => {
          const info = WARNING_INFO[w.code];
          const ok = w.count === 0;
          return (
            <Col key={w.code} xs={24} md={12} xl={6}>
              <Card
                title={
                  <span>
                    {ok ? <CheckCircleTwoTone twoToneColor="#52c41a" /> : <WarningTwoTone twoToneColor="#faad14" />}{' '}
                    {info.title}
                  </span>
                }
                extra={<Tag color={ok ? 'green' : 'orange'}>{w.count}개</Tag>}
              >
                <Typography.Paragraph type="secondary" style={{ minHeight: 44 }}>
                  {info.impact}
                </Typography.Paragraph>
                {!ok && (
                  <List
                    size="small"
                    dataSource={w.samples}
                    renderItem={(s) => (
                      <List.Item>
                        <Link to={`/products/${s.id}`}>
                          {s.brandName} · {s.name}
                        </Link>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      <Typography.Title level={4} style={{ marginTop: 32 }}>
        최근 가격 변경
      </Typography.Title>
      <Table<PriceChangeRow>
        rowKey={(r) => `${r.productId}-${r.variantName}-${r.changedAt}`}
        dataSource={data.recentPriceChanges}
        pagination={false}
        locale={{ emptyText: '아직 가격 변경 기록이 없습니다.' }}
        columns={[
          { title: '변경일', dataIndex: 'changedAt', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
          { title: '브랜드', dataIndex: 'brandName' },
          {
            title: '상품',
            dataIndex: 'productName',
            render: (name: string, r) => <Link to={`/products/${r.productId}`}>{name}</Link>,
          },
          { title: '구성', dataIndex: 'variantName' },
          { title: '이전 가격', dataIndex: 'previousPrice', align: 'right', render: formatWon },
          {
            title: '변경 가격',
            dataIndex: 'price',
            align: 'right',
            render: (price: number, r) => {
              const diff = r.previousPrice == null ? 0 : price - r.previousPrice;
              const color = diff > 0 ? '#cf1322' : diff < 0 ? '#1677ff' : undefined;
              return (
                <span style={{ color }}>
                  {formatWon(price)}
                  {diff !== 0 && ` (${diff > 0 ? '+' : ''}${diff.toLocaleString('ko-KR')})`}
                </span>
              );
            },
          },
        ]}
      />
    </>
  );
}
