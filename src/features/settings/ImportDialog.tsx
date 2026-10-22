import { Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from '../../app/ui';
import { applyImport, planImport, type ImportMode, type ParsedImport } from '../../data/backup';
import { logActivity, replaceWorkspace, workspaceSnapshot } from '../../data/store';
import { COLLECTIONS, COLLECTION_LABEL } from '../../data/types';
import { cn, errorMessage } from '../../lib/util';
import { Button, Check } from '../../ui/controls';
import { Dialog } from '../../ui/Dialog';

const MODES: { value: ImportMode; label: string; body: string }[] = [
  { value: 'add', label: 'Add new records only', body: 'Records you already have are left exactly as they are. Safest choice.' },
  { value: 'update', label: 'Add new and update older copies', body: 'Also replaces a record you have when the file’s copy was edited more recently.' },
  { value: 'replace', label: 'Replace everything', body: 'Your workspace becomes exactly the file. Records not in the file are removed.' },
];

/** Preview of a parsed backup: what it contains and what each import mode would do. */
export function ImportDialog({ parsed, fileName, onClose }: { parsed: ParsedImport; fileName: string; onClose: () => void }) {
  const [mode, setMode] = useState<ImportMode>('add');
  const [includeSettings, setIncludeSettings] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current] = useState(workspaceSnapshot);
  const plan = useMemo(() => planImport(current, parsed.data, mode), [current, parsed, mode]);
  const totals = COLLECTIONS.reduce((a, n) => ({ add: a.add + plan[n].add, update: a.update + plan[n].update, remove: a.remove + plan[n].remove }), { add: 0, update: 0, remove: 0 });
  const nothingToDo = totals.add + totals.update + totals.remove === 0 && !(includeSettings && parsed.settings);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = applyImport(current, parsed, mode, includeSettings);
      await replaceWorkspace(next, `import of ${fileName}`);
      logActivity({
        action: 'imported',
        entity: 'workspace',
        entityId: '',
        title: fileName,
        detail: `${MODES.find((m) => m.value === mode)!.label}: ${totals.add} added, ${totals.update} updated${totals.remove ? `, ${totals.remove} removed` : ''}`,
      });
      toast(`Imported ${fileName}: ${totals.add} added, ${totals.update} updated`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Import ${fileName}`}
      icon={<Upload />}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} disabled={busy || nothingToDo || (mode === 'replace' && !confirmReplace)} onClick={run}>
            {mode === 'replace' ? 'Replace my data' : 'Import'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">
          {parsed.source === 'agent-command-center' ? 'Agent Command Center backup' : 'Personal HQ backup'}
          {parsed.exportedAt && ` · exported ${new Date(parsed.exportedAt).toLocaleString()}`}. Checked and ready; nothing has changed yet.
        </p>

        {parsed.errors.length > 0 && (
          <div role="alert" className="border border-bad-fill bg-bad-fill/15 px-2 py-1.5">
            <p className="font-bold text-bad">{parsed.errors.length} record(s) in this file can’t be used and will be skipped:</p>
            <ul className="mt-1 list-inside list-disc font-mono text-xs text-muted">
              {parsed.errors.slice(0, 6).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {parsed.errors.length > 6 && <li>…and {parsed.errors.length - 6} more</li>}
            </ul>
          </div>
        )}
        {parsed.warnings.length > 0 && (
          <details className="border border-line bg-inset px-2 py-1 text-xs">
            <summary className="cursor-default text-warn">{parsed.warnings.length} value(s) were corrected (for example an unknown status set to its default)</summary>
            <ul className="mt-1 list-inside list-disc font-mono text-muted">
              {parsed.warnings.slice(0, 10).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-mono text-2xs tracking-wider text-muted uppercase">How to import</legend>
          {MODES.map((m) => (
            <label key={m.value} className={cn('flex cursor-default items-start gap-2 border px-2 py-1.5', mode === m.value ? 'border-accent bg-inset' : 'border-line')}>
              <input
                type="radio"
                name="import-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => {
                  setMode(m.value);
                  setConfirmReplace(false);
                  if (m.value === 'replace' && parsed.settings) setIncludeSettings(true);
                }}
                className="mt-1 accent-[var(--accent-face)]"
              />
              <span>
                <span className={cn('block font-bold', m.value === 'replace' && 'text-bad')}>{m.label}</span>
                <span className="block text-xs text-muted">{m.body}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="overflow-x-auto">
          <table className="w-full border border-line text-right font-mono text-xs">
            <thead className="bg-bar text-2xs tracking-wider text-subtle uppercase">
              <tr>
                <th className="px-2 py-0.5 text-left font-semibold">Collection</th>
                <th className="px-2 py-0.5 font-semibold">In file</th>
                <th className="px-2 py-0.5 font-semibold">Add</th>
                <th className="px-2 py-0.5 font-semibold">Update</th>
                <th className="px-2 py-0.5 font-semibold">Unchanged</th>
                <th className="px-2 py-0.5 font-semibold">{mode === 'replace' ? 'Remove' : 'Keep'}</th>
              </tr>
            </thead>
            <tbody className="bg-inset tabular">
              {COLLECTIONS.map((n) => (
                <tr key={n} className="border-t border-line">
                  <td className="px-2 py-0.5 text-left">{COLLECTION_LABEL[n]}</td>
                  <td className="px-2 py-0.5">{parsed.counts[n]}</td>
                  <td className={cn('px-2 py-0.5', plan[n].add && 'text-ok')}>{plan[n].add}</td>
                  <td className={cn('px-2 py-0.5', plan[n].update && 'text-warn')}>{plan[n].update}</td>
                  <td className="px-2 py-0.5 text-subtle">{plan[n].unchanged}</td>
                  <td className={cn('px-2 py-0.5', mode === 'replace' && plan[n].remove ? 'text-bad' : 'text-subtle')}>{mode === 'replace' ? plan[n].remove : plan[n].keep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {parsed.settings && (
          <label className="flex items-center gap-2">
            <Check checked={includeSettings} onChange={setIncludeSettings} label="Also import settings" /> Also import settings and widget layout from the file
          </label>
        )}
        {mode === 'replace' && (
          <label className="flex items-start gap-2 border border-bad-fill bg-bad-fill/15 px-2 py-1.5">
            <Check checked={confirmReplace} onChange={setConfirmReplace} label="I understand" className="mt-0.5" />
            <span>
              I understand that {totals.remove} record(s) not in this file will be removed. A safety copy of the current data is saved first and can be restored from Settings › Data.
            </span>
          </label>
        )}
        {nothingToDo && <p className="text-xs text-subtle">Everything in this file is already in your workspace. Nothing to import with this option.</p>}
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
