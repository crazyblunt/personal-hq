import { Copy, Download, HardDrive, History, LifeBuoy, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { copyToClipboard, insideArtifactHost, saveTextFile } from '../../app/fileSave';
import { confirmAction, toast } from '../../app/ui';
import type { RecoveryEntry, Snapshot } from '../../data/adapters/types';
import { applyImport, buildExport, countsOf, exportFilename, ImportError, parseImport, type ParsedImport } from '../../data/backup';
import { emptyWorkspace } from '../../data/defaults';
import type { LegacyConversion } from '../../data/legacy';
import { getAdapter, logActivity, replaceWorkspace, useHQ, workspaceSnapshot } from '../../data/store';
import { COLLECTIONS, COLLECTION_LABEL, SCHEMA_VERSION } from '../../data/types';
import { errorMessage } from '../../lib/util';
import { Panel } from '../../ui/bits';
import { Button, Input } from '../../ui/controls';
import { Dialog } from '../../ui/Dialog';
import { ImportDialog } from './ImportDialog';

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export function DataSection() {
  const { storageLabel, persistent, saveState, saveError, lastSavedAt } = useHQ(
    useShallow((s) => ({ storageLabel: s.storageLabel, persistent: s.persistent, saveState: s.saveState, saveError: s.saveError, lastSavedAt: s.lastSavedAt })),
  );
  const counts = useHQ(useShallow((s) => COLLECTIONS.map((n) => s[n].length)));
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ parsed: ParsedImport; fileName: string } | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [legacy, setLegacy] = useState<LegacyConversion | null>(null);
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([]);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const refresh = async () => {
    const a = getAdapter();
    setSnapshot((await a.loadSnapshot?.()) ?? null);
    setLegacy((await a.readLegacy?.()) ?? null);
    setRecovery((await a.listRecovery?.()) ?? []);
  };
  useEffect(() => {
    void refresh();
  }, [pending, wipeOpen]);

  const exportJson = () => JSON.stringify(buildExport(workspaceSnapshot()), null, 2);

  const download = async () => {
    setExportNote(null);
    const outcome = await saveTextFile(exportFilename(), exportJson());
    if (outcome === 'saved') toast('Backup saved');
    else if (outcome === 'declined') toast('Download cancelled', 'info');
    else {
      setExportNote('Downloads are not available here. Use “Copy JSON” and paste it into a file named personal-hq-backup.json.');
      toast('Downloads are not available here. Use Copy JSON instead.', 'error');
    }
  };

  const onFile = async (file: File) => {
    setImportError(null);
    if (file.size > MAX_IMPORT_BYTES) return setImportError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. Backups larger than 25 MB are not supported.`);
    try {
      const parsed = parseImport(await file.text());
      setPending({ parsed, fileName: file.name });
    } catch (e) {
      setImportError(e instanceof ImportError ? `${file.name} couldn’t be imported: ${e.message}` : `Couldn’t read ${file.name}: ${errorMessage(e)}`);
    }
  };

  const legacyCount = legacy ? Object.values(legacy.counts).reduce((a, b) => a + b, 0) : 0;
  const legacyMissing = legacy
    ? (() => {
        const cur = workspaceSnapshot();
        return COLLECTIONS.reduce((n, c) => n + legacy.data[c].filter((r) => !cur[c].some((x) => x.id === r.id)).length, 0);
      })()
    : 0;

  return (
    <>
      <Panel title="Storage" icon={<HardDrive />}>
        <div className="flex flex-col gap-2 p-2">
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-1 font-mono text-xs">
            <dt className="text-subtle uppercase">Location</dt>
            <dd>{storageLabel} (localStorage)</dd>
            <dt className="text-subtle uppercase">Status</dt>
            <dd className={!persistent || saveState === 'error' ? 'text-bad' : 'text-ok'}>
              {!persistent ? 'Not saved: browser storage is blocked here' : saveState === 'error' ? saveError : lastSavedAt ? `Saved on every change · last ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Saved on every change'}
            </dd>
            <dt className="text-subtle uppercase">Data version</dt>
            <dd>{SCHEMA_VERSION}</dd>
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full border border-line text-center">
              <thead className="bg-bar font-mono text-2xs tracking-wider text-subtle uppercase">
                <tr>
                  {COLLECTIONS.map((n) => (
                    <th key={n} className="border-r border-line px-1 py-0.5 font-semibold last:border-r-0">
                      {COLLECTION_LABEL[n]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-inset font-mono text-sm tabular">
                <tr>
                  {counts.map((c, i) => (
                    <td key={COLLECTIONS[i]} className="border-r border-line px-1 py-1 last:border-r-0">
                      {c}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted">
            {persistent
              ? 'Everything is stored in this browser only. It survives reloads but does not sync to other browsers or devices, and clearing site data erases it. Export a backup regularly.'
              : 'Browser storage is blocked here, so your data only lasts until this page closes. Export it to keep it.'}
          </p>
        </div>
      </Panel>

      <Panel title="Backup and restore" icon={<Download />}>
        <div className="flex flex-col gap-2 p-2">
          <div className="flex flex-wrap gap-1.5">
            <Button variant="primary" onClick={download}>
              <Download className="size-3.5" aria-hidden="true" /> Download backup (.json)
            </Button>
            <Button
              onClick={async () => {
                const ok = await copyToClipboard(exportJson());
                toast(ok ? 'Backup JSON copied to the clipboard' : 'Couldn’t reach the clipboard here', ok ? 'success' : 'error');
              }}
            >
              <Copy className="size-3.5" aria-hidden="true" /> Copy JSON
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" aria-hidden="true" /> Import JSON…
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Backup file to import"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void onFile(f);
              }}
            />
          </div>
          {insideArtifactHost() && <p className="text-xs text-subtle">Downloads ask for your confirmation first.</p>}
          {exportNote && <p className="text-xs text-warn">{exportNote}</p>}
          {importError && (
            <p role="alert" className="text-sm text-bad">
              {importError}
            </p>
          )}
          <p className="text-xs text-subtle">Imports accept Personal HQ and Agent Command Center backups. You see a preview first; the default adds new records and never overwrites existing ones.</p>
          {snapshot && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-sm">
              <History className="size-3.5 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                Safety copy from before the {snapshot.reason} · {new Date(snapshot.at).toLocaleString()}
              </span>
              <Button
                size="sm"
                onClick={() =>
                  confirmAction({
                    title: 'Restore the safety copy?',
                    body: `Your workspace goes back to how it was on ${new Date(snapshot.at).toLocaleString()}, before the ${snapshot.reason}. Changes since then are lost (the current data becomes the new safety copy).`,
                    confirmLabel: 'Restore copy',
                    onConfirm: async () => {
                      await replaceWorkspace(snapshot.data, 'restore of a safety copy');
                      logActivity({ action: 'restored', entity: 'workspace', entityId: '', title: 'Safety copy', detail: `Restored data from ${new Date(snapshot.at).toLocaleString()}` });
                      toast('Safety copy restored');
                      void refresh();
                    },
                  })
                }
              >
                Restore
              </Button>
            </div>
          )}
        </div>
      </Panel>

      {legacy && (
        <Panel title="Agent Command Center data" icon={<LifeBuoy />}>
          <div className="flex flex-col gap-2 p-2 text-sm">
            <p className="text-muted">
              The original Agent Command Center data ({legacyCount} records) is still stored in this browser under its old keys. Personal HQ copied it when it first opened and never changes or deletes the original.
            </p>
            <p className="font-mono text-xs text-subtle">
              {Object.entries(legacy.counts)
                .map(([k, v]) => `${v} ${k}`)
                .join(' · ')}
              {legacy.errors.length > 0 && ` · ${legacy.errors.length} unreadable`}
            </p>
            {legacyMissing > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-warn">{legacyMissing} of those records are not in your workspace (deleted since, or added later).</span>
                <Button
                  size="sm"
                  onClick={() =>
                    confirmAction({
                      title: 'Bring back missing Agent Command Center records?',
                      body: `${legacyMissing} record(s) from the original data will be added. Nothing you already have is changed.`,
                      confirmLabel: 'Add them',
                      danger: false,
                      onConfirm: async () => {
                        const next = applyImport(workspaceSnapshot(), { source: 'agent-command-center', exportedAt: null, data: legacy.data, settings: null, errors: [], warnings: [], counts: countsOf(legacy.data) }, 'add', false);
                        await replaceWorkspace(next, 'merge of Agent Command Center data');
                        logActivity({ action: 'imported', entity: 'workspace', entityId: '', title: 'Agent Command Center data', detail: `Re-added ${legacyMissing} records` });
                        toast(`Added ${legacyMissing} records`);
                        void refresh();
                      },
                    })
                  }
                >
                  Add missing records
                </Button>
              </div>
            ) : (
              <p className="text-xs text-ok">Every original record is in your workspace.</p>
            )}
          </div>
        </Panel>
      )}

      {recovery.length > 0 && (
        <Panel title="Recovery" icon={<LifeBuoy />}>
          <div className="flex flex-col gap-1 p-2 text-sm">
            <p className="text-muted">Data that could not be read was kept here instead of being thrown away. Copy it out to inspect or repair it.</p>
            <ul className="border border-line bg-inset">
              {recovery.map((r) => (
                <li key={r.key} className="flex items-center gap-2 border-b border-line px-2 py-1 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.label}</span>
                  <span className="font-mono text-2xs text-subtle">{(r.size / 1024).toFixed(1)} KB</span>
                  <Button
                    size="xs"
                    onClick={async () => {
                      const text = await getAdapter().readRecovery?.(r.key);
                      const ok = text ? await copyToClipboard(text) : false;
                      toast(ok ? 'Copied to the clipboard' : 'Couldn’t copy', ok ? 'success' : 'error');
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-bad"
                    onClick={() =>
                      confirmAction({
                        title: 'Delete recovered data?',
                        body: 'This copy of unreadable data will be permanently removed.',
                        confirmLabel: 'Delete',
                        onConfirm: async () => {
                          await getAdapter().deleteRecovery?.(r.key);
                          void refresh();
                        },
                      })
                    }
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      <Panel title="Danger zone" icon={<Trash2 />}>
        <div className="flex flex-wrap items-center gap-2 p-2 text-sm">
          <span className="min-w-0 flex-1 text-muted">Delete every task, idea, note, project, event, bug, prompt, and activity entry. Settings are kept. A safety copy is saved first.</span>
          <Button variant="danger" onClick={() => setWipeOpen(true)}>
            <Trash2 className="size-3.5" aria-hidden="true" /> Delete all data…
          </Button>
        </div>
      </Panel>

      {pending && <ImportDialog parsed={pending.parsed} fileName={pending.fileName} onClose={() => setPending(null)} />}
      {wipeOpen && <WipeDialog onClose={() => setWipeOpen(false)} />}
    </>
  );
}

function WipeDialog({ onClose }: { onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Delete all data?"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={typed !== 'DELETE'}
            onClick={async () => {
              try {
                const settings = useHQ.getState().settings;
                await replaceWorkspace({ ...emptyWorkspace(), settings }, 'deletion of all data');
                toast('All data deleted. A safety copy is in Settings › Data.');
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Delete everything
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-muted">All records in this browser will be deleted. Export a backup first if you might want them. A single safety copy is kept and can be restored from Settings › Data until the next import or deletion.</p>
        <label htmlFor="wipe-confirm" className="text-xs text-muted">
          Type DELETE to confirm
        </label>
        <Input id="wipe-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
