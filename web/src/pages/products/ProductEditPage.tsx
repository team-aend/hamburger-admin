import { ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Col, Flex, Row, Skeleton, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/api/admin';
import type { ProductInput } from '@/api/types';
import { ImageSection } from './ImageSection';
import { PriceSection } from './PriceSection';
import { ProductForm } from './ProductForm';

export function ProductEditPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.getMeta(), staleTime: Infinity });
  const product = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.getProduct(id!),
    enabled: !isNew,
  });

  const save = useMutation({
    mutationFn: (input: ProductInput) => (isNew ? api.createProduct(input) : api.updateProduct(id!, input)),
    onSuccess: (saved) => {
      message.success(isNew ? '상품을 등록했습니다.' : '저장했습니다.');
      queryClient.setQueryData(['product', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['prices', saved.id] });
      if (isNew) navigate(`/products/${saved.id}`, { replace: true });
    },
    onError: (error) => message.error(error.message),
  });

  const error = meta.error ?? product.error;
  const loading = meta.isPending || (!isNew && product.isPending);

  return (
    <>
      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/products')} />
        <Typography.Title level={3} style={{ margin: 0 }}>
          {isNew ? '상품 등록' : (product.data?.name ?? '상품 수정')}
        </Typography.Title>
      </Flex>

      {error ? (
        <Alert type="error" showIcon title={error.message} />
      ) : loading ? (
        <Skeleton active />
      ) : (
        <Row gutter={16}>
          <Col xs={24} xl={isNew ? 24 : 16}>
            <ProductForm
              // 저장한 뒤에만 서버 값으로 폼을 다시 채운다. (가격 변경 등으로 작성 중인 내용이 지워지지 않게)
              key={`${id ?? 'new'}-${save.data?.updatedAt ?? ''}`}
              meta={meta.data!}
              product={product.data}
              saving={save.isPending}
              onSubmit={(input) => save.mutate(input)}
            />
          </Col>
          {!isNew && product.data && (
            <Col xs={24} xl={8}>
              <ImageSection product={product.data} />
              <PriceSection product={product.data} />
            </Col>
          )}
        </Row>
      )}
    </>
  );
}
