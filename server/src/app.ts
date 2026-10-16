import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { checkOrigin, createAuthRouter, requireAdmin, requireSuperAdmin } from './auth/routes.js';
import type { SessionCodec } from './auth/session.js';
import { createAccountRouter, createAccountService } from './accounts/accounts.js';
import { createBrandRouter, createBrandService } from './brands/brands.js';
import { createDashboardRouter } from './dashboard/dashboard.js';
import type { Database } from './db/database.js';
import { errorHandler } from './http/errors.js';
import { createProductRouter } from './products/routes.js';
import { createProductService } from './products/service.js';
import type { ImageStorage } from './storage/imageStorage.js';

export interface AppDeps {
  db: Database;
  sessions: SessionCodec | null;
  storage: ImageStorage;
  publicOrigin: string;
  webDistDir?: string | null;
  now?: () => Date;
}

/** 구체 구현을 조립한다. 테스트는 같은 함수에 PGlite 와 가짜 저장소를 넣는다. */
export function createApp(deps: AppDeps): Express {
  const now = deps.now ?? (() => new Date());
  const auth = { db: deps.db, sessions: deps.sessions, now };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'hamburger-admin-server' });
  });
  app.use('/api', checkOrigin(deps.publicOrigin));
  app.use('/api/auth', createAuthRouter(auth));

  const admin = express.Router();
  admin.use(requireAdmin(auth));
  admin.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  admin.use(createDashboardRouter(deps.db));
  admin.use(createProductRouter(createProductService({ db: deps.db, storage: deps.storage, now })));
  admin.use(createBrandRouter(createBrandService({ db: deps.db, storage: deps.storage, now })));
  // 계정 관리·가입 승인은 최고 관리자만
  admin.use(['/accounts', '/account-requests'], requireSuperAdmin);
  admin.use(createAccountRouter(createAccountService({ db: deps.db, now })));
  app.use('/api/admin', admin);

  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: '존재하지 않는 API 입니다.' });
  });

  // 운영: 관리자 화면(web/dist)을 같은 출처로 제공한다. 쿠키·CORS 설정이 필요 없다.
  if (deps.webDistDir && fs.existsSync(deps.webDistDir)) {
    app.use(express.static(deps.webDistDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(deps.webDistDir!, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
