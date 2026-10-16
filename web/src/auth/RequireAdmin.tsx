import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Flex, Form, Input, Result, Spin, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { api, isMockMode } from '@/api/admin';
import { MOCK_ADMIN } from '@/api/mock';
import type { LoginInput, SessionUser } from '@/api/types';
import { PasswordChangeForm } from './PasswordChangeForm';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => api.getSession(),
    staleTime: 5 * 60 * 1000,
  });
}

function CenterCard({ children }: { children: ReactNode }) {
  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 16 }}>
      <Card style={{ width: 400, maxWidth: '100%' }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          🍔 버거픽 관리자
        </Typography.Title>
        {children}
      </Card>
    </Flex>
  );
}

interface RequestFormValues {
  loginId: string;
  name: string;
  password: string;
  confirm: string;
  message?: string;
}

/** 관리자 가입 신청. 최고 관리자가 승인하면 여기서 정한 비밀번호로 로그인한다. */
function AccountRequestScreen({ onBack }: { onBack: () => void }) {
  const [form] = Form.useForm<RequestFormValues>();
  const submit = useMutation({
    mutationFn: (v: RequestFormValues) =>
      api.submitAccountRequest({ loginId: v.loginId, name: v.name, password: v.password, message: v.message?.trim() || null }),
  });

  if (submit.isSuccess) {
    return (
      <CenterCard>
        <Result
          status="success"
          title="가입 신청을 보냈습니다"
          subTitle="최고 관리자가 승인하면 신청한 아이디와 비밀번호로 로그인할 수 있습니다."
          extra={<Button type="primary" onClick={onBack}>로그인 화면으로</Button>}
        />
      </CenterCard>
    );
  }

  return (
    <CenterCard>
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
        관리자 가입 신청 · 최고 관리자가 승인하면 로그인할 수 있습니다.
      </Typography.Paragraph>
      {submit.error && <Alert type="error" showIcon title={submit.error.message} style={{ marginBottom: 16 }} />}
      <Form<RequestFormValues> form={form} layout="vertical" onFinish={(v) => submit.mutate(v)} requiredMark={false}>
        <Form.Item
          name="loginId"
          label="아이디"
          normalize={(v: string) => v.toLowerCase()}
          rules={[
            { required: true, message: '아이디를 입력해 주세요.' },
            { pattern: /^[a-z0-9][a-z0-9._-]{3,29}$/, message: '4~30자의 영문 소문자, 숫자, . _ - 만 쓸 수 있습니다.' },
          ]}
        >
          <Input autoComplete="username" placeholder="staff.kim" />
        </Form.Item>
        <Form.Item name="name" label="이름" rules={[{ required: true, whitespace: true, message: '이름을 입력해 주세요.' }]}>
          <Input maxLength={50} />
        </Form.Item>
        <Form.Item
          name="password"
          label="비밀번호"
          extra="10자 이상, 영문과 숫자를 모두 넣어 주세요. 아이디는 넣을 수 없습니다."
          dependencies={['loginId']}
          rules={[
            { required: true, message: '비밀번호를 입력해 주세요.' },
            { min: 10, max: 72, message: '10자 이상 72자 이하로 입력해 주세요.' },
            ({ getFieldValue }) => ({
              validator: async (_, value?: string) => {
                if (!value) return;
                if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) throw new Error('영문과 숫자를 모두 넣어 주세요.');
                const loginId = getFieldValue('loginId') as string | undefined;
                if (loginId && value.toLowerCase().includes(loginId)) throw new Error('아이디는 넣을 수 없습니다.');
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="비밀번호 확인"
          dependencies={['password']}
          rules={[
            { required: true, message: '비밀번호를 한 번 더 입력해 주세요.' },
            ({ getFieldValue }) => ({
              validator: async (_, value?: string) => {
                if (value && value !== getFieldValue('password')) throw new Error('비밀번호와 같지 않습니다.');
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="message" label="신청 사유 (선택)">
          <Input.TextArea rows={2} maxLength={300} placeholder="예: 메뉴·가격 데이터 입력 담당" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submit.isPending}>
          가입 신청
        </Button>
      </Form>
      <Button type="link" block style={{ marginTop: 8 }} onClick={onBack}>
        로그인 화면으로
      </Button>
    </CenterCard>
  );
}

function LoginScreen() {
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  const login = useMutation({
    mutationFn: (values: LoginInput) => api.login(values),
    onSuccess: (session) => queryClient.setQueryData(['session'], session),
  });

  if (requesting) return <AccountRequestScreen onBack={() => setRequesting(false)} />;

  return (
    <CenterCard>
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
        관리자 계정으로 로그인해 주세요.
      </Typography.Paragraph>
      {isMockMode && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={`목업 계정: ${MOCK_ADMIN.loginId} / ${MOCK_ADMIN.password}`}
        />
      )}
      {login.error && <Alert type="error" showIcon title={login.error.message} style={{ marginBottom: 16 }} />}
      <Form<LoginInput> layout="vertical" onFinish={(values) => login.mutate(values)} requiredMark={false}>
        <Form.Item name="loginId" rules={[{ required: true, whitespace: true, message: '아이디를 입력해 주세요.' }]}>
          <Input prefix={<UserOutlined />} placeholder="아이디" autoComplete="username" size="large" autoFocus />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: '비밀번호를 입력해 주세요.' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="비밀번호" autoComplete="current-password" size="large" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={login.isPending}>
          로그인
        </Button>
      </Form>
      <Flex justify="center" align="center" gap={4} style={{ marginTop: 16 }}>
        <Typography.Text type="secondary">계정이 없나요?</Typography.Text>
        <Button type="link" style={{ padding: 0 }} onClick={() => setRequesting(true)}>
          관리자 가입 신청
        </Button>
      </Flex>
    </CenterCard>
  );
}

function FirstPasswordScreen({ user }: { user: SessionUser }) {
  const queryClient = useQueryClient();
  const logout = async () => {
    await api.logout();
    queryClient.setQueryData(['session'], { user: null });
  };

  return (
    <CenterCard>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title="임시 비밀번호로 로그인했습니다"
        description="관리 기능을 쓰려면 먼저 새 비밀번호로 바꿔 주세요."
      />
      <PasswordChangeForm loginId={user.loginId} />
      <Button type="link" block style={{ marginTop: 8 }} onClick={logout}>
        다른 계정으로 로그인
      </Button>
    </CenterCard>
  );
}

/**
 * 관리자만 통과시킨다. 화면 차단은 편의일 뿐이고,
 * 실제 권한 검사는 관리자 서버(requireAdmin)가 모든 /api/admin 요청에서 한다.
 */
export function RequireAdmin({ children }: { children: (user: SessionUser) => ReactNode }) {
  const { data, isPending, isError, refetch } = useSession();

  if (isPending) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError) {
    return (
      <Result
        status="error"
        title="관리자 서버에 연결할 수 없습니다"
        subTitle="관리자 서버(4100번 포트)가 실행 중인지 확인해 주세요. 서버 없이 화면만 보려면 npm run dev:mock 으로 실행합니다."
        extra={<Button onClick={() => refetch()}>다시 시도</Button>}
      />
    );
  }

  if (!data.user) return <LoginScreen />;
  if (data.user.mustChangePassword) return <FirstPasswordScreen user={data.user} />;
  return <>{children(data.user)}</>;
}
