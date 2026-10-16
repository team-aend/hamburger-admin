import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Flex, Form, Input, Modal, Typography, Upload } from 'antd';
import { useState } from 'react';
import { api } from '@/api/admin';
import type { AdminBrand, BrandInput } from '@/api/types';
import { BRAND_RELATED_QUERIES } from './queries';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
// SVG 는 스크립트를 담을 수 있어 받지 않는다. (서버도 거부)
const LOGO_TYPES = ['image/png', 'image/webp', 'image/jpeg'];

interface FormValues {
  name: string;
  slug: string;
  homepageUrl?: string;
}

/** brand 가 null 이면 새 브랜드 등록 */
export function BrandFormModal({ brand, onClose }: { brand: AdminBrand | null; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [logoUrl, setLogoUrl] = useState(brand?.logoUrl ?? null);
  const isNew = brand === null;

  const refresh = () => BRAND_RELATED_QUERIES.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));

  const save = useMutation({
    mutationFn: (input: BrandInput) => (isNew ? api.createBrand(input) : api.updateBrand(brand.id, input)),
    onSuccess: (saved) => {
      message.success(isNew ? `${saved.name}을(를) 등록했습니다.` : '저장했습니다.');
      refresh();
      onClose();
    },
    onError: (error) => message.error(error.message),
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => api.uploadBrandLogo(brand!.id, file),
    onSuccess: ({ logoUrl }) => {
      setLogoUrl(logoUrl);
      message.success('로고를 바꿨습니다.');
      refresh();
    },
    onError: (error) => message.error(error.message),
  });

  const beforeUpload = (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) message.error('PNG, WebP, JPG 이미지만 올릴 수 있습니다.');
    else if (file.size > MAX_LOGO_BYTES) message.error('2MB 이하 이미지만 올릴 수 있습니다.');
    else uploadLogo.mutate(file);
    return false;
  };

  return (
    <Modal
      open
      title={isNew ? '브랜드 등록' : `${brand.name} 수정`}
      okText={isNew ? '등록' : '저장'}
      cancelText="취소"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={brand ? { name: brand.name, slug: brand.slug, homepageUrl: brand.homepageUrl ?? undefined } : undefined}
        onFinish={(values) =>
          save.mutate({
            name: values.name.trim(),
            slug: values.slug.trim(),
            homepageUrl: values.homepageUrl?.trim() || null,
          })
        }
      >
        <Form.Item name="name" label="브랜드명" rules={[{ required: true, whitespace: true, message: '브랜드명을 입력해 주세요.' }]}>
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          name="slug"
          label="slug"
          tooltip="사용자 사이트 주소와 크롤러 연결에 쓰입니다. 바꾸면 기존 주소가 깨질 수 있습니다."
          rules={[
            { required: true, message: 'slug 를 입력해 주세요.' },
            { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '영문 소문자, 숫자, - 만 쓸 수 있습니다.' },
          ]}
        >
          <Input maxLength={100} placeholder="burgerking" />
        </Form.Item>
        <Form.Item name="homepageUrl" label="공식 홈페이지" rules={[{ type: 'url', message: 'https:// 로 시작하는 주소를 입력해 주세요.' }]}>
          <Input placeholder="https://" />
        </Form.Item>
      </Form>

      <Typography.Text strong>로고</Typography.Text>
      {isNew ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
          로고는 브랜드를 등록한 뒤 올릴 수 있습니다.
        </Typography.Paragraph>
      ) : (
        <Flex align="center" gap={16} style={{ marginTop: 8 }}>
          <Avatar shape="square" size={64} src={logoUrl ?? undefined}>
            {brand.name.slice(0, 1)}
          </Avatar>
          <Upload accept={LOGO_TYPES.join(',')} showUploadList={false} beforeUpload={beforeUpload}>
            <Button icon={<UploadOutlined />} loading={uploadLogo.isPending}>
              {logoUrl ? '로고 교체' : '로고 올리기'}
            </Button>
          </Upload>
          <Typography.Text type="secondary">PNG·WebP·JPG, 2MB 이하</Typography.Text>
        </Flex>
      )}
    </Modal>
  );
}
