-- ============================================================================
-- 관리자 가입 신청
-- 로그인 화면에서 누구나 신청할 수 있고, 최고 관리자가 승인하면 admin_accounts 에 계정이 생긴다.
-- 신청자가 정한 비밀번호는 해시로만 보관하고, 승인되면 그대로 계정 비밀번호가 된다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_account_requests (
    id                  BIGSERIAL PRIMARY KEY,
    login_id            VARCHAR(30) NOT NULL,                   -- 소문자로 저장
    name                VARCHAR(50) NOT NULL,
    password_hash       TEXT NOT NULL,
    message             VARCHAR(300),                           -- 신청 사유
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by         BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    reject_reason       VARCHAR(200),
    account_id          BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,   -- 승인으로 만든 계정
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 같은 아이디로 대기 중인 신청은 하나만
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_account_requests_pending_login_id
    ON admin_account_requests (login_id)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_admin_account_requests_status
    ON admin_account_requests (status, created_at DESC);
