/**
 * EVERYTHING NOTICED, NEWEST FIRST: each with its signs, the foods it followed and the onset, and
 * the Health notes written in CuddleCue with no foods beside them, so the list is the whole record
 * a pediatrician asks about.
 */
import { SIGN_LABEL } from '@nibblecue/core/nibble';
import { BodySm, BodyStrong, Card, EmptyState, useTheme } from '@nibblecue/ui';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import { useNibble } from '../../nibble/useNibble';
import { NOTICED } from './copy';
import { NotMedical } from './parts';
import { dayLabel } from './dates';

export function NoticedHistoryScreen() {
  const t = useTheme();
  const v = useNibble();
  const linked = new Set(v.noticedRecords.map(r => r.body.noteId).filter(Boolean));
  const entries = [
    ...v.noticedRecords.map(r => ({
      key: r.id,
      at: r.body.at,
      title: r.body.signs.map(s => SIGN_LABEL[s]).join(', '),
      foods: r.body.foodIds.map(id => v.foodById(id)?.name ?? id).join(', '),
      onset: r.body.onsetMinutes,
      fromCuddle: false,
    })),
    ...v.healthNotes
      .filter(n => !linked.has(n.id))
      .map(n => ({
        key: n.id,
        at: n.start_at,
        title: NOTICED.fromCuddle,
        foods: '',
        onset: null,
        fromCuddle: true,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Screen title={NOTICED.history} testID="noticedhistory">
      <View style={{ gap: t.space.md }}>
        {entries.length === 0 ? (
          <EmptyState icon="note" title={NOTICED.history} body={NOTICED.historyEmpty} />
        ) : (
          entries.map(e => (
            <Card key={e.key} testID={`noticedhistory.${e.key}`}>
              <View style={{ gap: t.space.xs }}>
                <BodyStrong>{e.title}</BodyStrong>
                <BodySm>{`${dayLabel(e.at.slice(0, 10))}, ${new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}</BodySm>
                {e.foods ? <BodySm>{NOTICED.after(e.foods)}</BodySm> : null}
                {e.onset !== null ? <BodySm>{NOTICED.onsetText(e.onset)}</BodySm> : null}
              </View>
            </Card>
          ))
        )}
        <NotMedical />
      </View>
    </Screen>
  );
}
