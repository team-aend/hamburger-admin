import { createApp } from './app.js';
import { SessionCodec } from './auth/session.js';
import { loadEnvironment, readConfig } from './config.js';
import { createPgDatabase } from './db/database.js';
import { createSupabaseStorage, unconfiguredStorage } from './storage/imageStorage.js';

loadEnvironment();
const config = readConfig();

if (!config.databaseUrl) {
  console.error('❌ DATABASE_URL 이 설정되지 않았습니다. server/.env.example 을 참고해 server/.env 를 만들어 주세요.');
  process.exit(1);
}
if (!config.sessionSecret) {
  console.warn('⚠️ ADMIN_SESSION_SECRET 이 없거나 32자 미만이라 로그인할 수 없습니다.');
}

const app = createApp({
  db: createPgDatabase(config.databaseUrl),
  sessions: config.sessionSecret ? new SessionCodec(config.sessionSecret, config.isProduction) : null,
  storage: config.storage ? createSupabaseStorage(config.storage) : unconfiguredStorage,
  publicOrigin: config.publicOrigin,
  webDistDir: config.webDistDir,
});

app.listen(config.port, () => {
  console.log(`🛠️  관리자 서버: http://localhost:${config.port}`);
  console.log(`   이미지 저장소: ${config.storage ? `Supabase (${config.storage.bucket})` : '미설정'}`);
});
