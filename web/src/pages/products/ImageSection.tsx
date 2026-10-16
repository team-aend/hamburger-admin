import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Empty, Flex, Image, Typography, Upload } from 'antd';
import { api } from '@/api/admin';
import type { ProductDetail } from '@/api/types';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

/** 상품 이미지. 서버가 Supabase Storage 에 올리고 이전 파일을 정리한다. */
export function ImageSection({ product }: { product: ProductDetail }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadProductImage(product.id, file),
    onSuccess: () => {
      message.success('이미지를 바꿨습니다.');
      queryClient.invalidateQueries({ queryKey: ['product', product.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => message.error(error.message),
  });

  const beforeUpload = (file: File) => {
    if (!ACCEPT.includes(file.type)) {
      message.error('JPG, PNG, WebP 이미지만 올릴 수 있습니다.');
    } else if (file.size > MAX_BYTES) {
      message.error('5MB 이하 이미지만 올릴 수 있습니다.');
    } else {
      upload.mutate(file);
    }
    return false; // 업로드는 직접 처리한다.
  };

  return (
    <Card title="이미지" style={{ marginTop: 16 }}>
      <Flex vertical align="center" gap={16}>
        {product.imageUrl ? (
          <Image src={product.imageUrl} width={240} style={{ objectFit: 'cover', borderRadius: 8 }} />
        ) : (
          <Empty description="이미지가 없어 사용자 화면에 대체 이미지가 표시됩니다." />
        )}
        <Upload accept={ACCEPT.join(',')} showUploadList={false} beforeUpload={beforeUpload}>
          <Button icon={<UploadOutlined />} loading={upload.isPending}>
            {product.imageUrl ? '이미지 교체' : '이미지 올리기'}
          </Button>
        </Upload>
        <Typography.Text type="secondary">JPG·PNG·WebP, 5MB 이하</Typography.Text>
      </Flex>
    </Card>
  );
}
