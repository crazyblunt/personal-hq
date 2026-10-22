import { CalendarDays, Link2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../app/clock';
import { closeEditor, confirmAction, openEditor, toast, touchRecent } from '../app/ui';
import { createEvent, deleteEvent, updateEvent, updateTask, useHQ } from '../data/store';
import type { CalendarEvent } from '../data/types';
import { isDateKey } from '../lib/dates';
import { Button, Check, Field, Input, Select, Textarea } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { ProjectSelect, sameJson } from './common';

type Draft = Pick<CalendarEvent, 'title' | 'description' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'allDay' | 'projectId'>;

export function EventEditor({ id, defaults }: { id?: string; defaults?: Partial<CalendarEvent> }) {
  const today = useToday();
  const existing = useHQ((s) => (id ? s.events.find((e) => e.id === id) : undefined));
  const initial = useMemo<Draft>(() => {
    const e = existing ?? defaults ?? {};
    return {
      title: e.title ?? '',
      description: e.description ?? '',
      startDate: e.startDate ?? today,
      startTime: e.startTime ?? null,
      endDate: e.endDate ?? null,
      endTime: e.endTime ?? null,
      allDay: e.allDay ?? !e.startTime,
      projectId: e.projectId ?? null,
    };
  }, [id]); // eslint-disable-line
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const linked = useHQ(useShallow((s) => (id ? s.tasks.filter((t) => t.eventId === id) : [])));
  const linkable = useHQ(useShallow((s) => (id ? s.tasks.filter((t) => t.status !== 'completed' && t.eventId !== id) : [])));
  const [pick, setPick] = useState('');

  useEffect(() => {
    if (id) touchRecent('event', id);
  }, [id]);

  if (id && !existing) {
    return (
      <Dialog open onClose={closeEditor} title="Event not found" size="sm" footer={<Button onClick={closeEditor}>Close</Button>}>
        <p className="text-sm text-muted">This event no longer exists.</p>
      </Dialog>
    );
  }

  const save = () => {
    const title = d.title.trim();
    if (!title) return setError('Give the event a title.');
    if (!isDateKey(d.startDate)) return setError('Pick a start date.');
    if (d.endDate && d.endDate < d.startDate) return setError('The end date is before the start date.');
    if (!d.allDay && !d.startTime) return setError('Add a start time, or mark the event as all day.');
    if (!d.allDay && d.startTime && d.endTime && (!d.endDate || d.endDate === d.startDate) && d.endTime <= d.startTime) return setError('The end time must be after the start time.');
    const fields: Partial<CalendarEvent> = {
      ...d,
      title,
      startTime: d.allDay ? null : d.startTime,
      endTime: d.allDay ? null : d.endTime,
      endDate: d.endDate && d.endDate !== d.startDate ? d.endDate : null,
    };
    if (existing) {
      updateEvent(existing.id, fields);
      toast('Event saved');
    } else {
      const e = createEvent({ ...fields, title, startDate: d.startDate });
      touchRecent('event', e.id);
      toast('Event created');
    }
    closeEditor();
  };

  return (
    <Dialog
      open
      onClose={closeEditor}
      dirty={!sameJson(d, initial)}
      title={existing ? 'Edit event' : 'New event'}
      icon={<CalendarDays />}
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              className="mr-auto text-bad"
              onClick={() =>
                confirmAction({
                  title: 'Delete this event?',
                  body: `“${existing.title}” will be removed from the calendar.${linked.length ? ` ${linked.length} linked task(s) stay, unlinked.` : ''}`,
                  confirmLabel: 'Delete event',
                  onConfirm: () => {
                    deleteEvent(existing.id);
                    closeEditor();
                    toast('Event deleted');
                  },
                })
              }
            >
              <Trash2 className="size-3.5" aria-hidden="true" /> Delete
            </Button>
          )}
          <Button onClick={closeEditor}>Cancel</Button>
          <Button variant="primary" type="submit" form="event-form">
            {existing ? 'Save event' : 'Create event'}
          </Button>
        </>
      }
    >
      <form
        id="event-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid gap-3 sm:grid-cols-4"
      >
        <Field label="Title" htmlFor="event-title" error={error ?? undefined} className="sm:col-span-4">
          <Input id="event-title" value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={160} autoFocus placeholder="e.g. Chemistry midterm" />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-4">
          <Check checked={d.allDay} onChange={(v) => set('allDay', v)} label="All day" /> All-day event
        </label>
        <Field label="Start date" htmlFor="event-start" className="sm:col-span-2">
          <Input id="event-start" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        {!d.allDay && (
          <Field label="Start time" htmlFor="event-start-time" className="sm:col-span-2">
            <Input id="event-start-time" type="time" value={d.startTime ?? ''} onChange={(e) => set('startTime', e.target.value || null)} />
          </Field>
        )}
        <Field label="End date (optional)" htmlFor="event-end" className="sm:col-span-2">
          <div className="flex gap-1">
            <Input id="event-end" type="date" value={d.endDate ?? ''} min={d.startDate} onChange={(e) => set('endDate', e.target.value || null)} />
            {d.endDate && (
              <Button size="icon" variant="ghost" aria-label="Clear end date" onClick={() => set('endDate', null)}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </Field>
        {!d.allDay && (
          <Field label="End time (optional)" htmlFor="event-end-time" className="sm:col-span-2">
            <Input id="event-end-time" type="time" value={d.endTime ?? ''} onChange={(e) => set('endTime', e.target.value || null)} />
          </Field>
        )}
        <Field label="Project" htmlFor="event-project" className="sm:col-span-4">
          <ProjectSelect id="event-project" value={d.projectId} onChange={(v) => set('projectId', v)} />
        </Field>
        <Field label="Description" htmlFor="event-description" className="sm:col-span-4">
          <Textarea id="event-description" value={d.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Location, agenda, what to bring…" />
        </Field>
        {existing && (
          <div className="flex flex-col gap-1 sm:col-span-4">
            <span className="font-mono text-2xs tracking-wider text-muted uppercase">Linked tasks</span>
            {linked.length === 0 && <p className="text-xs text-subtle">No tasks linked yet.</p>}
            <ul className="flex flex-col border border-line bg-inset empty:hidden">
              {linked.map((t) => (
                <li key={t.id} className="flex items-center gap-2 border-b border-line px-2 py-1 text-sm last:border-b-0">
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openEditor({ kind: 'task', id: t.id })}>
                    {t.title}
                  </button>
                  <Button size="xs" variant="ghost" onClick={() => updateTask(t.id, { eventId: null })}>
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
            {linkable.length > 0 && (
              <div className="flex gap-1">
                <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Task to link">
                  <option value="">Link an open task…</option>
                  {linkable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
                <Button
                  disabled={!pick}
                  onClick={() => {
                    updateTask(pick, { eventId: existing.id });
                    setPick('');
                  }}
                >
                  <Link2 className="size-3.5" aria-hidden="true" /> Link
                </Button>
              </div>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
}
