# 버거픽 관리자

버거픽의 상품·가격·브랜드 데이터를 관리하는 관리자 웹과 관리자 서버입니다. 사용자 서비스(`team-aend/hamburger`)와 **같은 DB를 쓰고, 서버는 따로** 운영합니다.

```text
[관리자 화면 web] ──/api──▶ [관리자 서버 server :4100] ──┐
                                                         ├──▶ Supabase PostgreSQL (하나)
[사용자 사이트 frontend] ──▶ [사용자 서버 backend :4000] ──┘
```

| 폴더 | 내용 | 기술 |
| --- | --- | --- |
| `web/` | 관리자 화면 | Vite, React, TypeScript, Ant Design, TanStack Query |
| `server/` | 관리자 API | Node.js, Express, pg, TypeScript |

## 실행

```bash
npm install

# 1) 화면만 보기: 서버 없이 브라우저 메모리의 목업 데이터로 실행
npm run dev:mock

# 2) 실제 DB 없이 서버까지 실행: 메모리 PostgreSQL + 기본 데이터
#    최고 관리자 admin / burger-admin-2026, 대기 중인 가입 신청 1건
npm run dev:local --workspace=server   # 터미널 1
npm run dev --workspace=web            # 터미널 2

# 3) 실제 DB 에 연결: server/.env 작성 후
npm run db:migrate   # 관리자 전용 테이블 생성 (처음 한 번, 이후 여러 번 실행해도 안전)
npm run dev          # 서버(4100) + 화면(5173)
```

브라우저에서 http://localhost:5173 을 엽니다.

## 처음 설정 (실제 DB)

1. `server/.env.example`을 복사해 `server/.env`를 만들고 값을 채웁니다.
   - `DATABASE_URL`: 사용자 서버와 같은 Supabase 주소
   - `ADMIN_SESSION_SECRET`: 32자 이상. 사용자 서버의 `SESSION_SECRET`과 **다른 값**을 씁니다.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`: 이미지 업로드용. 버킷은 공개(public)로 만듭니다.
2. `npm run db:migrate`로 관리자 전용 테이블(`admin_accounts`, `admin_audit_logs`, `admin_account_requests`)을 만듭니다.
3. 첫 최고 관리자를 서버에서 명령어로 만듭니다. 임시 비밀번호가 한 번 출력되고, 처음 로그인할 때 바꿔야 합니다.

   ```bash
   npm run admin:create --workspace=server -- <아이디> <이름>
   ```

   이후 관리자는 관리자 페이지에서 만듭니다.

## 로그인과 권한

관리자 계정은 사용자 회원(`users`)과 완전히 분리된 **아이디·비밀번호 계정**(`admin_accounts`)입니다. Google 로그인은 쓰지 않습니다.

| 권한 | 할 수 있는 일 |
| --- | --- |
| 최고 관리자 (`SUPER_ADMIN`) | 관리자의 모든 일 + 관리자 계정 등록·중지·권한 변경·비밀번호 초기화, 가입 신청 승인·반려 |
| 관리자 (`ADMIN`) | 대시보드, 상품·매장가·브랜드 관리 |

**계정이 생기는 경로**
1. **가입 신청**: 로그인 화면의 "관리자 가입 신청"에서 아이디·이름·비밀번호·신청 사유를 보냅니다. 최고 관리자가 승인하면 신청할 때 정한 비밀번호로 바로 로그인합니다. 승인 전이나 반려 후에 로그인하면 "검토 중" 또는 반려 사유를 안내합니다(비밀번호가 맞을 때만).
2. **직접 등록**: 최고 관리자가 "관리자 계정" 화면에서 등록합니다. 서버가 임시 비밀번호를 만들어 한 번만 보여주고, 받은 사람은 처음 로그인할 때 바꿔야 합니다.

**보안 규칙**
- 비밀번호는 10~72자이고 영문과 숫자를 모두 넣어야 합니다. 아이디는 넣을 수 없습니다. 저장은 scrypt 해시로만 합니다.
- 5번 연속 틀리면 15분 동안 잠깁니다. 없는 아이디와 틀린 비밀번호는 같은 메시지를 보여줍니다.
- 세션 쿠키는 `bpa_session`(12시간)으로, 사용자 서버의 쿠키와 따로 씁니다. 비밀번호 변경·초기화나 계정 중지가 일어나면 그 계정의 기존 로그인이 모두 끊깁니다.
- 임시 비밀번호 상태에서는 비밀번호를 바꾸기 전까지 관리 기능을 쓸 수 없습니다.
- 자기 계정은 중지·권한 변경·초기화할 수 없습니다. 그래서 최고 관리자가 0명이 되지 않습니다.
- 가입 신청은 같은 IP에서 1시간에 5번까지만 받고, 대기 중인 신청이 50건이면 더 받지 않습니다.
- 모든 `/api/admin/*` 요청은 서버에서 매번 계정 상태와 권한을 확인합니다. 쓰기 요청은 관리자 화면 주소(`ADMIN_PUBLIC_ORIGIN`)에서 온 것만 받습니다.

## DB 원칙

- **사용자 서버의 테이블 구조는 바꾸지 않습니다.** 관리자 서버는 `admin_*` 테이블만 만들고, 마이그레이션은 `server/migrations/`에서 관리합니다.
- 상품·가격·브랜드 데이터는 사용자 서버와 같은 테이블에 씁니다. 관련 제약은 그대로 지킵니다.
  - **매장가 변경**: 한 트랜잭션에서 현재 행에 `ended_at`을 찍은 뒤 새 행을 추가합니다(`uq_variant_active_price`). 종료 시각과 새 시작 시각이 같아서 이력이 끊기지 않습니다.
  - **기본 구성 변경**: 기존 기본 구성을 먼저 해제한 뒤 저장합니다(`uq_product_default_variant`).
  - **영양 정보**: 브랜드가 제공하지 않으면 `nutrition` 행을 만들지 않습니다. 0으로 채우지 않습니다.
- 모든 변경은 같은 트랜잭션에서 `admin_audit_logs`에 기록합니다. 누가, 무엇을, 변경 전·후 값, 사유를 남깁니다.

## 알아둘 점

- **사용자 사이트 반영 지연**: 사용자 서버는 상품 데이터를 메모리에 10분간 캐시합니다(`datasetCache`). 관리자에서 바꾼 내용은 최대 10분 뒤에 사용자 사이트에 보입니다. 바로 반영하려면 사용자 서버에 캐시 새로 고침 API를 추가해야 합니다.
- **사용자 서버와 맞춰야 하는 규칙**: 월드컵 참가 기준(햄버거 카테고리, 판매 중, 브랜드 사용 중)과 강수(8, 16)는 사용자 서버 코드와 같아야 합니다. `server/src/brands/brands.ts`의 주석에 원본 위치를 적어 두었습니다.
- **테스트 스키마**: `server/tests/fixtures/`의 스키마는 사용자 서버 `schema.sql`의 사본입니다. 원본이 바뀌면 함께 갱신합니다.

## API

요청·응답 타입은 `web/src/api/types.ts`에 있습니다. ID는 문자열이고, 가격은 매장가(`STORE`)만 다룹니다. 오류 응답은 `{ code, message }` 형식입니다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/auth/me` | 현재 관리자 (아니면 `user: null`) |
| POST | `/api/auth/login` | 로그인 `{ loginId, password }` |
| POST | `/api/auth/password` | 비밀번호 변경 `{ currentPassword, newPassword }` |
| POST | `/api/auth/logout` | 로그아웃 |
| POST | `/api/auth/account-requests` | 가입 신청 (로그인 없이) `{ loginId, name, password, message }` |
| GET | `/api/admin/accounts` | 관리자 계정 목록 **(최고 관리자)** |
| POST | `/api/admin/accounts` | 직접 등록 `{ loginId, name, role }` → 임시 비밀번호 **(최고 관리자)** |
| PATCH | `/api/admin/accounts/:id/active` | 사용·중지 **(최고 관리자)** |
| PATCH | `/api/admin/accounts/:id/role` | 권한 변경 `{ role }` **(최고 관리자)** |
| POST | `/api/admin/accounts/:id/reset-password` | 비밀번호 초기화 → 임시 비밀번호 **(최고 관리자)** |
| GET | `/api/admin/account-requests` | 가입 신청 목록 (`status`) **(최고 관리자)** |
| POST | `/api/admin/account-requests/:id/approve` | 승인 `{ role }` **(최고 관리자)** |
| POST | `/api/admin/account-requests/:id/reject` | 반려 `{ reason }` **(최고 관리자)** |
| GET | `/api/admin/dashboard` | 상품 수, 품질 경고, 최근 가격 변경 |
| GET | `/api/admin/meta` | 브랜드·카테고리·재료·태그 선택지 |
| GET | `/api/admin/products` | 목록 (`q`, `brandId`, `status`, `page`, `pageSize`) |
| GET | `/api/admin/products/:id` | 상세 |
| POST | `/api/admin/products` | 등록 |
| PUT | `/api/admin/products/:id` | 수정 |
| POST | `/api/admin/products/:id/image` | 이미지 업로드 (JPG·PNG·WebP, 5MB) |
| GET | `/api/admin/products/:id/prices` | 매장가 이력 |
| POST | `/api/admin/variants/:variantId/prices` | 매장가 변경 `{ price, reason }` |
| GET | `/api/admin/brands` | 브랜드 목록과 상품 수 |
| POST | `/api/admin/brands` | 브랜드 등록 |
| PUT | `/api/admin/brands/:id` | 브랜드 수정 |
| GET | `/api/admin/brands/:id/deactivation-impact` | 중지했을 때의 영향 범위 |
| PATCH | `/api/admin/brands/:id/active` | 사용·중지 `{ isActive, reason }` |
| POST | `/api/admin/brands/:id/logo` | 로고 업로드 (PNG·WebP·JPG, 2MB) |

## 테스트

```bash
npm test
```

메모리 PostgreSQL(PGlite)에 사용자 서버 스키마와 관리자 마이그레이션을 올려 HTTP 단위로 검증합니다. 확인하는 범위는 로그인·잠금, 가입 신청·승인, 권한, 가격 이력, 제약 조건, 변경 기록입니다. 운영 DB는 쓰지 않습니다.

## 배포

`npm run build` 후 `NODE_ENV=production npm start`로 실행하면, 관리자 서버가 `web/dist`도 함께 제공합니다. 화면과 API가 같은 주소를 쓰므로 CORS 설정이 필요 없습니다. 운영에서는 `ADMIN_PUBLIC_ORIGIN`을 운영 주소로 바꿉니다.
