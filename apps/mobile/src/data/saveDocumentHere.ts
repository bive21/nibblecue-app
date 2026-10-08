/**
 * THE ROAD IN `saveDocument.ts`, WITH THIS PHONE'S OWN STEPS IN IT.
 *
 * `saveDocument` is pure so node can walk it; this is the one file that hands it the real print
 * engine (`data/pdf.ts`, reached through its guarded `require`), the real export folder
 * (`data/files.ts`) and the real share sheet. The visit summary, the first year's keepsake and the
 * chosen export all come through here, so a fix to the road is a fix to all three.
 *
 * `expo-sharing`, `expo-file-system` and `react-native` are all in Expo Go, so they are imported the
 * ordinary way (`pnpm check:expo-go` holds that); `expo-print` is not imported at all.
 */
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { keepExportPdf, writeExportFile } from './files';
import { htmlToPdf, openPrintScreen } from './pdf';
import {
  handOver,
  saveDocument,
  type HandOver,
  type SaveDocumentInput,
  type SaveDocumentSteps,
  type SaveOutcome,
} from './saveDocument';

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const shareSteps: Pick<SaveDocumentSteps, 'canShare' | 'share' | 'wait'> = {
  canShare: () => Sharing.isAvailableAsync(),
  share: (uri, options) => Sharing.shareAsync(uri, options),
  wait,
};

/**
 * Make the document with `make`, then take it the whole road. Never rejects: the outcome says
 * what happened, in the phone's own words where something did not work.
 *
 * `canPdf` is the caller's `pdfAvailable()`, the same answer its button was drawn from, so the
 * road cannot promise a PDF the label did not.
 */
export function saveDocumentHere(
  make: () => SaveDocumentInput | Promise<SaveDocumentInput>,
  canPdf: boolean,
): Promise<SaveOutcome> {
  return saveDocument(make, {
    canPdf,
    platform: Platform.OS,
    makePdf: html => htmlToPdf(html),
    keepPdf: keepExportPdf,
    openPrintScreen: html => openPrintScreen(html),
    writePage: writeExportFile,
    ...shareSteps,
  });
}

/**
 * One file straight to the share sheet, the way the road hands its files over: the chosen export's
 * JSON and CSV. Never rejects; a refusal comes back with the phone's words.
 */
export function shareFileHere(
  uri: string,
  type: { mimeType: string; UTI: string },
  dialogTitle: string,
): Promise<HandOver> {
  return handOver(uri, type, dialogTitle, shareSteps);
}
