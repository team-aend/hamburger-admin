-- ============================================================================
-- 관리자 변경 기록
-- 누가, 언제, 무엇을, 어떻게 바꿨는지(변경 전·후 값) 남긴다. 잘못된 변경을 추적하고 되돌리는 근거.
-- 비밀번호·해시는 남기지 않는다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id                  BIGSERIAL PRIMARY KEY,
    admin_account_id    BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    action              VARCHAR(50) NOT NULL,           -- PRODUCT_CREATE, PRICE_CHANGE, ADMIN_CREATE ...
    target_type         VARCHAR(30) NOT NULL,           -- PRODUCT, VARIANT, BRAND, ADMIN_ACCOUNT
    target_id           VARCHAR(40) NOT NULL,
    before_data         JSONB,
    after_data          JSONB,
    reason              VARCHAR(200),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target
    ON admin_audit_logs (target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
    ON admin_audit_logs (created_at DESC);
