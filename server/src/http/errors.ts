import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

/** 화면에 그대로 보여줄 수 있는 오류. 응답은 { code, message } */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);

/** async 핸들러의 오류를 오류 처리 미들웨어로 넘긴다. (Express 4) */
export function handle(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ code: 'INVALID_JSON', message: '요청 형식이 올바르지 않습니다.' });
    return;
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ code: 'FILE_TOO_LARGE', message: '파일이 너무 큽니다.' });
    return;
  }
  // DB 오류에는 접속 정보가 들어 있을 수 있어 메시지만 남긴다.
  console.error('❌ 처리하지 못한 오류:', error instanceof Error ? error.message : error);
  res.status(500).json({ code: 'INTERNAL', message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
};
