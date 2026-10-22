import { Inbox } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToday } from '../app/clock';
import { MOD_KEY } from '../app/platform';
import { navigate } from '../app/router';
import { closeCapture, toast, useUI, type CaptureMode } from '../app/ui';
import { createIdea, createNote, createTask, detectIdeaKind } from '../data/store';
import { IDEA_KIND_LABEL, PRIORITY_LABEL } from '../data/types';
import { relativeDay } from '../lib/dates';
import { parseQuickTask } from '../lib/quickAdd';
import { firstLine } from '../lib/util';
import { Kbd, Segmented } from '../ui/bits';
import { Button, Textarea } from '../ui/controls';
import { Dialog } from '../ui/Dialog';

const HINT: Record<CaptureMode, string> = {
  idea: 'Anything at all. It lands in the Inbox until you file it.',
  task: 'One line. Optional: !high  #category  due:fri  (or end with "tomorrow").',
  note: 'First line becomes the title.',
};

export function CaptureDialog() {
  const capture = useUI((s) => s.capture);
  const today = useToday();
  const [mode, setMode] = useState<CaptureMode>('idea');
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (capture) {
      setMode(capture.mode);
      setText('');
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [capture]);

  const save = () => {
    const value = text.trim();
    if (!value) return;
    if (mode === 'idea') {
      createIdea({ body: value });
      toast('Captured to Inbox');
    } else if (mode === 'task') {
      const q = parseQuickTask(value, today);
      if (!q.title) return;
      createTask({ title: q.title, priority: q.priority, category: q.category ?? '', tags: q.tags, dueDate: q.dueDate ?? null, status: 'inbox' });
      toast('Task added to Inbox');
    } else {
      const lines = value.split('\n');
      const note = createNote({ title: firstLine(value, 120) || 'Untitled note', body: lines.slice(1).join('\n').trim() });
      navigate('notes', note.id);
      toast('Note created');
    }
    closeCapture();
  };

  const preview = (() => {
    const v = text.trim();
    if (!v) return null;
    if (mode === 'idea') return `Kind: ${IDEA_KIND_LABEL[detectIdeaKind(v)]}`;
    if (mode === 'task') {
      const q = parseQuickTask(v, today);
      return [q.title || '(no title)', q.priority && `priority ${PRIORITY_LABEL[q.priority]}`, q.category && `#${q.category}`, ...q.tags.map((t) => `#${t}`), q.dueDate && `due ${relativeDay(q.dueDate, today)}`].filter(Boolean).join(' · ');
    }
    return `Title: ${firstLine(v, 80)}`;
  })();

  return (
    <Dialog
      open={capture !== null}
      onClose={closeCapture}
      title="Quick capture"
      icon={<Inbox />}
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1 text-xs text-subtle sm:flex">
            {mode === 'note' ? (
              <>
                <Kbd>{MOD_KEY}</Kbd>+<Kbd>Enter</Kbd> to save
              </>
            ) : (
              <>
                <Kbd>Enter</Kbd> to save · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line
              </>
            )}
          </span>
          <Button onClick={closeCapture}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!text.trim()}>
            {mode === 'idea' ? 'Capture' : mode === 'task' ? 'Add task' : 'Create note'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Segmented
          label="Capture as"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'idea', label: 'Idea' },
            { value: 'task', label: 'Task' },
            { value: 'note', label: 'Note' },
          ]}
        />
        <Textarea
          ref={ref}
          id="capture-text"
          aria-label="Capture text"
          value={text}
          rows={mode === 'note' ? 6 : 3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            const submit = mode === 'note' ? e.key === 'Enter' && (e.metaKey || e.ctrlKey) : e.key === 'Enter' && !e.shiftKey;
            if (submit) {
              e.preventDefault();
              save();
            }
          }}
          placeholder={mode === 'idea' ? 'Idea, link, thought, plan, reminder…' : mode === 'task' ? 'e.g. Finish lab report !high #school due:thu' : 'Title on the first line…'}
        />
        <p className="text-xs text-subtle">{HINT[mode]}</p>
        {preview && <p className="font-mono text-xs text-muted">{preview}</p>}
      </div>
    </Dialog>
  );
}
