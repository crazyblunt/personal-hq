import { Bot, Copy, Eye, EyeOff, KeyRound, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { generateAccessCode, LiveError, pingLive, readAccessCode, writeAccessCode } from '../../ai/live';
import { copyToClipboard, insideArtifactHost } from '../../app/fileSave';
import { toast } from '../../app/ui';
import { undoWithToast } from '../../app/undo';
import { useBatches } from '../../data/batches';
import { relativeTime } from '../../lib/dates';
import { cn } from '../../lib/util';
import { SUGGESTION_SOURCES } from '../../organize/provider';
import { Panel } from '../../ui/bits';
import { Button, Input } from '../../ui/controls';

const SOURCE_DOT = { local: 'bg-ok-fill', manual: 'bg-info-fill', remote: 'bg-warn-fill' } as const;

function describePing(e: unknown): string {
  if (!(e instanceof LiveError)) return 'Couldn’t check the connection.';
  switch (e.code) {
    case 'not_configured':
      return `Reached the function, but it isn’t set up yet${e.missing?.length ? ` (missing: ${e.missing.join(', ')})` : ''}.`;
    case 'unauthorized':
      return 'Reached the function, but it rejected this access code.';
    case 'network':
      return 'Couldn’t reach the function. It may not be deployed yet, or you’re offline.';
    default:
      return `The function answered with an error (${e.code}).`;
  }
}

/** Settings › Claude: where suggestions come from, optional live mode, and undo for applied suggestions. */
export function ClaudePanel() {
  const [code, setCode] = useState(readAccessCode);
  const [saved, setSaved] = useState(readAccessCode);
  const [show, setShow] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const batches = useBatches((s) => s.list);
  const inClaude = insideArtifactHost();

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const r = await pingLive(code.trim());
      setStatus(r.apiKeySet ? { tone: 'ok', text: `Connected · API key set · model ${r.model}` } : { tone: 'warn', text: 'Connected, but ANTHROPIC_API_KEY isn’t set on the server yet.' });
    } catch (e) {
      setStatus({ tone: e instanceof LiveError && e.code === 'unauthorized' ? 'bad' : 'warn', text: describePing(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Panel title="Claude" icon={<Bot />}>
      <div className="flex flex-col gap-2 p-2 text-sm">
        <ul className="border border-line bg-inset">
          {SUGGESTION_SOURCES.map((s) => (
            <li key={s.id} className="flex items-start gap-2 border-b border-line px-2 py-1 last:border-b-0">
              <span className={cn('mt-1.5 size-2 shrink-0', SOURCE_DOT[s.kind])} aria-hidden="true" />
              <span>
                <span className="block font-bold">
                  {s.label}
                  {s.id === 'claude-live' && <span className="ml-1 font-mono text-2xs font-normal text-subtle">{inClaude ? '· unavailable here' : saved ? '· set up on this device' : '· off'}</span>}
                </span>
                <span className="block text-xs text-muted">{s.description}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-subtle">Personal HQ works fully without Claude. Every Claude request shows exactly what will be shared first, and applied suggestions can be undone below.</p>

        {inClaude ? (
          <p className="text-xs text-muted">Live mode isn’t available inside Claude, which can’t connect to other servers. Copy/paste works here.</p>
        ) : (
          <fieldset className="flex flex-col gap-1.5 border border-line p-2">
            <legend className="px-1 font-mono text-2xs tracking-wider text-muted uppercase">Live mode (optional)</legend>
            <label htmlFor="ai-code" className="text-xs text-muted">
              Access code (the value of PHQ_AI_ACCESS_CODE on your Supabase function)
            </label>
            <div className="flex flex-wrap gap-1">
              <Input id="ai-code" type={show ? 'text' : 'password'} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} className="w-auto min-w-40 flex-1 font-mono" />
              <Button size="icon" variant="ghost" aria-label={show ? 'Hide access code' : 'Show access code'} onClick={() => setShow((v) => !v)}>
                {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
              <Button
                disabled={code.trim() === saved}
                onClick={() => {
                  writeAccessCode(code);
                  setSaved(code.trim());
                  toast(code.trim() ? 'Access code saved on this device' : 'Access code removed');
                }}
              >
                Save
              </Button>
              {saved && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    writeAccessCode('');
                    setCode('');
                    setSaved('');
                    setStatus(null);
                    toast('Access code removed from this device');
                  }}
                >
                  Clear
                </Button>
              )}
              <Button disabled={!code.trim() || testing} onClick={test}>
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
            </div>
            <p className="text-2xs text-subtle">Stored on this device only. Not synced or backed up. The Claude API key itself never comes to this page.</p>
            {status && (
              <p role="status" className={cn('text-xs', status.tone === 'ok' ? 'text-ok' : status.tone === 'warn' ? 'text-warn' : 'text-bad')}>
                {status.text}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" onClick={() => setGenerated(generateAccessCode())}>
                <KeyRound className="size-3" aria-hidden="true" /> Generate a code
              </Button>
              {generated && (
                <>
                  <input readOnly value={generated} aria-label="Generated access code" onFocus={(e) => e.target.select()} className="h-6 w-72 max-w-full bevel-in bg-inset px-1.5 font-mono text-xs" />
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label="Copy generated code"
                    onClick={async () => toast((await copyToClipboard(generated)) ? 'Code copied' : 'Couldn’t reach the clipboard; select and copy it', 'info')}
                  >
                    <Copy className="size-3" />
                  </Button>
                </>
              )}
            </div>
            <details className="text-xs text-muted">
              <summary className="cursor-pointer text-fg">How to set up live mode</summary>
              <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5">
                <li>Create an API key in the Claude Console, add credits, and set a monthly spending limit. Requests are billed per token by Anthropic; a Claude.ai subscription doesn’t include API use.</li>
                <li>
                  In the Supabase dashboard (project <span className="font-mono">personal-hq</span>), open Edge Functions › Secrets and add <span className="font-mono">ANTHROPIC_API_KEY</span> and <span className="font-mono">PHQ_AI_ACCESS_CODE</span> (use “Generate a code” above). Optionally add <span className="font-mono">PHQ_AI_MODEL</span>, for example <span className="font-mono">claude-haiku-5-5</span> for lower cost; the default is <span className="font-mono">claude-opus-5-5</span>.
                </li>
                <li>Paste the same access code above on each device and press Save, then Test connection.</li>
                <li>
                  If Test connection can’t reach the function, deploy it from the repository with <span className="font-mono">supabase functions deploy phq-ai --no-verify-jwt</span>.
                </li>
              </ol>
            </details>
          </fieldset>
        )}

        <div className="flex flex-col gap-1">
          <span className="font-mono text-2xs tracking-wider text-muted uppercase">Recently applied suggestions</span>
          {batches.length === 0 ? (
            <p className="text-xs text-subtle">Nothing yet. Suggestions you apply from Claude or the local Organize review appear here and can be undone.</p>
          ) : (
            <ul className="border border-line bg-inset">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center gap-2 border-b border-line px-2 py-1 text-xs last:border-b-0">
                  <span className="min-w-0 flex-1 truncate">
                    {b.label} <span className="text-subtle">· {relativeTime(b.at)} · {b.changed.length + b.created.length} items</span>
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => undoWithToast(b.id)}>
                    <Undo2 className="size-3" aria-hidden="true" /> Undo
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-2xs text-subtle">Kept on this device (last 10). Items you changed since are left alone.</p>
        </div>
      </div>
    </Panel>
  );
}
