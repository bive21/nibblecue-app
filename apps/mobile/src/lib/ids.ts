import { randomUUID } from 'expo-crypto';

/** Client-generated ids and idempotency keys (CLAUDE.md rule 7): v4 UUIDs from the OS CSPRNG. */
export const newId = (): string => randomUUID();
