/** App-wide UI state: open editors and dialogs, toasts, and recently opened items. */
import { create } from 'zustand';
import type { CalendarEvent, Project, Task } from '../data/types';
import { newId } from '../lib/util';
import { readDevice, writeDevice } from './deviceStorage';

export type EditorState =
  | { kind: 'task'; id?: string; defaults?: Partial<Task> }
  | { kind: 'event'; id?: string; defaults?: Partial<CalendarEvent> }
  | { kind: 'project'; id?: string; defaults?: Partial<Project> }
  | { kind: 'idea'; id: string }
  | { kind: 'bug'; id?: string; projectId: string }
  | { kind: 'prompt'; id?: string };

export type RecentKind = 'task' | 'idea' | 'note' | 'project' | 'event';
export interface RecentItem {
  kind: RecentKind;
  id: string;
  at: string;
}

export interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
  /** One button on the toast, e.g. Undo. */
  action?: { label: string; run: () => void };
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export type CaptureMode = 'idea' | 'task' | 'note';

interface UIState {
  editor: EditorState | null;
  commandOpen: boolean;
  capture: { mode: CaptureMode } | null;
  organizeOpen: boolean;
  confirm: ConfirmRequest | null;
  toasts: Toast[];
  recent: RecentItem[];
  sidebarOpen: boolean;
  /** A task view requested from outside the Tasks page (e.g. the command bar). */
  taskViewRequest: 'myday' | 'upcoming' | 'overdue' | 'all' | 'completed' | null;
  /** My Day is in customize (arrange) mode. */
  myDayCustomize: boolean;
  shortcutsOpen: boolean;
  /** Something outside Explorer asked it to show a search, a tag, or a saved view. */
  explorerRequest: { query?: string; tag?: string; viewId?: string } | null;
}

const RECENT_LIMIT = 20;

export const useUI = create<UIState>(() => ({
  editor: null,
  commandOpen: false,
  capture: null,
  organizeOpen: false,
  confirm: null,
  toasts: [],
  recent: readDevice<RecentItem[]>('recent', []).filter((r) => r && typeof r.id === 'string'),
  sidebarOpen: false,
  taskViewRequest: null,
  myDayCustomize: false,
  shortcutsOpen: false,
  explorerRequest: null,
}));

export const openEditor = (editor: EditorState) => useUI.setState({ editor, commandOpen: false });
export const closeEditor = () => useUI.setState({ editor: null });
export const openCommand = () => useUI.setState({ commandOpen: true });
export const closeCommand = () => useUI.setState({ commandOpen: false });
export const openCapture = (mode: CaptureMode = 'idea') => useUI.setState({ capture: { mode }, commandOpen: false });
export const closeCapture = () => useUI.setState({ capture: null });
export const openOrganize = () => useUI.setState({ organizeOpen: true, commandOpen: false });
export const closeOrganize = () => useUI.setState({ organizeOpen: false });
export const setSidebarOpen = (sidebarOpen: boolean) => useUI.setState({ sidebarOpen });
export const setMyDayCustomize = (myDayCustomize: boolean) => useUI.setState({ myDayCustomize });
export const openShortcuts = () => useUI.setState({ shortcutsOpen: true, commandOpen: false });
export const closeShortcuts = () => useUI.setState({ shortcutsOpen: false });
export const setExplorerRequest = (explorerRequest: UIState['explorerRequest']) => useUI.setState({ explorerRequest });

/** Asks before something destructive. The action only runs if the user confirms in the dialog. */
export const confirmAction = (req: ConfirmRequest) => useUI.setState({ confirm: req });
export const closeConfirm = () => useUI.setState({ confirm: null });

export function toast(message: string, tone: Toast['tone'] = 'success', action?: Toast['action']) {
  const id = newId();
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone, action }] }));
  setTimeout(() => dismissToast(id), action ? 8000 : tone === 'error' ? 6000 : 2800);
}

export function dismissToast(id: string) {
  useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function touchRecent(kind: RecentKind, id: string) {
  const recent = [{ kind, id, at: new Date().toISOString() }, ...useUI.getState().recent.filter((r) => !(r.kind === kind && r.id === id))].slice(0, RECENT_LIMIT);
  useUI.setState({ recent });
  writeDevice('recent', recent);
}

/** True while any modal window is open, so global shortcuts can stand aside. */
export function anyModalOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('dialog[open]') !== null;
}
