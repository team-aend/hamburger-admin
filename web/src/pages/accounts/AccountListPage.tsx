import { KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Badge, Button, Flex, Form, Input, Modal, Radio, Result, Select, Switch, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/admin';
import type { AccountRequest, AdminAccount, SessionUser, TemporaryPasswordResponse, UserRole } from '@/api/types';
import { useSession } from '@/auth/RequireAdmin';

export const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: '최고 관리자',
  ADMIN: '관리자',
};

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as UserRole[]).map((value) => ({ value, label: ROLE_LABEL[value] }));

const formatTime = (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—');

/** 대기 중인 가입 신청 수. 사이드 메뉴 배지와 탭에서 함께 쓴다. (최고 관리자만) */
export function usePendingRequests(enabled: boolean) {
  return useQuery({
    queryKey: ['account-requests', 'PENDING'],
    queryFn: () => api.listAccountRequests('PENDING'),
    enabled,
    refetchInterval: 60_000,
  });
}

/**
 * 관리자 계정 관리 (최고 관리자 전용)
 * - 계정: 직접 등록(임시 비밀번호), 사용·중지, 권한 변경, 비밀번호 초기화
 * - 가입 신청: 로그인 화면에서 온 신청을 승인·반려
 */
export function AccountListPage() {
  const me = useSession().data?.user as SessionUser;
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'requests' ? 'requests' : 'accounts';
  const pending = usePendingRequests(me.role === 'SUPER_ADMIN');

  if (me.role !== 'SUPER_ADMIN') {
    return <Result status="403" title="최고 관리자만 볼 수 있습니다" subTitle="계정 관리와 가입 승인은 최고 관리자에게 요청해 주세요." />;
  }

  return (
    <>
      <Typography.Title level={3}>관리자 계정</Typography.Title>
      <Tabs
        activeKey={tab}
        onChange={(key) => setParams(key === 'requests' ? { tab: 'requests' } : {}, { replace: true })}
        items={[
          { key: 'accounts', label: '계정', children: <AccountsTab me={me} /> },
          {
            key: 'requests',
            label: (
              <Badge count={pending.data?.items.length ?? 0} size="small" offset={[8, 0]}>
                가입 신청
              </Badge>
            ),
            children: <RequestsTab />,
          },
        ]}
      />
    </>
  );
}

// ── 계정 ─────────────────────────────────────────────

function AccountsTab({ me }: { me: SessionUser }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<TemporaryPasswordResponse | null>(null);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['accounts'] });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.setAccountActive(id, isActive),
    onSuccess: (account) => {
      message.success(account.isActive ? `${account.name} 계정을 다시 사용합니다.` : `${account.name} 계정을 중지했습니다.`);
      refresh();
    },
    onError: (error) => message.error(error.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => api.setAccountRole(id, role),
    onSuccess: (account) => {
      message.success(`${account.name}의 권한을 ${ROLE_LABEL[account.role]}(으)로 바꿨습니다.`);
      refresh();
    },
    onError: (error) => message.error(error.message),
  });

  const reset = useMutation({
    mutationFn: (id: string) => api.resetAccountPassword(id),
    onSuccess: (result) => {
      setIssued(result);
      refresh();
    },
    onError: (error) => message.error(error.message),
  });

  const confirmToggle = (account: AdminAccount, isActive: boolean) => {
    if (isActive) {
      toggle.mutate({ id: account.id, isActive });
      return;
    }
    modal.confirm({
      title: `${account.name}(${account.loginId}) 계정을 중지할까요?`,
      content: '중지하면 이 계정으로 로그인한 세션이 바로 끊기고 다시 로그인할 수 없습니다.',
      okText: '중지',
      okButtonProps: { danger: true },
      cancelText: '취소',
      onOk: () => toggle.mutateAsync({ id: account.id, isActive: false }),
    });
  };

  const confirmRole = (account: AdminAccount, role: UserRole) => {
    modal.confirm({
      title: `${account.name}(${account.loginId})을(를) ${ROLE_LABEL[role]}(으)로 바꿀까요?`,
      content:
        role === 'SUPER_ADMIN'
          ? '최고 관리자는 관리자 계정을 만들고, 중지하고, 가입 신청을 승인할 수 있습니다.'
          : '관리자는 상품·브랜드만 관리할 수 있고 계정 관리와 가입 승인은 할 수 없습니다.',
      okText: '변경',
      cancelText: '취소',
      onOk: () => changeRole.mutateAsync({ id: account.id, role }),
    });
  };

  const confirmReset = (account: AdminAccount) => {
    modal.confirm({
      title: `${account.name}(${account.loginId}) 비밀번호를 초기화할까요?`,
      content: '새 임시 비밀번호를 만들고 기존 비밀번호와 로그인 세션은 끊습니다. 잠긴 계정도 풀립니다.',
      okText: '초기화',
      cancelText: '취소',
      onOk: () => reset.mutateAsync(account.id),
    });
  };

  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">
          직접 등록하면 임시 비밀번호가 한 번 표시됩니다. 받는 사람에게 직접 전달해 주세요.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          관리자 등록
        </Button>
      </Flex>

      {accounts.error && <Alert type="error" showIcon title={accounts.error.message} style={{ marginBottom: 16 }} />}

      <Table<AdminAccount>
        rowKey="id"
        loading={accounts.isPending}
        dataSource={accounts.data?.items}
        pagination={false}
        scroll={{ x: 980 }}
        columns={[
          {
            title: '이름',
            dataIndex: 'name',
            render: (name: string, a) => (
              <>
                {name}
                {a.id === me.id && <Tag color="blue" style={{ marginLeft: 8 }}>나</Tag>}
              </>
            ),
          },
          { title: '아이디', dataIndex: 'loginId' },
          {
            title: '권한',
            dataIndex: 'role',
            width: 150,
            render: (role: UserRole, a) =>
              a.id === me.id ? (
                <Tag color={role === 'SUPER_ADMIN' ? 'gold' : 'default'}>{ROLE_LABEL[role]}</Tag>
              ) : (
                <Select<UserRole>
                  size="small"
                  value={role}
                  options={ROLE_OPTIONS}
                  style={{ width: 120 }}
                  onChange={(next) => confirmRole(a, next)}
                />
              ),
          },
          {
            title: '상태',
            render: (_, a) => (
              <Flex gap={4} wrap>
                {!a.isActive && <Tag>중지</Tag>}
                {a.isLocked && <Tag color="red">잠김</Tag>}
                {a.mustChangePassword && <Tag color="orange">임시 비밀번호</Tag>}
                {a.isActive && !a.isLocked && !a.mustChangePassword && <Tag color="green">사용 중</Tag>}
              </Flex>
            ),
          },
          { title: '마지막 로그인', dataIndex: 'lastLoginAt', render: formatTime },
          {
            title: '등록',
            render: (_, a) => (
              <>
                {dayjs(a.createdAt).format('YYYY-MM-DD')}
                {a.createdByName && <Typography.Text type="secondary"> · {a.createdByName}</Typography.Text>}
              </>
            ),
          },
          {
            title: '사용',
            dataIndex: 'isActive',
            width: 80,
            render: (isActive: boolean, a) => (
              <Switch
                checked={isActive}
                disabled={a.id === me.id}
                loading={toggle.isPending && toggle.variables?.id === a.id}
                onChange={(checked) => confirmToggle(a, checked)}
              />
            ),
          },
          {
            title: '',
            width: 150,
            align: 'right',
            render: (_, a) => (
              <Button icon={<KeyOutlined />} disabled={a.id === me.id} onClick={() => confirmReset(a)}>
                비밀번호 초기화
              </Button>
            ),
          },
        ]}
      />

      {creating && (
        <CreateAccountModal
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setIssued(result);
            refresh();
          }}
        />
      )}
      {issued && <TemporaryPasswordModal issued={issued} onClose={() => setIssued(null)} />}
    </>
  );
}

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: TemporaryPasswordResponse) => void }) {
  const [form] = Form.useForm<{ loginId: string; name: string; role: UserRole }>();
  const create = useMutation({
    mutationFn: (values: { loginId: string; name: string; role: UserRole }) => api.createAccount(values),
    onSuccess: onCreated,
  });

  return (
    <Modal
      open
      title="관리자 등록"
      okText="등록"
      cancelText="취소"
      confirmLoading={create.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
    >
      {create.error && <Alert type="error" showIcon title={create.error.message} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" initialValues={{ role: 'ADMIN' }} onFinish={(values) => create.mutate(values)}>
        <Form.Item
          name="loginId"
          label="아이디"
          extra="4~30자의 영문 소문자, 숫자, . _ - 만 쓸 수 있습니다."
          normalize={(v: string) => v.toLowerCase()}
          rules={[
            { required: true, message: '아이디를 입력해 주세요.' },
            { pattern: /^[a-z0-9][a-z0-9._-]{3,29}$/, message: '4~30자의 영문 소문자, 숫자, . _ - 만 쓸 수 있습니다.' },
          ]}
        >
          <Input autoComplete="off" placeholder="staff.kim" />
        </Form.Item>
        <Form.Item name="name" label="이름" rules={[{ required: true, whitespace: true, message: '이름을 입력해 주세요.' }]}>
          <Input maxLength={50} placeholder="김직원" />
        </Form.Item>
        <Form.Item name="role" label="권한">
          <Radio.Group options={ROLE_OPTIONS} />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">비밀번호는 서버가 임시로 만들어 등록 후 한 번 보여줍니다.</Typography.Text>
    </Modal>
  );
}

function TemporaryPasswordModal({ issued, onClose }: { issued: TemporaryPasswordResponse; onClose: () => void }) {
  return (
    <Modal open title="임시 비밀번호" onCancel={onClose} footer={<Button type="primary" onClick={onClose}>확인</Button>} maskClosable={false}>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title="이 창을 닫으면 임시 비밀번호를 다시 볼 수 없습니다."
        description="받는 사람에게 직접 전달해 주세요. 처음 로그인할 때 새 비밀번호로 바꿔야 합니다."
      />
      <Typography.Paragraph>
        <Typography.Text type="secondary">아이디 </Typography.Text>
        <Typography.Text strong>{issued.account.loginId}</Typography.Text>
      </Typography.Paragraph>
      <Typography.Paragraph>
        <Typography.Text type="secondary">임시 비밀번호 </Typography.Text>
        <Typography.Text strong code copyable style={{ fontSize: 18 }}>
          {issued.temporaryPassword}
        </Typography.Text>
      </Typography.Paragraph>
    </Modal>
  );
}

// ── 가입 신청 ─────────────────────────────────────────────

const STATUS_TAG: Record<AccountRequest['status'], { color: string; label: string }> = {
  PENDING: { color: 'orange', label: '대기' },
  APPROVED: { color: 'green', label: '승인' },
  REJECTED: { color: 'default', label: '반려' },
};

function RequestsTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [approving, setApproving] = useState<AccountRequest | null>(null);
  const [rejecting, setRejecting] = useState<AccountRequest | null>(null);

  const requests = useQuery({ queryKey: ['account-requests', 'ALL'], queryFn: () => api.listAccountRequests() });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['account-requests'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
  };

  const approve = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => api.approveAccountRequest(id, role),
    onSuccess: ({ account }) => {
      message.success(`${account.name}(${account.loginId}) 계정을 승인했습니다. 신청한 비밀번호로 로그인할 수 있습니다.`);
      setApproving(null);
      refresh();
    },
    onError: (error) => message.error(error.message),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) => api.rejectAccountRequest(id, reason),
    onSuccess: () => {
      message.success('신청을 반려했습니다.');
      setRejecting(null);
      refresh();
    },
    onError: (error) => message.error(error.message),
  });

  return (
    <>
      <Typography.Paragraph type="secondary">
        로그인 화면의 "관리자 가입 신청"으로 들어온 신청입니다. 승인하면 신청자가 정한 비밀번호로 바로 로그인할 수 있습니다.
      </Typography.Paragraph>
      {requests.error && <Alert type="error" showIcon title={requests.error.message} style={{ marginBottom: 16 }} />}
      <Table<AccountRequest>
        rowKey="id"
        loading={requests.isPending}
        dataSource={requests.data?.items}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
        locale={{ emptyText: '가입 신청이 없습니다.' }}
        columns={[
          { title: '신청일', dataIndex: 'createdAt', width: 150, render: formatTime },
          { title: '이름', dataIndex: 'name' },
          { title: '아이디', dataIndex: 'loginId' },
          {
            title: '신청 사유',
            dataIndex: 'message',
            render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: '상태',
            dataIndex: 'status',
            width: 200,
            render: (status: AccountRequest['status'], r) => (
              <>
                <Tag color={STATUS_TAG[status].color}>{STATUS_TAG[status].label}</Tag>
                {r.reviewedByName && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {r.reviewedByName} · {formatTime(r.reviewedAt)}
                  </Typography.Text>
                )}
                {r.rejectReason && (
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>사유: {r.rejectReason}</Typography.Text>
                  </div>
                )}
              </>
            ),
          },
          {
            title: '',
            width: 160,
            align: 'right',
            render: (_, r) =>
              r.status === 'PENDING' && (
                <Flex gap={8} justify="end">
                  <Button type="primary" size="small" onClick={() => setApproving(r)}>
                    승인
                  </Button>
                  <Button danger size="small" onClick={() => setRejecting(r)}>
                    반려
                  </Button>
                </Flex>
              ),
          },
        ]}
      />

      {approving && (
        <ApproveModal
          request={approving}
          loading={approve.isPending}
          onOk={(role) => approve.mutate({ id: approving.id, role })}
          onCancel={() => setApproving(null)}
        />
      )}
      {rejecting && (
        <RejectModal
          request={rejecting}
          loading={reject.isPending}
          onOk={(reason) => reject.mutate({ id: rejecting.id, reason })}
          onCancel={() => setRejecting(null)}
        />
      )}
    </>
  );
}

function ApproveModal({
  request,
  loading,
  onOk,
  onCancel,
}: {
  request: AccountRequest;
  loading: boolean;
  onOk: (role: UserRole) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<UserRole>('ADMIN');
  return (
    <Modal open title={`${request.name}(${request.loginId}) 승인`} okText="승인" cancelText="취소" confirmLoading={loading} onOk={() => onOk(role)} onCancel={onCancel}>
      <Typography.Paragraph>승인하면 계정이 만들어지고, 신청자가 정한 비밀번호로 바로 로그인할 수 있습니다.</Typography.Paragraph>
      <Typography.Text strong>권한</Typography.Text>
      <div style={{ marginTop: 8 }}>
        <Radio.Group value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS} />
      </div>
    </Modal>
  );
}

function RejectModal({
  request,
  loading,
  onOk,
  onCancel,
}: {
  request: AccountRequest;
  loading: boolean;
  onOk: (reason: string | null) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      title={`${request.name}(${request.loginId}) 반려`}
      okText="반려"
      okButtonProps={{ danger: true }}
      cancelText="취소"
      confirmLoading={loading}
      onOk={() => onOk(reason.trim() || null)}
      onCancel={onCancel}
    >
      <Typography.Paragraph>반려 사유는 신청자가 같은 아이디로 로그인을 시도할 때 안내됩니다.</Typography.Paragraph>
      <Input.TextArea rows={2} maxLength={200} placeholder="반려 사유 (선택)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
