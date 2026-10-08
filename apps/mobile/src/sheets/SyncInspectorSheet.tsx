/**
 * The Sync inspector (`docs/MOBILE.md` §13): "a debug-only 'Sync inspector' screen (behind a
 * dev flag) lists outbox rows, states, attempts and last errors — the same data the sync chip
 * summarizes."
 *
 * It is a DEVELOPER surface, not a parent-facing one. It is mounted only under the same guard
 * as the other dev rows in More (`mock && env.stage !== 'production' && session`), it shows raw
 * enum values and ids because that is what makes a queue debuggable, and its labels are
 * therefore developer labels rather than product copy — parent-facing sync copy lives in
 * `../sync/copy.ts` and lands with the failure banner in WP4.9, which is a different surface
 * with a different reader.
 *
 * The three dev write rows call the REAL repository — the same `commitWrite`, the same chain
 * builders, the same dedupe guard the app uses. A dev button that inserted rows directly would
 * prove the inspector renders and nothing else; this way "log a 120 ml bottle from the stash"
 * on a phone in airplane mode is the same code path the acceptance matrix runs in node.
 *
 * IT BUILDS NOTHING OF ITS OWN (WP4.9). It reads `syncRuntime()`, the handle `SyncProvider`
 * registers for the app's single engine. Before WP4.9 this file memoized a worker of its own
 * because there was nothing else to hold one; a second worker over one `outbox` would be a
 * second writer claiming the same rows into SENDING, which is why that memo had to go the
 * moment a real provider existed.
 */
import {
  BodySm,
  BottomSheet,
  Button,
  Meta,
  Row,
  Rows,
  SectionHeader,
  useTheme,
} from '@nibblecue/ui';
import type { OutboxRow } from '@nibblecue/core';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { openLocalDb } from '../db';
import type { Db } from '../db/driver';
import { logActivity } from '../data/activities';
import { deviceId, newEntityId, newIntentId } from '../data/ids';
import { counts, recent, retry, discard, type OutboxCounts } from '../data/outbox';
import { systemClock } from '../data/repository';
import { logBottleFromStash } from '../data/stash';
import { startTimer } from '../data/timers';
import { syncRuntime, type SyncRuntime } from '../sync/status';
import { useToast } from '../ui/toast';

export interface SyncInspectorSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface CursorRow {
  household_id: string;
  table_name: string;
  cursor_updated_at: string | null;
  cursor_id: string | null;
  phase: string | null;
}

const EMPTY_COUNTS: OutboxCounts = { pending: 0, sending: 0, synced: 0, failed: 0, unsent: 0 };

/** What a dev row is handed: the same four values every capture path in the app takes. */
interface DevWriteContext {
  db: Db;
  householdId: string;
  createdBy: string;
  deviceId: string | null;
}

export function SyncInspectorSheet({ visible, onClose }: SyncInspectorSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { account, session } = useAuth();
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [cursors, setCursors] = useState<CursorRow[]>([]);
  const [totals, setTotals] = useState<OutboxCounts>(EMPTY_COUNTS);
  const [serverRows, setServerRows] = useState<number | null>(null);
  const [notifs, setNotifs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const householdId = account?.memberships[0]?.household_id ?? null;
  const userId = session?.user.id ?? null;
  const childId = account?.children[0]?.id ?? null;

  const load = useCallback(async () => {
    try {
      const db = await openLocalDb();
      setRows(await recent(db, 100));
      setTotals(await counts(db));
      setCursors(
        await db.all<CursorRow>(
          'select household_id, table_name, cursor_updated_at, cursor_id, phase from sync_state order by table_name',
          [],
        ),
      );
      // The fake server can be counted; a real project cannot, from here, and says so.
      const mock = syncRuntime()?.mock ?? null;
      setServerRows(mock === null ? null : mock.rowCount('activities'));
      // the phone's own pending requests of ours (WP7): what e2e/04 and e2e/05 read
      try {
        // NibbleCue schedules no reminders on the phone yet: the list is honestly empty
        setNotifs([]);
      } catch {
        setNotifs([]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the local database did not open');
    }
    // no dependencies: nothing here reads a prop or a state value — it opens the local database
    // and reads what is in it. Listing the ids (which it does not use) rebuilt `load` on every
    // render of the auth context, and the effect below re-ran with it.
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  /** Anything that drives the app's engine or the fake server, then re-reads the queue. */
  const drive = useCallback(
    async (label: string, run: (sync: SyncRuntime) => Promise<unknown> | unknown) => {
      const runtime = syncRuntime();
      if (runtime === null) {
        toast.show('the sync engine is not running on this session');
        return;
      }
      try {
        await run(runtime);
        await load();
        toast.show(label);
      } catch (err) {
        toast.show(err instanceof Error ? err.message : 'that did not work');
      }
    },
    [load, toast],
  );

  const write = useCallback(
    async (label: string, run: (ctx: DevWriteContext) => Promise<unknown>) => {
      if (householdId === null || userId === null) {
        toast.show('no household on this session');
        return;
      }
      try {
        const db = await openLocalDb();
        // the same per-install id every real write carries, so the dev rows are not a
        // special case of the write path they exist to demonstrate
        await run({ db, householdId, createdBy: userId, deviceId: await deviceId(db) });
        await load();
        toast.show(label);
      } catch (err) {
        toast.show(err instanceof Error ? err.message : 'the write failed');
      }
    },
    [householdId, userId, load, toast],
  );

  return (
    <BottomSheet
      visible={visible}
      title="Sync inspector"
      onClose={onClose}
      bottomInset={insets.bottom}
      testID="sync.inspector"
    >
      <ScrollView style={{ maxHeight: 560 }}>
        <View style={{ gap: t.space.lg }}>
          <Meta testID="sync.inspector.summary">
            {`${totals.pending} pending · ${totals.sending} sending · ${totals.failed} failed · ${totals.synced} synced`}
          </Meta>
          <Meta testID="sync.inspector.server">
            {serverRows === null
              ? 'server rows: only the mock can be counted from here'
              : `server activity rows: ${serverRows}`}
          </Meta>
          <Meta testID="sync.inspector.notifications">{`local notifications: ${notifs.length}`}</Meta>
          {notifs.slice(0, 6).map(id => (
            <Meta key={id}>{id}</Meta>
          ))}
          {error !== null ? (
            <BodySm ink="crit" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </BodySm>
          ) : null}

          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            <Button
              label="Sync now"
              size="sm"
              testID="sync.inspector.flush"
              onPress={() =>
                void drive('synced', async runtime => {
                  await runtime.flush('manual');
                  // Then the read half, unconditionally: with an empty queue there is nothing
                  // for `pullAfterPush` to fold back, and the whole point of the button is to
                  // see the other caregiver's row arrive.
                  return runtime.pullNow();
                })
              }
            />
          </View>

          <SectionHeader title="Make the server misbehave" />
          <Rows>
            <Row
              title="Drop the next response"
              detail="the ops are applied and the answer never arrives — the replay must be a duplicate"
              testID="sync.inspector.drop"
              onPress={() =>
                void drive('the next answer will be lost', ({ mock }) => {
                  if (mock === null)
                    throw new Error('only the mock server can be told to misbehave');
                  mock.dropNextResponse();
                })
              }
            />
            <Row
              title="Reject the next op"
              detail="one CONFLICT: the op backs off and the entry stays exactly where it is"
              testID="sync.inspector.reject"
              onPress={() =>
                void drive('the next op will be refused', ({ mock }) => {
                  if (mock === null)
                    throw new Error('only the mock server can be told to misbehave');
                  mock.rejectNextWith('CONFLICT', 'refused from the sync inspector');
                })
              }
            />
            <Row
              title="Another caregiver logs a diaper"
              detail="a row appears on the server that this device has never seen"
              testID="sync.inspector.other"
              onPress={() =>
                void drive('the other phone logged a diaper', ({ mock }) => {
                  if (mock === null) throw new Error('only the mock server has another caregiver');
                  if (householdId === null || userId === null) throw new Error('no household');
                  const at = systemClock.iso();
                  mock.insertAsOtherDevice('activities', {
                    id: newEntityId(),
                    client_op_id: newIntentId(),
                    household_id: householdId,
                    child_id: childId,
                    type: 'diaper',
                    start_at: at,
                    metadata: {},
                    created_by: userId,
                    deleted_at: null,
                  });
                })
              }
            />
          </Rows>

          <SectionHeader title="Write something" />
          <Rows>
            <Row
              title="Log a 120 ml bottle from the stash"
              detail="activity CREATE, then milk_txn CREATE that depends on it"
              testID="sync.inspector.dev.bottle"
              onPress={() =>
                void write('bottle queued', ctx =>
                  logBottleFromStash(ctx.db, systemClock, {
                    ...ctx,
                    source: 'dev',
                    childId,
                    startAt: systemClock.iso(),
                    consumedMl: 120,
                  }),
                )
              }
            />
            <Row
              title="Log a wet diaper"
              detail="one activity CREATE with its detail embedded"
              testID="sync.inspector.dev.diaper"
              onPress={() =>
                void write('diaper queued', ctx =>
                  logActivity(ctx.db, systemClock, {
                    ...ctx,
                    source: 'dev',
                    childId,
                    type: 'diaper',
                    startAt: systemClock.iso(),
                    detail: { kind: 'WET' },
                  }),
                )
              }
            />
            <Row
              title="Start a sleep timer"
              detail="one timer CREATE; the row is the timer"
              testID="sync.inspector.dev.timer"
              onPress={() =>
                void write('timer queued', ctx =>
                  startTimer(ctx.db, systemClock, {
                    ...ctx,
                    source: 'dev',
                    childId,
                    type: 'sleep',
                    startedAt: systemClock.iso(),
                  }),
                )
              }
            />
          </Rows>

          <SectionHeader title="Outbox" />
          {rows.length === 0 ? (
            <Meta>Nothing queued.</Meta>
          ) : (
            <Rows>
              {rows.map(row => (
                <Row
                  key={row.client_op_id}
                  title={`${row.seq}  ${row.entity} ${row.op}`}
                  detail={detailLine(row)}
                  value={row.state}
                  right={
                    row.state === 'FAILED' ? (
                      <View style={{ flexDirection: 'row', gap: t.space.sm }}>
                        <Button
                          label="Retry"
                          variant="secondary"
                          size="sm"
                          onPress={() =>
                            void write('retrying', async ({ db }) => {
                              await db.tx(tx => retry(tx, row.client_op_id));
                            })
                          }
                        />
                        <Button
                          label="Discard"
                          variant="secondary"
                          size="sm"
                          onPress={() =>
                            void write('operation discarded, the entry is kept', async ({ db }) => {
                              await db.tx(tx => discard(tx, row.client_op_id));
                            })
                          }
                        />
                      </View>
                    ) : (
                      'none'
                    )
                  }
                  testID={`sync.inspector.row.${row.client_op_id}`}
                />
              ))}
            </Rows>
          )}

          <SectionHeader title="Cursors" />
          {cursors.length === 0 ? (
            <Meta>No table has been pulled yet.</Meta>
          ) : (
            <Rows>
              {cursors.map(cursor => (
                <Row
                  key={`${cursor.household_id}:${cursor.table_name}`}
                  title={cursor.table_name}
                  detail={cursor.phase ?? 'no phase'}
                  value={cursor.cursor_updated_at ?? 'never'}
                  right="none"
                  testID={`sync.inspector.cursor.${cursor.table_name}`}
                />
              ))}
            </Rows>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

/** Everything §13 asks a row to show that does not fit the title or the value slot. */
function detailLine(row: OutboxRow): string {
  const parts = [`attempts ${row.attempts}`];
  if (row.depends_on !== null) parts.push(`after ${row.depends_on.slice(0, 8)}`);
  if (row.last_error !== null) parts.push(row.last_error);
  return parts.join(' · ');
}
