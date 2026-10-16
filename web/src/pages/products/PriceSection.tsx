import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, InputNumber, Modal, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '@/api/admin';
import type { PriceHistoryEntry, ProductDetail, Variant } from '@/api/types';
import { formatWon } from '@/lib/labels';

/** 매장가 변경과 이력. 서버가 한 트랜잭션에서 현재 행 종료 → 새 행 추가를 처리한다. */
export function PriceSection({ product }: { product: ProductDetail }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<Variant | null>(null);
  const [form] = Form.useForm<{ price: number; reason?: string }>();

  const history = useQuery({
    queryKey: ['prices', product.id],
    queryFn: () => api.getPriceHistory(product.id),
  });

  const change = useMutation({
    mutationFn: (values: { price: number; reason?: string }) =>
      api.changeStorePrice(target!.id, { price: values.price, reason: values.reason?.trim() || null }),
    onSuccess: () => {
      message.success('매장가를 변경했습니다.');
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: ['product', product.id] });
      queryClient.invalidateQueries({ queryKey: ['prices', product.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => message.error(error.message),
  });

  const variantName = (id: string) => product.variants.find((v) => v.id === id)?.name ?? id;

  const open = (variant: Variant) => {
    form.resetFields();
    form.setFieldsValue({ price: variant.storePrice ?? undefined });
    setTarget(variant);
  };

  return (
    <Card title="매장가" style={{ marginTop: 16 }}>
      <Table<Variant>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={product.variants}
        columns={[
          {
            title: '구성',
            dataIndex: 'name',
            render: (name: string, v) => (
              <>
                {name}
                {v.isDefault && <Tag color="blue" style={{ marginLeft: 8 }}>기본</Tag>}
                {!v.isActive && <Tag style={{ marginLeft: 8 }}>사용 안 함</Tag>}
              </>
            ),
          },
          {
            title: '현재 매장가',
            dataIndex: 'storePrice',
            align: 'right',
            render: (price: number | null) => (price == null ? <Tag color="red">없음</Tag> : formatWon(price)),
          },
          {
            title: '',
            align: 'right',
            render: (_, v) => <Button onClick={() => open(v)}>가격 변경</Button>,
          },
        ]}
      />

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        변경 이력
      </Typography.Title>
      <Table<PriceHistoryEntry>
        rowKey="id"
        size="small"
        loading={history.isPending}
        dataSource={history.data?.items}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: '가격 기록이 없습니다.' }}
        columns={[
          { title: '구성', dataIndex: 'variantId', render: variantName },
          { title: '매장가', dataIndex: 'price', align: 'right', render: formatWon },
          { title: '시작', dataIndex: 'startedAt', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
          {
            title: '종료',
            dataIndex: 'endedAt',
            render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : <Tag color="green">현재</Tag>),
          },
        ]}
      />

      <Modal
        title={target ? `${target.name} 매장가 변경` : ''}
        open={!!target}
        okText="변경"
        cancelText="취소"
        confirmLoading={change.isPending}
        onOk={() => form.submit()}
        onCancel={() => setTarget(null)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          현재 가격은 지금 시각으로 종료되고 새 가격이 이력에 추가됩니다. 이 상품을 좋아요한 회원에게 가격 변동 알림이 갑니다.
        </Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={(values) => change.mutate(values)}>
          <Form.Item
            name="price"
            label={`새 매장가 (현재 ${formatWon(target?.storePrice)})`}
            rules={[
              { required: true, message: '가격을 입력해 주세요.' },
              {
                validator: async (_, value: number | undefined) => {
                  if (value != null && value === target?.storePrice) throw new Error('현재 가격과 같습니다.');
                },
              },
            ]}
          >
            <InputNumber min={1} step={100} precision={0} style={{ width: '100%' }} suffix="원" autoFocus />
          </Form.Item>
          <Form.Item name="reason" label="변경 사유" extra="변경 기록에 남습니다.">
            <Input placeholder="예: 2026년 10월 가격 인상 공지" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
