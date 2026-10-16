import crypto from 'node:crypto';
import type { StorageConfig } from '../config.js';
import { badRequest } from '../http/errors.js';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** 상품 이미지·브랜드 로고 저장소 */
export interface ImageStorage {
  /** 저장하고 공개 URL 을 돌려준다. */
  upload(folder: string, file: UploadedFile): Promise<string>;
  /** 이 저장소가 만든 URL 이면 지운다. 실패해도 오류를 내지 않는다. (교체 후 정리용) */
  removeByUrl(url: string | null): Promise<void>;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function checkImage(file: UploadedFile | undefined, allowed: string[], maxBytes: number): UploadedFile {
  if (!file) throw badRequest('FILE_REQUIRED', '이미지 파일을 첨부해 주세요.');
  if (!allowed.includes(file.mimetype)) {
    throw badRequest('INVALID_FILE_TYPE', `${allowed.map((t) => EXTENSIONS[t]?.toUpperCase()).join(', ')} 이미지만 올릴 수 있습니다.`);
  }
  if (file.size > maxBytes) {
    throw badRequest('FILE_TOO_LARGE', `${Math.round(maxBytes / 1024 / 1024)}MB 이하 이미지만 올릴 수 있습니다.`);
  }
  return file;
}

/** Supabase Storage REST API. 서비스 키는 서버에만 있다. 버킷은 공개(public) 버킷이어야 한다. */
export function createSupabaseStorage(config: StorageConfig): ImageStorage {
  const objectUrl = (key: string) => `${config.supabaseUrl}/storage/v1/object/${config.bucket}/${key}`;
  const publicPrefix = `${config.supabaseUrl}/storage/v1/object/public/${config.bucket}/`;
  const headers = { Authorization: `Bearer ${config.serviceRoleKey}`, apikey: config.serviceRoleKey };

  return {
    async upload(folder, file) {
      const key = `${folder}/${crypto.randomUUID()}.${EXTENSIONS[file.mimetype] ?? 'bin'}`;
      const res = await fetch(objectUrl(key), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': file.mimetype, 'Cache-Control': 'max-age=31536000' },
        body: new Uint8Array(file.buffer),
      });
      if (!res.ok) throw new Error(`이미지 저장 실패 (${res.status})`);
      return publicPrefix + key;
    },

    async removeByUrl(url) {
      if (!url?.startsWith(publicPrefix)) return;
      const key = url.slice(publicPrefix.length);
      await fetch(objectUrl(key), { method: 'DELETE', headers }).catch(() => undefined);
    },
  };
}

/** 저장소 설정이 없을 때: 업로드 요청에 설정 안내 오류를 준다. */
export const unconfiguredStorage: ImageStorage = {
  upload: async () => {
    throw badRequest('STORAGE_NOT_CONFIGURED', '이미지 저장소가 설정되지 않았습니다. server/.env 의 SUPABASE_* 값을 확인해 주세요.');
  },
  removeByUrl: async () => undefined,
};
