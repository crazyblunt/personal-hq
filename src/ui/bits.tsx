import { Search, X } from 'lucide-react';
import { useState, type ComponentType, type HTMLAttributes, type ReactNode } from 'react';
import { navigate } from '../app/router';
import { useHQ } from '../data/store';
import { PRIORITY_LABEL, type DateKey, type Priority, type ProjectColor, type SectionId } from '../data/types';
import { diffDays, relativeDay } from '../lib/dates';
import { cn, parseTags } from '../lib/util';
import { fieldBase } from './controls';

export const PROJECT_COLOR_HEX: Record<ProjectColor, string> = {
  violet: '#8a78c8',
  blue: '#5a85c0',
  cyan: '#4d9ea6',
  emerald: '#5c9c50',
  amber: '#bd8a2a',
  orange: '#c27a3e',
  rose: '#b85a6a',
  pink: '#b0609a',
};

/** Framed panel with a title strip, like a docked tool window. */
export function Panel({
  title,
  icon,
  tools,
  children,
  className,
  bodyClassName,
  titleId,
  headerProps,
}: {
  title: ReactNode;
  icon?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  titleId?: string;
  /** Extra attributes for the title strip (My Day uses it as a drag handle). */
  headerProps?: HTMLAttributes<HTMLElement>;
}) {
  return (
    <section aria-labelledby={titleId} className={cn('flex min-w-0 flex-col border border-line bg-panel', className)}>
      <header {...headerProps} className={cn('flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-bar px-2 py-0.5', headerProps?.className)}>
        {icon && <span className="text-muted [&_svg]:size-3.5">{icon}</span>}
        <h2 id={titleId} className="min-w-24 flex-1 truncate font-mono text-2xs font-semibold tracking-wider text-muted uppercase">
          {title}
        </h2>
        {tools && <div className="flex shrink-0 flex-wrap items-center gap-1">{tools}</div>}
      </header>
      <div className={cn('min-w-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}

/** The strip at the top of every section: title, short description, and actions. */
export function PageHeader({ title, icon, description, actions }: { title: string; icon?: ComponentType<{ className?: string }>; description?: ReactNode; actions?: ReactNode }) {
  const Icon = icon;
  return (
    <div className="mb-2 flex flex-col gap-2 border-b border-line pb-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center bevel-out bg-raised text-accent" aria-hidden="true">
            <Icon className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{title}</h1>
          {description && <p className="truncate text-xs text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function Badge({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex h-4 shrink-0 items-center border px-1 font-mono text-2xs leading-none tracking-wide whitespace-nowrap uppercase', className ?? 'border-line-strong text-muted')}>
      {children}
    </span>
  );
}

export function TagChip({ tag, onRemove, onClick }: { tag: string; onRemove?: () => void; onClick?: () => void }) {
  const inner = <span className="truncate">#{tag}</span>;
  return (
    <span className="inline-flex h-4 max-w-40 items-center gap-0.5 border border-line bg-inset px-1 font-mono text-2xs text-muted">
      {onClick ? (
        <button type="button" onClick={onClick} className="truncate hover:text-fg">
          {inner}
        </button>
      ) : (
        inner
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove tag ${tag}`} className="text-subtle hover:text-bad">
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-4 items-center bevel-out bg-raised px-1 font-mono text-2xs leading-none text-muted">{children}</kbd>;
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon?: ComponentType<{ className?: string }>; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-1 px-4 py-6 text-center', className)}>
      {Icon && <Icon className="mb-1 size-5 text-subtle" aria-hidden="true" />}
      <h3 className="text-sm font-bold">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-1.5">{action}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, className, id }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; id?: string }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(fieldBase, 'h-7 pr-7 pl-7 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center text-subtle hover:text-fg">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  title?: string;
}

/** Radio-style button strip. */
export function Segmented<T extends string>({ value, onChange, options, label, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; label: string; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('max-w-full overflow-x-auto', className)}>
      <div className="inline-flex">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.title}
              onClick={() => onChange(o.value)}
              className={cn(
                '-ml-px flex items-center justify-center gap-1.5 whitespace-nowrap first:ml-0',
                size === 'sm' ? 'h-5 px-1.5 font-mono text-2xs uppercase' : 'h-7 px-2.5 text-sm',
                on ? 'relative z-10 bevel-in bg-inset text-fg' : 'bevel-out bg-raised text-muted hover:text-fg',
              )}
            >
              {o.label}
              {o.count !== undefined && <span className={cn('font-mono text-xs tabular', on ? 'text-accent' : 'text-subtle')}>{o.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A segmented LED-style bar. `value` is 0-100. */
export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const cells = 20;
  const lit = Math.round((Math.max(0, Math.min(100, value)) / 100) * cells);
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cn('flex h-3 gap-px bevel-in bg-monitor p-px', className)}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={cn('flex-1', i < lit ? 'bg-accent' : 'bg-transparent')} />
      ))}
    </div>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: 'border-bad-fill text-bad',
  high: 'border-orange-fill text-orange',
  medium: 'border-line-strong text-muted',
  low: 'border-line text-subtle',
};

export function PriorityBadge({ priority, hideMedium = false }: { priority: Priority; hideMedium?: boolean }) {
  if (hideMedium && (priority === 'medium' || priority === 'low')) return null;
  return <Badge className={PRIORITY_STYLE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function ColorSquare({ color, className }: { color: ProjectColor; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 border border-black/40', className)} style={{ backgroundColor: PROJECT_COLOR_HEX[color] }} />;
}

export function ProjectChip({ projectId, link = true }: { projectId: string | null; link?: boolean }) {
  const project = useHQ((s) => (projectId ? s.projects.find((p) => p.id === projectId) : undefined));
  if (!project) return null;
  const inner = (
    <>
      <ColorSquare color={project.color} />
      <span className="truncate">{project.name}</span>
    </>
  );
  return link ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate('projects', project.id);
      }}
      className="inline-flex max-w-44 min-w-0 items-center gap-1 text-xs text-muted hover:text-fg hover:underline"
    >
      {inner}
    </button>
  ) : (
    <span className="inline-flex max-w-44 min-w-0 items-center gap-1 text-xs text-muted">{inner}</span>
  );
}

/** Due date chip: red when overdue, amber for today, plain otherwise. */
export function DueChip({ date, today, done = false }: { date: DateKey; today: DateKey; done?: boolean }) {
  const n = diffDays(today, date);
  const tone = done ? 'text-subtle' : n < 0 ? 'text-bad' : n === 0 ? 'text-warn' : n <= 2 ? 'text-fg' : 'text-muted';
  return (
    <span className={cn('font-mono text-xs whitespace-nowrap tabular', tone)} title={date}>
      {!done && n < 0 ? `${-n}d overdue` : relativeDay(date, today)}
    </span>
  );
}

/** Comma-separated tag entry that shows chips. */
export function TagInput({ value, onChange, id, placeholder = 'Add tags, comma separated' }: { value: string[]; onChange: (tags: string[]) => void; id?: string; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    if (!draft.trim()) return;
    const next = parseTags([...value, ...parseTags(draft)].join(','));
    onChange(next);
    setDraft('');
  };
  return (
    <div className={cn(fieldBase, 'flex min-h-7 flex-wrap items-center gap-1 py-1')}>
      {value.map((t) => (
        <TagChip key={t} tag={t} onRemove={() => onChange(value.filter((x) => x !== t))} />
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(',')) {
            const parts = v.split(',');
            const rest = parts.pop() ?? '';
            onChange(parseTags([...value, ...parts].join(',')));
            setDraft(rest.trimStart());
          } else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={value.length ? '' : placeholder}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
      />
    </div>
  );
}

export function SectionLink({ section, id, children, className }: { section: SectionId; id?: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={`#${section}${id ? `.${id}` : ''}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(section, id ?? null);
      }}
      className={cn('hover:underline', className)}
    >
      {children}
    </a>
  );
}

/** External link that always opens in a new tab. */
export function ExtLink({ href, children, className, title }: { href: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title ?? href} className={cn('hover:underline', className)}>
      {children}
    </a>
  );
}
