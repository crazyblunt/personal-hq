/**
 * Hash routing with plain tokens (`#tasks`, `#projects.<id>`), which keep
 * working as deep links when the app runs inside a Claude artifact.
 * Settings uses `#prefs` because the artifact viewer reserves `#settings`.
 */
import { create } from 'zustand';
import { SECTIONS, type SectionId } from '../data/types';

export interface Route {
  section: SectionId;
  id: string | null;
}

export const SECTION_LABEL: Record<SectionId, string> = {
  myday: 'My Day',
  inbox: 'Inbox',
  tasks: 'Tasks',
  calendar: 'Calendar',
  ideas: 'Ideas',
  projects: 'Projects',
  notes: 'Notes',
  activity: 'Activity',
  utilities: 'Utilities',
  prefs: 'Settings',
};

export function parseHash(hash: string): Route | null {
  const token = decodeURIComponent(hash.replace(/^#\/?/, ''));
  if (!token) return null;
  const dot = token.indexOf('.');
  const section = (dot === -1 ? token : token.slice(0, dot)) as SectionId;
  if (!(SECTIONS as readonly string[]).includes(section)) return null;
  const id = dot === -1 ? null : token.slice(dot + 1) || null;
  return { section, id };
}

export const routeHash = (r: Route) => `#${r.section}${r.id ? `.${r.id}` : ''}`;

export const useRoute = create<Route>(() => ({ section: 'myday', id: null }));

export function navigate(section: SectionId, id: string | null = null, opts: { replace?: boolean } = {}) {
  const next = { section, id };
  const cur = useRoute.getState();
  if (cur.section === section && cur.id === id) return;
  useRoute.setState(next);
  try {
    const hash = routeHash(next);
    if (opts.replace) history.replaceState(null, '', hash);
    else history.pushState(null, '', hash);
  } catch {
    /* some sandboxes refuse history changes; in-app state still moves */
  }
}

/** Starts routing: uses the URL hash if it names a section, otherwise the startup page. */
export function startRouter(startup: SectionId): () => void {
  const initial = parseHash(location.hash) ?? { section: startup, id: null };
  useRoute.setState(initial);
  try {
    history.replaceState(null, '', routeHash(initial));
  } catch {
    /* ignore */
  }
  const sync = () => {
    const r = parseHash(location.hash);
    if (r) useRoute.setState(r);
  };
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
  return () => {
    window.removeEventListener('popstate', sync);
    window.removeEventListener('hashchange', sync);
  };
}
