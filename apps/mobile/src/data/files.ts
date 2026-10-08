/**
 * Where an export lands on the way to the share sheet.
 *
 * THE CACHE, NEVER THE DOCUMENTS DIRECTORY. The person's copy is wherever they send it — a mail
 * draft, a drive, a printer — and a second copy sitting in the app's own storage is a copy of
 * somebody's baby's record that nobody asked for and nobody manages. The OS reclaims the cache;
 * it is exactly what a file on its way out should live in.
 *
 * Every write REPLACES: two exports of the same day are the same file name, and a stale byte from
 * the last one appended to this one would be a corrupt file with a plausible name.
 *
 * Shared by the free download and the chosen export so the two cannot drift into writing to two
 * different places.
 */
import { Directory, File, Paths } from 'expo-file-system';

const EXPORT_DIR = 'export';

/** The file `name` in the export folder, with the folder made and any older copy gone. */
function freshExportFile(name: string): File {
  const dir = new Directory(Paths.cache, EXPORT_DIR);
  if (!dir.exists) dir.create();
  const file = new File(dir, name);
  if (file.exists) file.delete();
  return file;
}

export function writeExportFile(name: string, text: string): string {
  const file = freshExportFile(name);
  file.create();
  file.write(text);
  return file.uri;
}

/**
 * THE PDF, KEPT IN THIS FOLDER UNDER ITS OWN NAME BEFORE IT IS SHARED (2026-09-28).
 *
 * The print engine leaves its file in `cache/Print` under a random name. In Expo Go on Android
 * that folder is outside the project's sandbox, and the share sheet refused it ("Not allowed to
 * read file under given URL"); a copy made with `File.copy` would be refused the same way, because
 * expo-file-system asks the same question of the file it reads. So the copy is WRITTEN from the
 * bytes the engine handed back (`data/pdf.ts` asks for them), which needs only this folder. The
 * engine's own file is copied only when it sent no bytes, which every build but Expo Go can read.
 * And the parent's mail or drive shows `cuddlecue-export-2026-09-28-ada-7-days.pdf`, not a uuid.
 */
export async function keepExportPdf(
  name: string,
  pdf: { uri: string; base64: string | null },
): Promise<string> {
  const file = freshExportFile(name);
  if (pdf.base64 !== null) {
    file.create();
    // one line of base64, whatever the platform wrapped it in: iOS decodes strictly
    file.write(pdf.base64.replace(/\s+/g, ''), { encoding: 'base64' });
  } else {
    await new File(pdf.uri).copy(file);
  }
  return file.uri;
}
