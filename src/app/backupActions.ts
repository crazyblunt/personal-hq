import { buildExport, exportFilename } from '../data/backup';
import { workspaceSnapshot } from '../data/store';
import { copyToClipboard, saveTextFile, type SaveOutcome } from './fileSave';
import { markBackedUp } from './safety';

export const backupJson = () => JSON.stringify(buildExport(workspaceSnapshot()), null, 2);

/** Offers the backup file; records the time when the save goes through. */
export async function downloadBackup(): Promise<SaveOutcome> {
  const outcome = await saveTextFile(exportFilename(), backupJson());
  if (outcome === 'saved') markBackedUp();
  return outcome;
}

export async function copyBackup(): Promise<boolean> {
  const ok = await copyToClipboard(backupJson());
  if (ok) markBackedUp();
  return ok;
}
