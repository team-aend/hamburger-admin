-- 사용자 서버(team-aend/hamburger) backend/src/db/schema.sql 사본. 테스트 DB 구성용이며, 원본이 바뀌면 함께 갱신한다.
-- ============================================================================
-- Hamburger Service Database Schema (Supabase / PostgreSQL)
-- Core Hierarchy: Category -> Brand -> Product -> ProductVariant -> Price / Nutrition
-- Recommendation Support: Product <-> Ingredients (Include / Exclude filtering)
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL,
    slug            VARCHAR(50) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brands (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    logo_url        TEXT,
    homepage_url    TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id                  BIGSERIAL PRIMARY KEY,
    brand_id            BIGINT NOT NULL REFERENCES brands(id),
    category_id         BIGINT NOT NULL REFERENCES categories(id),
    name                VARCHAR(150) NOT NULL,
    slug                VARCHAR(200) NOT NULL,
    description         TEXT,
    image_url           TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, DISCONTINUED, UPCOMING, TEMPORARY
    is_limited          BOOLEAN NOT NULL DEFAULT FALSE,
    released_at         DATE,
    discontinued_at     DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (brand_id, slug)
);

CREATE TABLE IF NOT EXISTS product_variants (
    id                  BIGSERIAL PRIMARY KEY,
    product_id          BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,                 -- 단품, 세트, 라지세트
    variant_type        VARCHAR(30) NOT NULL,                  -- SINGLE, SET, LARGE_SET
    size_code           VARCHAR(30),                           -- M, L
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 한 상품당 기본 Variant(is_default = true)는 1개만 허용
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_default_variant
    ON product_variants (product_id)
    WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS product_prices (
    id                  BIGSERIAL PRIMARY KEY,
    product_variant_id  BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    price               INTEGER NOT NULL,
    channel             VARCHAR(30) NOT NULL,                  -- STORE, DELIVERY
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 한 Variant + 채널당 현재 유효 가격(ended_at IS NULL)은 1개만 허용
CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_active_price
    ON product_prices (product_variant_id, channel)
    WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS nutrition (
    id                  BIGSERIAL PRIMARY KEY,
    product_variant_id  BIGINT NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
    serving_size_g      DECIMAL(6, 1),
    calories_kcal       DECIMAL(6, 1) NOT NULL,
    protein_g           DECIMAL(5, 1),
    carbohydrate_g      DECIMAL(5, 1),
    sugar_g             DECIMAL(5, 1),
    fat_g               DECIMAL(5, 1),
    saturated_fat_g     DECIMAL(5, 1),
    sodium_mg           DECIMAL(6, 1),
    basis_note          VARCHAR(150),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingredients (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    slug                VARCHAR(100) NOT NULL UNIQUE,
    ingredient_group    VARCHAR(50) NOT NULL                   -- PATTY, TOPPING, CHEESE_SAUCE
);

CREATE TABLE IF NOT EXISTS product_ingredients (
    product_id          BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id       BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(50) NOT NULL,
    slug                VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS product_tags (
    product_id          BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id              BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);
