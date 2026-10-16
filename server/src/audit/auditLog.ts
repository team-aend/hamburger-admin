import type { Queryable } from '../db/database.js';

export type AuditAction =
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'PRODUCT_IMAGE'
  | 'PRICE_CHANGE'
  | 'BRAND_CREATE'
  | 'BRAND_UPDATE'
  | 'BRAND_ACTIVATE'
  | 'BRAND_DEACTIVATE'
  | 'BRAND_LOGO'
  | 'ADMIN_CREATE'
  | 'ADMIN_ACTIVATE'
  | 'ADMIN_DEACTIVATE'
  | 'ADMIN_PASSWORD_RESET'
  | 'ADMIN_PASSWORD_CHANGE'
  | 'ADMIN_ROLE_CHANGE'
  | 'ADMIN_REQUEST_APPROVE'
  | 'ADMIN_REQUEST_REJECT';

export interface AuditEntry {
  adminId: string;
  action: AuditAction;
  targetType: 'PRODUCT' | 'VARIANT' | 'BRAND' | 'ADMIN_ACCOUNT' | 'ADMIN_ACCOUNT_REQUEST';
  targetId: string;
  before: unknown;
  after: unknown;
  reason?: string | null;
}

/** 변경과 같은 트랜잭션에서 남긴다. 기록이 실패하면 변경도 되돌린다. */
export async function recordAudit(tx: Queryable, entry: AuditEntry): Promise<void> {
  await tx.query(
    `INSERT INTO admin_audit_logs (admin_account_id, action, target_type, target_id, before_data, after_data, reason)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
    [
      entry.adminId,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.before == null ? null : JSON.stringify(entry.before),
      entry.after == null ? null : JSON.stringify(entry.after),
      entry.reason?.trim() || null,
    ],
  );
}
