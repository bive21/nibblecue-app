/**
 * The free full download (PRODUCT_SPEC.md §8; CLAUDE.md §4 "the bill of rights").
 *
 * ONE BUTTON IN SETTINGS OPENS THIS, and this is where the two formats live, because they are
 * two audiences rather than two features: JSON is the portability copy the law names, CSV is the
 * one a person can open in a spreadsheet. Both contain everything, on every plan, and the sheet
 * says how much is in them before either is shared — a file that silently came out empty is the
 * worst possible outcome for a screen whose whole job is trust.
 *
 * IT IS BUILT ON THE DEVICE, from the local mirror (`data/download.ts` says why at length): no
 * network, no signed URL, no account lookup. It works on a plane and it cannot be gated by a
 * server being down.
 *
 * The share sheet is the OS's, so where the file goes is the person's choice and the app never
 * sees it. On a device with no share target the URI is shown instead, rather than a dead button.
 *
 * WHAT HAPPENED IS SAID IN THE SHEET, under the buttons, never in a toast (2026-09-28, the same
 * fault the chosen export had): this sheet is a Modal, and a toast is drawn in the app's own window
 * underneath it, where nobody could read it. A share goes the way `data/saveDocument.ts` hands its
 * files over, so a refusal comes back in the phone's own words and a share sheet whose promise
 * never settles cannot keep both buttons disabled for good.
 */
import { BodySm, BottomSheet, Button, Row, Rows, useTheme } from '@nibblecue/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { buildDownload, type DownloadFiles } from '../../data/download';
import { writeExportFile } from '../../data/files';
import { phoneSaid } from '../../data/phoneSaid';
import { shareFileHere } from '../../data/saveDocumentHere';
import { openLocalDb } from '../../db';
import { useUnits } from '../quick/prefs';
import { useTimeZone } from '../quick/prefs';
import { DOWNLOAD } from './copy';

export interface DownloadSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function DownloadSheet({ visible, onClose }: DownloadSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { account } = useAuth();
  const units = useUnits();
  const timeZone = useTimeZone();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const heardFrom = account?.memberships[0]?.heard_from ?? null;

  const [files, setFiles] = useState<DownloadFiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** What the last share did when it was not the plain road, said here rather than in a toast. */
  const [said, setSaid] = useState<string | null>(null);

  // built when the sheet opens, not on mount: §8's rule is that a report never loads history on
  // app start, and this loads considerably more than a report
  useEffect(() => {
    if (!visible || householdId === null) return;
    let live = true;
    setError(null);
    setFiles(null);
    // a new opening starts clean: the last visit's line was about the last visit's file
    setSaid(null);
    void openLocalDb()
      .then(db =>
        buildDownload(db, {
          householdId,
          timeZone,
          unit: units.volume,
          generatedAt: new Date().toISOString(),
          ...(heardFrom ? { heardFrom } : {}),
        }),
      )
      .then(built => {
        if (live) setFiles(built);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : DOWNLOAD.failed);
      });
    return () => {
      live = false;
    };
  }, [visible, householdId, timeZone, units.volume, heardFrom]);

  const share = (kind: 'json' | 'csv') => async () => {
    if (files === null || busy) return;
    setBusy(true);
    setSaid(null);
    try {
      const name = kind === 'json' ? files.jsonName : files.csvName;
      const uri = writeExportFile(name, kind === 'json' ? files.json : files.csv);
      const sent = await shareFileHere(
        uri,
        kind === 'json'
          ? { mimeType: 'application/json', UTI: 'public.json' }
          : { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' },
        DOWNLOAD.dialogTitle,
      );
      if (!sent.ok) setSaid(DOWNLOAD.shareFailed(sent.detail));
      else if (sent.kind === 'savedTo') setSaid(DOWNLOAD.savedTo(uri));
    } catch (err) {
      // the file itself could not be written: the phone's words, in the sheet
      setSaid(DOWNLOAD.shareFailed(phoneSaid(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={DOWNLOAD.title}
      onClose={onClose}
      detent="content"
      bottomInset={insets.bottom}
      testID="download"
    >
      <View style={{ gap: t.space.lg }}>
        <BodySm>{DOWNLOAD.lede}</BodySm>

        {error !== null ? (
          <BodySm
            ink="crit"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="download.error"
          >
            {error}
          </BodySm>
        ) : files === null ? (
          <BodySm ink="text2" testID="download.building">
            {DOWNLOAD.building}
          </BodySm>
        ) : (
          <>
            <Rows>
              <Row
                title={DOWNLOAD.counts}
                value={DOWNLOAD.countsValue(files.rows, files.activities)}
                right="none"
                testID="download.counts"
              />
            </Rows>
            <View style={{ gap: t.space.sm }}>
              <Button
                label={DOWNLOAD.shareJson}
                icon="export"
                onPress={() => void share('json')()}
                disabled={busy}
                testID="download.json"
              />
              <Button
                label={DOWNLOAD.shareCsv}
                variant="secondary"
                icon="export"
                onPress={() => void share('csv')()}
                disabled={busy}
                testID="download.csv"
              />
            </View>
            {/* WHAT THE LAST SHARE DID, when it was not the plain road, in the phone's own words */}
            {said === null ? null : <BodySm testID="download.result">{said}</BodySm>}
            <BodySm testID="download.note">{DOWNLOAD.note}</BodySm>
          </>
        )}
      </View>
    </BottomSheet>
  );
}
