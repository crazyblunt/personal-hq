import { ClipboardCopy, Send, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AI_JOBS, AI_LIMITS, type AiJobId } from '../../supabase/functions/_shared/ai-jobs';
import { useToday } from '../app/clock';
import { copyToClipboard } from '../app/fileSave';
import { navigate } from '../app/router';
import { closeAskClaude, toast, useUI } from '../app/ui';
import { undoWithToast } from '../app/undo';
import { useHQ, workspaceSnapshot } from '../data/store';
import { ideaTitle, noteTitle } from '../data/titles';
import { cn } from '../lib/util';
import { Button, Check, Field, Select } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { applyRows, buildReviewRows, type ReviewRow } from './apply';
import { extractJson } from './extract';
import { buildBreakdownInput, buildOrganizeInput, buildPlanInput, buildSummarizeInput } from './inputs';
import { LiveError, liveAvailable, runLive, type LiveResult } from './live';
import { bridgePrompt } from './prompt';
import { validateReply, type JobContext, type Rejected } from './validate';

type Step = 'choose' | 'preview' | 'paste' | 'sending' | 'review';

const LIVE_ERROR: Record<LiveError['code'], string> = {
  not_configured: 'Live mode isn’t set up on the server yet',
  unauthorized: 'The access code was rejected. Check it in Settings › Claude.',
  refused: 'Claude declined this request.',
  too_large: 'This request is too large to send. Pick fewer items.',
  bad_request: 'The function didn’t accept this request.',
  upstream: 'The Claude API returned an error. Try again in a moment.',
  network: 'Couldn’t reach the function. Check your connection.',
};

function liveMessage(e: unknown): string {
  if (!(e instanceof LiveError)) return 'Something went wrong. Copy/paste still works.';
  const base = LIVE_ERROR[e.code];
  return e.code === 'not_configured' ? `${base}${e.missing?.length ? ` (missing: ${e.missing.join(', ')})` : ''}. Copy/paste still works.` : base;
}

/** What the preview says is being shared, in words. */
function countsLine(ctx: JobContext): string {
  switch (ctx.job) {
    case 'organize':
      return `${ctx.input.ideas.length} idea${ctx.input.ideas.length === 1 ? '' : 's'}, ${ctx.input.tags.length} tag names, ${ctx.input.projects.length} active project names`;
    case 'summarize':
      return `1 note (${ctx.input.note.body.length.toLocaleString()} characters)`;
    case 'breakdown':
      return `1 project, ${ctx.input.project.milestones.length} milestones, ${ctx.input.existingTasks.length} existing task titles`;
    case 'plan':
      return `${ctx.input.tasks.length} open tasks (titles, priority, status, due date, project name) and ${ctx.input.events.length} of today’s events`;
  }
}

/**
 * Ask Claude: choose what to share, see exactly that data, then either copy
 * a prompt into Claude.ai and paste the reply back, or (with live mode set
 * up) send it to the phq-ai function. Every reply is validated, shown for
 * review, and applied only when you press Apply, as one undoable batch.
 */
export function AskClaudeDialog() {
  const req = useUI((s) => s.askClaude);
  const today = useToday();
  const data = useHQ(useShallow((s) => ({ ideas: s.ideas, notes: s.notes, projects: s.projects })));
  const [step, setStep] = useState<Step>('choose');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState('');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [meta, setMeta] = useState<LiveResult | null>(null);
  const [frozen, setFrozen] = useState<JobContext | null>(null);
  const job: AiJobId | null = req?.job ?? null;

  const inboxIdeas = useMemo(() => data.ideas.filter((i) => i.inbox && !i.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.ideas]);

  // A fresh start each time the window opens.
  useEffect(() => {
    if (!req) return;
    setPasted('');
    setError(null);
    setRows([]);
    setRejected([]);
    setMessage(null);
    setMeta(null);
    setFrozen(null);
    setTargetId(req.targetId ?? '');
    setPicked(new Set(inboxIdeas.slice(0, AI_LIMITS.organizeIdeas).map((i) => i.id)));
    setStep(req.job === 'plan' || req.targetId ? 'preview' : 'choose');
  }, [req]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The exact data for this job, built from the current workspace. */
  const ctx = useMemo<JobContext | null>(() => {
    if (!job || step === 'choose') return null;
    const ws = workspaceSnapshot();
    try {
      if (job === 'organize') return { job, input: buildOrganizeInput(ws, [...picked]) };
      if (job === 'plan') return { job, input: buildPlanInput(ws, today) };
      if (job === 'summarize') {
        const note = ws.notes.find((n) => n.id === targetId);
        return note ? { job, input: buildSummarizeInput(note), noteId: note.id, noteProjectId: note.projectId } : null;
      }
      return { job, input: buildBreakdownInput(ws, targetId, today), projectId: targetId };
    } catch {
      return null;
    }
  }, [job, step, picked, targetId, today]);

  if (!req || !job) return null;
  const def = AI_JOBS[job];
  // What was last copied as a prompt (or, before any copy, what the preview shows).
  const shared = frozen ?? ctx;

  /** Validates a reply against `sent`: exactly the data that went out with this request. */
  const showReview = (raw: unknown, live: LiveResult | null, sent: JobContext | null) => {
    if (!sent) return;
    const v = validateReply(sent, raw, today);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setRows(buildReviewRows(v.changes, workspaceSnapshot(), today));
    setRejected(v.rejected);
    setMessage(v.message);
    setMeta(live);
    setError(null);
    setStep('review');
  };

  const copyPrompt = async () => {
    if (!ctx) return;
    setFrozen(ctx);
    const ok = await copyToClipboard(bridgePrompt(job, ctx.input));
    toast(ok ? 'Prompt copied. Paste it into Claude.ai.' : 'Couldn’t reach the clipboard. Copy the prompt from the box below.', ok ? 'success' : 'info');
    setStep('paste');
  };

  const send = async () => {
    if (!ctx) return;
    const sent = ctx;
    setFrozen(sent);
    setStep('sending');
    setError(null);
    try {
      const res = await runLive(job, sent.input);
      showReview(res.result, res, sent);
      // showReview leaves the step alone on a bad reply; go back to the preview with the error.
      setStep((s) => (s === 'sending' ? 'preview' : s));
    } catch (e) {
      setError(liveMessage(e));
      setStep('preview');
    }
  };

  const apply = () => {
    const n = rows.filter((r) => r.checked).length;
    const batch = applyRows(rows, `Claude · ${def.label}`, today);
    closeAskClaude();
    toast(`Applied ${n} Claude suggestion${n === 1 ? '' : 's'}`, 'success', batch ? { label: 'Undo', run: () => undoWithToast(batch.id) } : undefined);
  };

  const checkedCount = rows.filter((r) => r.checked).length;
  const footer =
    step === 'choose' ? (
      <>
        <Button onClick={closeAskClaude}>Cancel</Button>
        <Button variant="primary" disabled={job === 'organize' ? picked.size === 0 : !targetId} onClick={() => setStep('preview')}>
          Next
        </Button>
      </>
    ) : step === 'preview' ? (
      <>
        {job !== 'plan' && !req.targetId && <Button onClick={() => setStep('choose')}>Back</Button>}
        <Button onClick={copyPrompt} disabled={!ctx}>
          <ClipboardCopy className="size-3.5" aria-hidden="true" /> Copy prompt
        </Button>
        {liveAvailable() && (
          <Button variant="primary" onClick={send} disabled={!ctx}>
            <Send className="size-3.5" aria-hidden="true" /> Send to Anthropic
          </Button>
        )}
      </>
    ) : step === 'paste' ? (
      <>
        <Button onClick={() => setStep('preview')}>Back</Button>
        <Button
          variant="primary"
          disabled={!pasted.trim()}
          onClick={() => {
            try {
              showReview(extractJson(pasted), null, shared);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Not valid JSON');
            }
          }}
        >
          Check reply
        </Button>
      </>
    ) : step === 'review' ? (
      <>
        <Button onClick={() => setStep(meta ? 'preview' : 'paste')}>Back</Button>
        {rows.length > 0 && (
          <Button variant="primary" disabled={checkedCount === 0} onClick={apply}>
            Apply selected
          </Button>
        )}
      </>
    ) : null;

  return (
    <Dialog open onClose={closeAskClaude} title={`Ask Claude · ${def.label}`} icon={<Sparkles />} size="lg" footer={footer}>
      <div className="flex flex-col gap-2 text-sm">
        {step === 'choose' && job === 'organize' && (
          <>
            <p className="text-muted">Choose the ideas to share. Only these ideas, your tag names, and your active project names are included.</p>
            {inboxIdeas.length === 0 ? (
              <p className="text-subtle">The Inbox has no ideas right now.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto border border-line bg-inset">
                {inboxIdeas.slice(0, AI_LIMITS.organizeIdeas).map((i) => (
                  <li key={i.id} className="flex items-center gap-2 border-b border-line px-2 py-0.5 last:border-b-0">
                    <Check
                      checked={picked.has(i.id)}
                      onChange={(on) =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (on) next.add(i.id);
                          else next.delete(i.id);
                          return next;
                        })
                      }
                      label={`Include ${ideaTitle(i)}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{ideaTitle(i)}</span>
                  </li>
                ))}
              </ul>
            )}
            {inboxIdeas.length > AI_LIMITS.organizeIdeas && <p className="text-xs text-subtle">Showing the {AI_LIMITS.organizeIdeas} newest Inbox ideas.</p>}
          </>
        )}
        {step === 'choose' && job === 'summarize' && (
          <Field label="Note to summarize" htmlFor="ask-note">
            <Select id="ask-note" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Choose a note…</option>
              {data.notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {noteTitle(n)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {step === 'choose' && job === 'breakdown' && (
          <Field label="Project" htmlFor="ask-project">
            <Select id="ask-project" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Choose a project…</option>
              {data.projects
                .filter((p) => p.status !== 'archived')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        {step === 'preview' && (
          <>
            {ctx ? (
              <>
                <p>
                  This is exactly what will be shared: <span className="text-muted">{countsLine(ctx)}</span>. Nothing else from your workspace is included.
                </p>
                <pre aria-label="Data to share" tabIndex={0} className="max-h-72 overflow-auto bevel-in bg-inset p-2 font-mono text-2xs whitespace-pre-wrap">
                  {JSON.stringify(ctx.input, null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-bad">That item no longer exists.</p>
            )}
            <p className="text-xs text-subtle">
              <strong className="text-muted">Copy prompt</strong> puts the instructions and this data on your clipboard to paste into Claude.ai (any plan; nothing is sent from here).{' '}
              {liveAvailable() ? (
                <>
                  <strong className="text-muted">Send to Anthropic</strong> sends this data through your Supabase function; it is not end-to-end encrypted.
                </>
              ) : (
                <>
                  Live mode isn’t set up on this device.{' '}
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => {
                      closeAskClaude();
                      navigate('prefs');
                    }}
                  >
                    Set it up in Settings › Claude
                  </button>
                  .
                </>
              )}
            </p>
          </>
        )}

        {step === 'paste' && shared && (
          <>
            <ol className="list-decimal pl-5 text-muted">
              <li>Open Claude.ai and paste the prompt (it’s on your clipboard).</li>
              <li>Copy Claude’s whole reply and paste it below. Extra text around the JSON is fine.</li>
            </ol>
            <details className="text-xs">
              <summary className="cursor-pointer text-subtle">Show the prompt</summary>
              <textarea readOnly value={bridgePrompt(job, shared.input)} aria-label="Prompt for Claude" className="mt-1 h-32 w-full bevel-in bg-inset p-1.5 font-mono text-2xs" onFocus={(e) => e.target.select()} />
            </details>
            <textarea
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setError(null);
              }}
              aria-label="Paste Claude's reply"
              placeholder="Paste Claude’s reply here"
              className="h-40 w-full bevel-in bg-inset p-1.5 font-mono text-xs"
            />
          </>
        )}

        {step === 'sending' && <p role="status" className="text-muted">Sending to Anthropic… this can take up to a minute.</p>}

        {error && (
          <p role="alert" className="border border-bad-fill bg-bad-fill/15 px-2 py-1 text-bad">
            {error}
          </p>
        )}

        {step === 'review' && (
          <>
            <p className="text-muted">
              <strong className="text-fg">Claude suggestions.</strong> Review each one; nothing changes until you press Apply. Applied changes can be undone.
            </p>
            {message && (
              <p className="border-l-2 border-accent bg-inset px-2 py-1">
                <span className="font-mono text-2xs tracking-wider text-subtle uppercase">Focus · </span>
                {message}
              </p>
            )}
            {rows.length === 0 ? (
              <p className="text-subtle">Nothing to apply: every suggestion is already in place or was rejected.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto border border-line bg-inset">
                {rows.map((r, idx) => (
                  <li key={r.key} className="flex items-start gap-2 border-b border-line px-2 py-1 last:border-b-0">
                    <Check checked={r.checked} onChange={(on) => setRows((cur) => cur.map((x, j) => (j === idx ? { ...x, checked: on } : x)))} label={r.label} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">
                        {r.label}
                        {r.duplicate && <span className="ml-1 font-mono text-2xs font-normal text-warn">Possible duplicate</span>}
                      </span>
                      <span className="block text-xs whitespace-pre-line">
                        {r.before !== null && <span className="text-subtle line-through decoration-subtle/50">{r.before}</span>}
                        {r.before !== null && ' → '}
                        <span className={cn(r.before !== null && 'text-ok')}>{r.after}</span>
                      </span>
                      {r.reason && <span className="block text-xs text-subtle">{r.reason}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {rejected.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-warn">{rejected.length} rejected</summary>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {rejected.map((r, i) => (
                    <li key={i}>
                      {r.reason}: {r.detail}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {meta && (
              <p className="font-mono text-2xs text-subtle">
                Model {meta.model} · {meta.usage.input_tokens.toLocaleString()} in / {meta.usage.output_tokens.toLocaleString()} out tokens
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
