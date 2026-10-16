import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input } from 'antd';
import { api } from '@/api/admin';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

/**
 * 비밀번호 변경. 첫 로그인(임시 비밀번호) 화면과 헤더의 "비밀번호 변경" 창에서 함께 쓴다.
 * 바꾸면 다른 곳의 로그인은 모두 끊기고 지금 세션만 유지된다.
 */
export function PasswordChangeForm({ loginId, onDone }: { loginId: string; onDone?: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const queryClient = useQueryClient();

  const change = useMutation({
    mutationFn: (values: FormValues) =>
      api.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: (session) => {
      queryClient.setQueryData(['session'], session);
      form.resetFields();
      onDone?.();
    },
  });

  return (
    <Form<FormValues> form={form} layout="vertical" onFinish={(values) => change.mutate(values)} requiredMark={false}>
      {change.error && <Alert type="error" showIcon title={change.error.message} style={{ marginBottom: 16 }} />}
      <Form.Item name="currentPassword" label="현재 비밀번호" rules={[{ required: true, message: '현재 비밀번호를 입력해 주세요.' }]}>
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Form.Item
        name="newPassword"
        label="새 비밀번호"
        extra="10자 이상, 영문과 숫자를 모두 넣어 주세요. 아이디는 넣을 수 없습니다."
        rules={[
          { required: true, message: '새 비밀번호를 입력해 주세요.' },
          { min: 10, max: 72, message: '10자 이상 72자 이하로 입력해 주세요.' },
          {
            validator: async (_, value?: string) => {
              if (!value) return;
              if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) throw new Error('영문과 숫자를 모두 넣어 주세요.');
              if (value.toLowerCase().includes(loginId.toLowerCase())) throw new Error('아이디는 넣을 수 없습니다.');
            },
          },
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        name="confirm"
        label="새 비밀번호 확인"
        dependencies={['newPassword']}
        rules={[
          { required: true, message: '새 비밀번호를 한 번 더 입력해 주세요.' },
          ({ getFieldValue }) => ({
            validator: async (_, value?: string) => {
              if (value && value !== getFieldValue('newPassword')) throw new Error('새 비밀번호와 같지 않습니다.');
            },
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={change.isPending}>
        비밀번호 변경
      </Button>
    </Form>
  );
}
