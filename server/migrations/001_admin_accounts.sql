-- ============================================================================
-- 관리자 계정
-- 사용자 회원(users)과 분리된 관리자 전용 계정. 아이디·비밀번호로 로그인한다.
-- 계정이 생기는 경로는 두 가지다: 최고 관리자가 직접 등록하거나, 가입 신청(admin_account_requests)을 최고 관리자가 승인.
-- 첫 최고 관리자만 서버에서 명령어로 만든다: npm run admin:create -- <아이디> <이름>
--
-- role: SUPER_ADMIN 최고 관리자 (계정 관리·가입 승인 가능), ADMIN 관리자 (상품·브랜드 관리)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_accounts (
    id                      BIGSERIAL PRIMARY KEY,
    login_id                VARCHAR(30) NOT NULL UNIQUE,         -- 소문자로 저장
    name                    VARCHAR(50) NOT NULL,
    password_hash           TEXT NOT NULL,                       -- scrypt
    role                    VARCHAR(20) NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('SUPER_ADMIN', 'ADMIN')),
    -- 임시 비밀번호(등록·초기화 직후)면 TRUE. 비밀번호를 바꾸기 전에는 관리 기능을 쓸 수 없다.
    must_change_password    BOOLEAN NOT NULL DEFAULT TRUE,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    -- 비밀번호 변경·초기화·중지 때 1 올려 기존 로그인 세션을 모두 끊는다.
    session_version         INTEGER NOT NULL DEFAULT 1,
    failed_login_count      INTEGER NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ,
    created_by              BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
