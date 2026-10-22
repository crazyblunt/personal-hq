import { Copy, Eye, RefreshCw, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { copyToClipboard, insideArtifactHost } from '../../app/fileSave';
import { confirmAction, toast } from '../../app/ui';
import { relativeTime } from '../../lib/dates';
import { cn, errorMessage } from '../../lib/util';
import { formatSyncCode } from '../../sync/crypto';
import { deleteCloudCopy, disableSync, enableSync, joinSync, syncNow, useSync } from '../../sync/controller';
import { Panel } from '../../ui/bits';
import { Button, Input } from '../../ui/controls';
import { Dialog } from '../../ui/Dialog';

const APP_URL = 'https://crazyblunt.github.io/personal-hq/';

function CodeBox({ code }: { code: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="bevel-in bg-monitor px-2 py-1 font-mono text-base tracking-wider break-all text-accent select-all">{code}</code>
      <Button
        size="sm"
        onClick={async () => {
          const ok = await copyToClipboard(code);
          toast(ok ? 'Sync code copied' : 'Couldn’t copy. Select the code and copy it by hand.', ok ? 'success' : 'error');
        }}
      >
        <Copy className="size-3" aria-hidden="true" /> Copy
      </Button>
    </div>
  );
}

export function SyncPanel() {
  const sync = useSync();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const on = sync.status !== 'off' && sync.status !== 'unavailable';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Sync between devices" icon={<Smartphone />}>
      <div className="flex flex-col gap-2 p-2 text-sm">
        {sync.status === 'unavailable' ? (
          <p className="text-muted">
            {insideArtifactHost() ? (
              <>
                Sync works in the installed app at{' '}
                <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  crazyblunt.github.io/personal-hq
                </a>
                . Claude artifacts can’t connect to other servers.
              </>
            ) : (
              'Sync isn’t available in this copy of the app (no sync server is configured, or this browser lacks the encryption features it needs).'
            )}
          </p>
        ) : !on ? (
          <>
            <p className="text-muted">
              Keep your Mac and phone in step. Everything is encrypted on this device with a private code before it’s uploaded, so the server only holds scrambled data. No account or email needed.
            </p>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
              <span className="min-w-0 flex-1">
                <strong>First device:</strong> <span className="text-muted">turn sync on here and get a code.</span>
              </span>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    setNewCode(await enableSync());
                  })
                }
              >
                Turn on sync
              </Button>
            </div>
            <form
              className="flex flex-col gap-1 border-t border-line pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await joinSync(joinCode);
                  setJoinCode('');
                  toast('Linked. This device now syncs with your other devices.');
                });
              }}
            >
              <label htmlFor="sync-join-code">
                <strong>Other devices:</strong> <span className="text-muted">enter the code from your first device. Anything already on this device is merged in, not replaced.</span>
              </label>
              <div className="flex gap-1">
                <Input id="sync-join-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" autoComplete="off" spellCheck={false} className="font-mono uppercase" />
                <Button type="submit" disabled={busy || joinCode.trim().length < 20}>
                  Join
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-1 font-mono text-xs">
              <dt className="text-subtle uppercase">Status</dt>
              <dd className={cn(sync.status === 'error' ? 'text-bad' : sync.status === 'offline' ? 'text-warn' : 'text-ok')}>
                {sync.status === 'syncing' ? 'Syncing…' : sync.status === 'offline' ? 'Offline, will sync when connected' : sync.status === 'error' ? 'Sync problem' : 'On'}
              </dd>
              <dt className="text-subtle uppercase">Last synced</dt>
              <dd>{sync.lastSyncAt ? `${relativeTime(sync.lastSyncAt)} (${new Date(sync.lastSyncAt).toLocaleTimeString()})` : 'Not yet'}</dd>
            </dl>
            {sync.error && sync.status !== 'idle' && (
              <p role="alert" className="text-xs text-bad">
                {sync.error}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button onClick={() => void syncNow()} disabled={sync.status === 'syncing'}>
                <RefreshCw className={cn('size-3.5', sync.status === 'syncing' && 'animate-spin')} aria-hidden="true" /> Sync now
              </Button>
              <Button onClick={() => setShowCode((v) => !v)}>
                <Eye className="size-3.5" aria-hidden="true" /> {showCode ? 'Hide sync code' : 'Show sync code'}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  confirmAction({
                    title: 'Turn off sync on this device?',
                    body: 'This device stops sending and receiving changes and forgets the sync code. Its data stays here, and your other devices and the cloud copy are not affected.',
                    confirmLabel: 'Turn off sync',
                    danger: false,
                    onConfirm: () => disableSync(),
                  })
                }
              >
                Turn off here
              </Button>
              <Button
                variant="ghost"
                className="text-bad"
                onClick={() =>
                  confirmAction({
                    title: 'Delete the cloud copy?',
                    body: 'The encrypted copy on the sync server is deleted and sync turns off on this device. Data on your devices stays. Turn sync off on your other devices too; otherwise they upload their next changes again.',
                    confirmLabel: 'Delete cloud copy',
                    onConfirm: async () => {
                      await deleteCloudCopy();
                      toast('Cloud copy deleted');
                    },
                  })
                }
              >
                Delete cloud copy…
              </Button>
            </div>
            {showCode && sync.code && (
              <div className="flex flex-col gap-1 border-t border-line pt-2">
                <CodeBox code={formatSyncCode(sync.code)} />
                <p className="text-xs text-subtle">Enter this in Settings › Sync on another device. Anyone with it can read and change your synced data.</p>
              </div>
            )}
            <p className="text-xs text-subtle">Syncs a few seconds after each change, every minute while open, and when you come back to the app. If both devices change the same item, the most recent change wins.</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      <Dialog
        open={newCode !== null}
        onClose={() => setNewCode(null)}
        title="Sync is on"
        icon={<Smartphone />}
        footer={
          <Button variant="primary" onClick={() => setNewCode(null)}>
            I saved my code
          </Button>
        }
      >
        <div className="flex flex-col gap-2 text-sm">
          <p>Your data is uploaded, encrypted. On your phone or another computer, open Personal HQ, go to Settings › Sync, and enter this code:</p>
          {newCode && <CodeBox code={newCode} />}
          <ul className="list-inside list-disc text-xs text-muted">
            <li>Keep it private: anyone with the code can read and change your synced data.</li>
            <li>Save it somewhere safe, like a password manager. You can show it again here while sync is on.</li>
            <li>If the code is lost on every device, the cloud copy can’t be opened. Each device still keeps its own data.</li>
          </ul>
        </div>
      </Dialog>
    </Panel>
  );
}
