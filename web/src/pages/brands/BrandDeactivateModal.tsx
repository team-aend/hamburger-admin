import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Descriptions, Input, Modal, Skeleton, Typography } from 'antd';
import { useState } from 'react';
import { api } from '@/api/admin';
import type { AdminBrand } from '@/api/types';
import { BRAND_RELATED_QUERIES } from './queries';

/** 중지 전에 검색·월드컵에서 빠지는 범위를 보여준다. */
export function BrandDeactivateModal({ brand, onClose }: { brand: AdminBrand; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const impact = useQuery({
    queryKey: ['brand-impact', brand.id],
    queryFn: () => api.getBrandDeactivationImpact(brand.id),
    staleTime: 0,
  });

  const deactivate = useMutation({
    mutationFn: () => api.setBrandActive(brand.id, { isActive: false, reason: reason.trim() || null }),
    onSuccess: () => {
      message.success(`${brand.name}을(를) 중지했습니다.`);
      BRAND_RELATED_QUERIES.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      onClose();
    },
    onError: (error) => message.error(error.message),
  });

  const data = impact.data;
  // 중지하면 시작할 수 없게 되는 월드컵 강수
  const lostRounds = data
    ? data.roundSizes.filter((size) => data.worldcupEligibleNow >= size && data.worldcupEligibleAfter < size)
    : [];

  return (
    <Modal
      open
      title={`${brand.name} 중지`}
      okText="중지"
      okButtonProps={{ danger: true, disabled: !data }}
      cancelText="취소"
      confirmLoading={deactivate.isPending}
      onOk={() => deactivate.mutate()}
      onCancel={onClose}
    >
      {impact.error ? (
        <Alert type="error" showIcon title={impact.error.message} />
      ) : !data ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <>
          <Typography.Paragraph>
            중지하면 아래 상품이 사용자 사이트의 검색, 랭킹, 월드컵에서 빠집니다. 상품 데이터와 가격 이력은 그대로 남습니다.
          </Typography.Paragraph>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="빠지는 판매 중 상품">{data.activeProductCount}개</Descriptions.Item>
            <Descriptions.Item label="월드컵 참가 가능 상품">
              {data.worldcupEligibleNow}개 → {data.worldcupEligibleAfter}개
            </Descriptions.Item>
          </Descriptions>
          {lostRounds.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
              title={`중지하면 월드컵 ${lostRounds.map((s) => `${s}강`).join(', ')}을 시작할 수 없습니다.`}
              description={`참가 가능한 상품이 ${data.worldcupEligibleAfter}개로 줄어듭니다.`}
            />
          )}
          <Input
            style={{ marginTop: 16 }}
            placeholder="중지 사유 (변경 기록에 남습니다)"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </>
      )}
    </Modal>
  );
}
