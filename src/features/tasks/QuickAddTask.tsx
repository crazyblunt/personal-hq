import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useToday } from '../../app/clock';
import { toast } from '../../app/ui';
import { createTask } from '../../data/store';
import { PRIORITY_LABEL, type Task } from '../../data/types';
import { relativeDay } from '../../lib/dates';
import { parseQuickTask } from '../../lib/quickAdd';
import { cn } from '../../lib/util';
import { fieldBase } from '../../ui/controls';

/**
 * One-line task entry. Type and press Enter. Shortcuts are optional:
 * !high, #category, due:fri, or a trailing "today"/"tomorrow".
 */
export function QuickAddTask({ defaults, placeholder = 'Add a task… (!high #school due:fri)', id = 'quick-add-task', className }: { defaults?: Partial<Task>; placeholder?: string; id?: string; className?: string }) {
  const today = useToday();
  const [value, setValue] = useState('');
  const parsed = value.trim() ? parseQuickTask(value, today) : null;
  const extras = parsed
    ? [parsed.priority && PRIORITY_LABEL[parsed.priority], parsed.category && `#${parsed.category}`, ...parsed.tags.map((t) => `#${t}`), parsed.dueDate && `due ${relativeDay(parsed.dueDate, today)}`].filter(Boolean)
    : [];

  const submit = () => {
    if (!parsed?.title) return;
    createTask({
      ...defaults,
      title: parsed.title,
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.category ? { category: parsed.category } : {}),
      ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
      tags: [...(defaults?.tags ?? []), ...parsed.tags],
    });
    setValue('');
    toast('Task added');
  };

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className={cn(fieldBase, 'flex h-7 items-center gap-1.5 pr-1')}>
        <Plus className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape' && value) {
              e.stopPropagation();
              setValue('');
            }
          }}
          placeholder={placeholder}
          aria-label="New task"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        />
        {extras.length > 0 && <span className="hidden shrink-0 font-mono text-2xs text-accent sm:inline">{extras.join(' · ')}</span>}
      </div>
    </div>
  );
}
