import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { shortcutFor } from '../app/shortcuts';
import { THEMES } from '../data/types';
import { cn } from '../lib/util';
import { findCommand, useAppCommands, type AppCommand } from './commands';
import { NAV_ITEMS } from './nav';

type MenuEntry = string | '-' | { id: string; label: string };

/** The classic menu bar. Entries are command ids; ids that don't exist (yet) are skipped. */
export const MENUS: { label: 'File' | 'View' | 'Go' | 'Tools' | 'Help'; items: MenuEntry[] }[] = [
  { label: 'File', items: ['new-task', 'new-note', 'new-idea', 'new-project', 'new-event', '-', 'capture', '-', 'cmd-import', 'cmd-export'] },
  { label: 'View', items: ['customize-myday', 'go-explorer', '-', ...THEMES.map((t) => `theme-${t}`), '-', 'cmd-density'] },
  { label: 'Go', items: NAV_ITEMS.map((n) => `go-${n.section}`) },
  { label: 'Tools', items: ['open-command', 'cmd-organize', '-', 'ask-organize', 'ask-summarize', 'ask-breakdown', 'ask-plan', '-', 'cmd-focus'] },
  { label: 'Help', items: ['show-shortcuts', { id: 'go-prefs', label: 'Data & backups' }] },
];

interface Row {
  command: AppCommand;
  label: string;
}

/** Resolves a menu's entries to commands, dropping unknown ids and stray separators. */
function resolve(items: MenuEntry[], commands: AppCommand[]): (Row | '-')[] {
  const out: (Row | '-')[] = [];
  for (const it of items) {
    if (it === '-') {
      if (out.length && out[out.length - 1] !== '-') out.push('-');
      continue;
    }
    const id = typeof it === 'string' ? it : it.id;
    const command = findCommand(commands, id);
    if (command) out.push({ command, label: typeof it === 'string' ? command.label : it.label });
  }
  if (out[out.length - 1] === '-') out.pop();
  return out;
}

export function MenuBar() {
  const commands = useAppCommands();
  const menus = useMemo(() => MENUS.map((m) => ({ label: m.label, rows: resolve(m.items, commands) })), [commands]);
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const topRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = () => itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
  const focusItem = (i: number) => {
    const list = items();
    if (list.length) list[(i + list.length) % list.length].focus();
  };
  const switchMenu = (from: number, dir: 1 | -1) => {
    const next = (from + dir + menus.length) % menus.length;
    setOpen((cur) => (cur === null ? null : next));
    topRefs.current[next]?.focus();
  };
  const close = (refocus: number | null) => {
    setOpen(null);
    if (refocus !== null) topRefs.current[refocus]?.focus();
  };
  const run = (row: Row) => {
    setOpen(null);
    row.command.run();
  };

  const onTopKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      switchMenu(i, e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'ArrowDown' || ((e.key === 'Enter' || e.key === ' ') && open !== i)) {
      e.preventDefault();
      if (open === i) focusItem(0);
      else {
        setOpen(i);
        setTimeout(() => focusItem(0), 0);
      }
    } else if (e.key === 'ArrowUp' && open === i) {
      e.preventDefault();
      focusItem(-1);
    } else if (e.key === 'Escape' && open !== null) {
      e.preventDefault();
      close(i);
    }
  };

  const onMenuKey = (e: KeyboardEvent, i: number) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') focusItem(at + 1);
    else if (e.key === 'ArrowUp') focusItem(at - 1);
    else if (e.key === 'Home') focusItem(0);
    else if (e.key === 'End') focusItem(-1);
    else if (e.key === 'Escape') close(i);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') switchMenu(i, e.key === 'ArrowRight' ? 1 : -1);
    else if (e.key === 'Tab') return setOpen(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  itemRefs.current = [];
  return (
    <div ref={barRef} role="menubar" aria-label="Menu" className="hidden items-center lg:flex">
      {menus.map((m, i) => (
        <div key={m.label} className="relative">
          <button
            ref={(el) => {
              topRefs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => setOpen((cur) => (cur === i ? null : i))}
            onMouseEnter={() => open !== null && open !== i && setOpen(i)}
            onKeyDown={(e) => onTopKey(e, i)}
            className={cn('h-6 px-2 text-sm', open === i ? 'bg-accent-face text-accent-ink' : 'text-fg hover:bg-raised')}
          >
            {m.label}
          </button>
          {open === i && (
            <div role="menu" aria-label={m.label} onKeyDown={(e) => onMenuKey(e, i)} className="absolute top-full left-0 z-40 min-w-60 bevel-out bg-panel py-0.5 shadow-[3px_3px_0_rgb(0_0_0/0.4)]">
              {m.rows.map((row, j) =>
                row === '-' ? (
                  <div key={`sep-${j}`} role="separator" className="mx-1 my-0.5 border-t border-line" />
                ) : (
                  <button
                    key={row.command.id}
                    ref={(el) => {
                      if (el) itemRefs.current.push(el);
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => run(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        run(row);
                      }
                    }}
                    className="flex h-6 w-full items-center gap-4 px-3 text-left text-sm text-fg outline-none hover:bg-accent-face hover:text-accent-ink focus:bg-accent-face focus:text-accent-ink"
                  >
                    <span className="flex-1 truncate">{row.label}</span>
                    {shortcutFor(row.command.id) && <span className="font-mono text-2xs opacity-75">{shortcutFor(row.command.id)!.join(' ')}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
