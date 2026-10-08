/**
 * The local database schema. It lives in `@nibblecue/core` since 2026-09-23
 * (`packages/core/src/sync/local/schema.ts`), beside the apply engine and the cursor, so that
 * `packages/db`'s round-trip test builds a device's mirror from this exact schema instead of a
 * copy. This file keeps the app's imports where they were.
 */
export {
  LOCAL_DB_NAME,
  LOCAL_ONLY_TABLES,
  LOCAL_OUTBOX_ADDITIONS,
  LOCAL_PROFILE_PICTURE,
  LOCAL_READ_INDEXES,
  LOCAL_SCHEMA_V1,
  LOCAL_SCHEMA_V2,
  LOCAL_SCHEMA_V3,
  LOCAL_SCHEMA_V4,
  LOCAL_SCHEMA_V5,
  LOCAL_SCHEMA_V6,
  LOCAL_SCHEMA_V7,
  LOCAL_SCHEMA_V8,
  LOCAL_SCHEMA_V9,
  LOCAL_SCHEMA_V10,
  LOCAL_SCHEMA_V11,
  LOCAL_SCHEMA_V12,
  LOCAL_SCHEMA_V13,
  LOCAL_SCHEMA_V14,
  LOCAL_SCHEMA_V15,
  LOCAL_SCHEMA_V16,
  LOCAL_SCHEMA_V17,
  LOCAL_SCHEMA_V18,
  LOCAL_SCHEMA_V19,
  LOCAL_SCHEMA_V20,
  LOCAL_SCHEMA_V21,
  LOCAL_SCHEMA_V22,
  LOCAL_SCHEMA_VERSION,
  LOCAL_WELLBEING_DETAILS,
  LocalSchemaTooNewError,
  MIRRORED_TABLES,
  migrateLocalDb,
  OUTBOX_COLUMNS,
  PROFILE_PICTURE_REPULL,
  PULL_STRATEGY,
  relaxNotNull,
} from '@nibblecue/core';
export type { SqlRunner, TableColumn } from '@nibblecue/core';
