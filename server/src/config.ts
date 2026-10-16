import path from 'node:path';
import dotenv from 'dotenv';

/** server/.env 를 읽는다. 이미 설정된 환경 변수가 우선한다. */
export function loadEnvironment(directory = path.resolve(import.meta.dirname, '..')): void {
  dotenv.config({ path: path.join(directory, '.env'), quiet: true });
}

export interface StorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
}

export interface Config {
  port: number;
  isProduction: boolean;
  databaseUrl: string | null;
  /** 관리자 화면 주소 (쓰기 요청의 Origin 검사) */
  publicOrigin: string;
  sessionSecret: string | null;
  storage: StorageConfig | null;
  /** 운영에서 관리자 화면 빌드 결과(web/dist)를 같은 서버로 제공한다. */
  webDistDir: string | null;
}

const value = (env: NodeJS.ProcessEnv, key: string) => {
  const v = env[key]?.trim();
  return v ? v : null;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  const databaseUrl = value(env, 'DATABASE_URL');
  const sessionSecret = value(env, 'ADMIN_SESSION_SECRET');

  const supabaseUrl = value(env, 'SUPABASE_URL');
  const serviceRoleKey = value(env, 'SUPABASE_SERVICE_ROLE_KEY');

  return {
    port: Number(env.PORT) || 4100,
    isProduction,
    databaseUrl: databaseUrl && !databaseUrl.includes('[YOUR-PASSWORD]') ? databaseUrl : null,
    publicOrigin: value(env, 'ADMIN_PUBLIC_ORIGIN') ?? 'http://localhost:5173',
    sessionSecret: sessionSecret && sessionSecret.length >= 32 ? sessionSecret : null,
    storage:
      supabaseUrl && serviceRoleKey
        ? { supabaseUrl: supabaseUrl.replace(/\/$/, ''), serviceRoleKey, bucket: value(env, 'SUPABASE_STORAGE_BUCKET') ?? 'catalog' }
        : null,
    webDistDir: value(env, 'ADMIN_WEB_DIST') ?? (isProduction ? path.resolve(import.meta.dirname, '../../web/dist') : null),
  };
}
