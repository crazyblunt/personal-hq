import { undoBatch } from '../data/batches';
import { toast } from './ui';

/** Undoes a batch and says what happened, including items left alone because they changed since. */
export function undoWithToast(batchId: string) {
  const r = undoBatch(batchId);
  const done = `Undone: ${r.restored} restored, ${r.removed} removed`;
  if (r.skipped.length) toast(`${done}. Left alone (changed since): ${r.skipped.slice(0, 3).join(', ')}${r.skipped.length > 3 ? '…' : ''}`, 'info');
  else toast(done);
}
