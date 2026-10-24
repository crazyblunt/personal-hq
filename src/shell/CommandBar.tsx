import { CalendarDays, Command, FolderKanban, FolderPlus, Lightbulb, ListChecks, MessageSquareCode, NotebookPen, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../app/clock';
import { navigate } from '../app/router';
import { closeCommand, openEditor, toast, useUI } from '../app/ui';
import { createIdea, createNote, createProject, createTask, ideaTitle, useHQ } from '../data/store';
import { formatDate, relativeDay } from '../lib/dates';
import { parseQuickTask } from '../lib/quickAdd';
import { scoreMatch } from '../lib/search';
import { cn, firstLine } from '../lib/util';
import { Kbd } from '../ui/bits';
import { Dialog } from '../ui/Dialog';
import { useRecentResolved } from '../features/utilities/tools';
import { useAppCommands } from './commands';

export interface CommandItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

const GROUP_ORDER = ['Create', 'Recent', 'Tasks', 'Projects', 'Notes', 'Ideas', 'Events', 'Prompts', 'Views', 'Go to', 'Commands', 'Claude'];
const PER_GROUP = 6;

function useStaticCommands(): CommandItem[] {
  const commands = useAppCommands();
  return useMemo(() => commands.map((c) => ({ id: c.id, group: c.group, label: c.label, icon: c.icon, keywords: c.keywords, run: c.run })), [commands]);
}

export function CommandBar() {
  const open = useUI((s) => s.commandOpen);
  const today = useToday();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const staticCommands = useStaticCommands();
  const recent = useRecentResolved(6);
  const data = useHQ(useShallow((s) => ({ tasks: s.tasks, notes: s.notes, ideas: s.ideas, projects: s.projects, events: s.events, prompts: s.prompts })));

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const raw = query.trim();
    const commandsOnly = raw.startsWith('>');
    const q = commandsOnly ? raw.slice(1).trim() : raw;
    if (!q && !commandsOnly) {
      const rec: CommandItem[] = recent.map((r) => ({
        id: `recent-${r.item.kind}-${r.item.id}`,
        group: 'Recent',
        label: r.title,
        hint: r.item.kind,
        icon: { task: ListChecks, idea: Lightbulb, note: NotebookPen, project: FolderKanban, event: CalendarDays }[r.item.kind],
        run: r.open,
      }));
      return [...staticCommands.filter((c) => c.group === 'Create'), ...rec, ...staticCommands.filter((c) => c.group !== 'Create')];
    }
    const scored: (CommandItem & { score: number })[] = [];
    for (const c of staticCommands) {
      const s = scoreMatch(q, c.label, c.keywords);
      if (s || !q) scored.push({ ...c, score: s + (c.group === 'Go to' ? 1 : 0) });
    }
    if (!commandsOnly) {
      const add = (list: CommandItem[]) => scored.push(...(list as (CommandItem & { score: number })[]));
      const pick = <T,>(arr: T[], title: (t: T) => string, rest: (t: T) => (string | string[] | null)[], make: (t: T, score: number) => CommandItem) =>
        arr
          .map((t) => ({ t, s: scoreMatch(q, title(t), ...rest(t)) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, PER_GROUP)
          .map((x) => ({ ...make(x.t, x.s), score: x.s }));
      add(
        pick(
          data.tasks,
          (t) => t.title,
          (t) => [t.description, t.tags, t.category],
          (t) => ({
            id: `task-${t.id}`,
            group: 'Tasks',
            label: t.title,
            hint: t.status === 'completed' ? 'done' : t.dueDate ? relativeDay(t.dueDate, today) : undefined,
            icon: ListChecks,
            run: () => openEditor({ kind: 'task', id: t.id }),
          }),
        ),
      );
      add(pick(data.projects, (p) => p.name, (p) => [p.description, p.techStack], (p) => ({ id: `project-${p.id}`, group: 'Projects', label: p.name, hint: p.status, icon: FolderKanban, run: () => navigate('projects', p.id) })));
      add(pick(data.notes, (n) => n.title || 'Untitled note', (n) => [n.body, n.tags, n.category], (n) => ({ id: `note-${n.id}`, group: 'Notes', label: n.title || 'Untitled note', hint: n.category || undefined, icon: NotebookPen, run: () => navigate('notes', n.id) })));
      add(pick(data.ideas, (i) => ideaTitle(i), (i) => [i.body, i.tags, i.url], (i) => ({ id: `idea-${i.id}`, group: 'Ideas', label: ideaTitle(i), hint: i.inbox ? 'inbox' : i.archived ? 'archived' : undefined, icon: Lightbulb, run: () => openEditor({ kind: 'idea', id: i.id }) })));
      add(pick(data.events, (e) => e.title, (e) => [e.description], (e) => ({ id: `event-${e.id}`, group: 'Events', label: e.title, hint: formatDate(e.startDate, { month: 'short', day: 'numeric' }), icon: CalendarDays, run: () => openEditor({ kind: 'event', id: e.id }) })));
      add(pick(data.prompts, (p) => p.title, (p) => [p.body, p.tags], (p) => ({ id: `prompt-${p.id}`, group: 'Prompts', label: p.title, icon: MessageSquareCode, run: () => openEditor({ kind: 'prompt', id: p.id }) })));
    }
    const byGroup = new Map<string, (CommandItem & { score: number })[]>();
    for (const it of scored) byGroup.set(it.group, [...(byGroup.get(it.group) ?? []), it]);
    const out: CommandItem[] = [];
    if (q && !commandsOnly) {
      const parsed = parseQuickTask(q, today);
      out.push(
        {
          id: 'quick-task',
          group: 'Quick create',
          label: `Create task “${parsed.title || q}”`,
          hint: [parsed.priority, parsed.category && `#${parsed.category}`, parsed.dueDate && `due ${relativeDay(parsed.dueDate, today)}`].filter(Boolean).join(' · ') || undefined,
          icon: ListChecks,
          run: () => {
            if (!parsed.title) return;
            createTask({ title: parsed.title, priority: parsed.priority, category: parsed.category ?? '', tags: parsed.tags, dueDate: parsed.dueDate ?? null });
            toast('Task created');
          },
        },
        {
          id: 'quick-idea',
          group: 'Quick create',
          label: `Capture idea “${q}”`,
          hint: 'to Inbox',
          icon: Lightbulb,
          run: () => {
            createIdea({ body: q });
            toast('Captured to Inbox');
          },
        },
        { id: 'quick-note', group: 'Quick create', label: `New note “${firstLine(q, 60)}”`, icon: NotebookPen, run: () => navigate('notes', createNote({ title: firstLine(q, 120) }).id) },
        {
          id: 'quick-project',
          group: 'Quick create',
          label: `New project “${firstLine(q, 60)}”`,
          icon: FolderPlus,
          run: () => {
            const p = createProject({ name: firstLine(q, 80) });
            navigate('projects', p.id);
            toast('Project created');
          },
        },
      );
    }
    // Groups ordered by their best match, so the most relevant section comes first.
    const groups = [...byGroup.entries()].sort((a, b) => Math.max(...b[1].map((x) => x.score)) - Math.max(...a[1].map((x) => x.score)) || GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
    const searchHits: CommandItem[] = [];
    for (const [, list] of groups) searchHits.push(...list.sort((a, b) => b.score - a.score).slice(0, PER_GROUP + 4));
    // Matches first, then the "create from what you typed" options.
    return commandsOnly ? searchHits : [...searchHits, ...out];
  }, [query, staticCommands, recent, data, today]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    // Actions that open a window close the bar in the same update; everything else closes it here.
    item.run();
    closeCommand();
  };

  let lastGroup = '';
  return (
    <Dialog open={open} onClose={closeCommand} title="Command bar" icon={<Command />} size="lg" className="mt-[8vh] mb-auto">
      <div className="-m-3 flex flex-col">
        <div className="border-b border-line bg-bar p-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => (items.length ? (a + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(items[active]);
              } else if (e.key === 'Home' && !query) {
                setActive(0);
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
            aria-label="Search or type a command"
            placeholder="Search tasks, notes, ideas, projects… or type > for commands"
            className="h-8 w-full bevel-in bg-inset px-2 font-mono text-sm outline-none placeholder:text-subtle"
          />
        </div>
        <ul ref={listRef} id="command-results" role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto py-1">
          {items.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No matches. Try fewer words.</li>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <li key={item.id} role="presentation">
                {header && <div className="px-3 pt-1.5 pb-0.5 font-mono text-2xs font-semibold tracking-wider text-subtle uppercase">{header}</div>}
                <div
                  id={`cmd-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => run(item)}
                  className={cn('mx-1 flex h-7 cursor-default items-center gap-2 px-2 text-sm', i === active ? 'bg-accent-face text-accent-ink' : 'text-fg')}
                >
                  <Icon className={cn('size-3.5 shrink-0', i === active ? '' : 'text-muted')} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className={cn('shrink-0 font-mono text-2xs', i === active ? 'opacity-80' : 'text-subtle')}>{item.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-bar px-3 py-1 text-2xs text-subtle">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> run
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd> close
          </span>
          <span className="flex items-center gap-1">
            <Kbd>&gt;</Kbd> commands only
          </span>
        </div>
      </div>
    </Dialog>
  );
}
