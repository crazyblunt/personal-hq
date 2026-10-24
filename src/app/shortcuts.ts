/**
 * Every keyboard shortcut, in one list. The global key handler, the `?`
 * panel, Settings › Keyboard, command bar hints, and menu accelerators all
 * read from here, so they can't drift apart.
 *
 * Single-key shortcuts never fire while typing in a field or while a window
 * is open; only ⌘/Ctrl combos work everywhere. Browser-reserved combos
 * (⌘N, ⌘T, ⌘W, ⌘L, …) are left alone.
 */
import type { SectionId } from '../data/types';
import { NAV_ITEMS } from '../shell/nav';
import { isTypingTarget, MOD_KEY } from './platform';

export interface ShortcutDef {
  id: string;
  keys: string[];
  label: string;
  group: 'General' | 'Navigation' | 'Create' | 'Editing' | 'My Day';
  scope: 'global' | 'dialog' | 'customize';
  /** The command it runs (ids from `src/shell/commands.ts`). Display-only entries have none. */
  command?: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'command-bar', keys: [MOD_KEY, 'K'], label: 'Open the command bar: search, go to, create, run commands', group: 'General', scope: 'global', command: 'open-command' },
  { id: 'command-bar-slash', keys: ['/'], label: 'Open the command bar', group: 'General', scope: 'global', command: 'open-command' },
  { id: 'shortcuts', keys: ['?'], label: 'Show keyboard shortcuts', group: 'General', scope: 'global', command: 'show-shortcuts' },
  { id: 'capture', keys: ['C'], label: 'Quick capture', group: 'Create', scope: 'global', command: 'capture' },
  { id: 'new-item', keys: ['N'], label: 'New item for this page: task (My Day, Tasks), idea (Inbox, Ideas), note, project, or event', group: 'Create', scope: 'global' },
  ...NAV_ITEMS.map(
    (n): ShortcutDef => ({ id: `go-${n.section}`, keys: ['G', n.key.toUpperCase()], label: `Go to ${n.label}`, group: 'Navigation', scope: 'global', command: `go-${n.section}` }),
  ),
  { id: 'save-editor', keys: [MOD_KEY, 'Enter'], label: 'Save the open editor window', group: 'Editing', scope: 'dialog' },
  { id: 'close-window', keys: ['Esc'], label: 'Close the window (asks first if there are unsaved edits)', group: 'Editing', scope: 'dialog' },
  { id: 'command-bar-keys', keys: ['↑', '↓', 'Enter'], label: 'Move through and run command bar results', group: 'Editing', scope: 'dialog' },
  { id: 'command-bar-commands', keys: ['>'], label: 'In the command bar: show only commands', group: 'Editing', scope: 'dialog' },
  { id: 'widget-move', keys: ['←', '↑', '→', '↓'], label: 'Move the focused widget (customize mode, grip button focused)', group: 'My Day', scope: 'customize' },
  { id: 'widget-resize', keys: ['Shift', '←', '↑', '→', '↓'], label: 'Resize the focused widget', group: 'My Day', scope: 'customize' },
];

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target: EventTarget | null;
}

export interface MatchState {
  modalOpen: boolean;
  /** `G` was pressed a moment ago, so the next key picks a section. */
  pendingG: boolean;
  section: SectionId;
}

export type ShortcutHit = { command: string } | { pendingG: true };

export type NewItemCommand = 'new-myday-task' | 'new-task' | 'new-idea' | 'new-note' | 'new-project' | 'new-event';

/** What `N` creates on each page. */
export function newItemCommand(section: SectionId): NewItemCommand {
  switch (section) {
    case 'myday':
      return 'new-myday-task';
    case 'inbox':
    case 'ideas':
      return 'new-idea';
    case 'notes':
      return 'new-note';
    case 'projects':
      return 'new-project';
    case 'calendar':
      return 'new-event';
    default:
      return 'new-task';
  }
}

export function matchShortcut(e: KeyLike, st: MatchState): ShortcutHit | null {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') return { command: 'open-command' };
  if (mod || e.altKey || e.defaultPrevented || e.isComposing || st.modalOpen || isTypingTarget(e.target)) return null;
  const key = e.key.toLowerCase();
  if (st.pendingG) {
    const item = NAV_ITEMS.find((n) => n.key === key);
    return item ? { command: `go-${item.section}` } : null;
  }
  if (key === 'g') return { pendingG: true };
  if (e.key === '/') return { command: 'open-command' };
  if (e.key === '?') return { command: 'show-shortcuts' };
  if (key === 'c') return { command: 'capture' };
  if (key === 'n') return { command: newItemCommand(st.section) };
  return null;
}

/** The keys that run a command, for hints in menus and the command bar. */
export function shortcutFor(commandId: string): string[] | undefined {
  return SHORTCUTS.find((s) => s.command === commandId)?.keys;
}
