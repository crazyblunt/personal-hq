import { Copy, MessageSquareCode, NotebookPen, Pencil, Plus, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { readDevice, writeDevice } from '../../app/deviceStorage';
import { navigate, useRoute } from '../../app/router';
import { openEditor, toast } from '../../app/ui';
import { createNote, recordPromptCopy, updatePrompt, useHQ } from '../../data/store';
import type { Note } from '../../data/types';
import { relativeTime } from '../../lib/dates';
import { matchesQuery } from '../../lib/search';
import { cn, uniqueStrings } from '../../lib/util';
import { EmptyState, PageHeader, ProjectChip, SearchBox, Segmented } from '../../ui/bits';
import { Button, Select } from '../../ui/controls';
import { NoteEditor } from './NoteEditor';

type Tab = 'notes' | 'prompts';
type Sort = 'updated' | 'created' | 'title';

export const noteTitle = (n: Pick<Note, 'title'>) => n.title.trim() || 'Untitled note';

export function NotesPage() {
  const route = useRoute();
  const [tab, setTab] = useState<Tab>(() => readDevice<Tab>('notes-tab', 'notes'));
  const promptCount = useHQ((s) => s.prompts.length);
  const setTabSaved = (t: Tab) => {
    setTab(t);
    writeDevice('notes-tab', t);
  };
  const active = route.id ? 'notes' : tab;
  return (
    <>
      <PageHeader
        title="Notes"
        icon={NotebookPen}
        description="School, coding, plans, meetings, research, checklists, and reference"
        actions={
          <>
            <Segmented
              label="Notes section"
              value={active}
              onChange={(t) => {
                setTabSaved(t);
                if (route.id && t === 'prompts') navigate('notes');
              }}
              options={[
                { value: 'notes', label: 'Notes' },
                { value: 'prompts', label: 'Prompt library', count: promptCount },
              ]}
            />
            {active === 'notes' ? (
              <Button variant="primary" onClick={() => navigate('notes', createNote().id)}>
                <Plus className="size-3.5" aria-hidden="true" /> New note
              </Button>
            ) : (
              <Button variant="primary" onClick={() => openEditor({ kind: 'prompt' })}>
                <Plus className="size-3.5" aria-hidden="true" /> New prompt
              </Button>
            )}
          </>
        }
      />
      {active === 'notes' ? <NotesWorkspace selectedId={route.id} /> : <PromptLibrary />}
    </>
  );
}

function NotesWorkspace({ selectedId }: { selectedId: string | null }) {
  const notes = useHQ((s) => s.notes);
  const selected = useHQ((s) => (selectedId ? s.notes.find((n) => n.id === selectedId) : undefined));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState<Sort>('updated');
  const categories = useMemo(() => uniqueStrings(notes.map((n) => n.category).filter(Boolean)).sort(), [notes]);
  const listed = useMemo(
    () =>
      notes
        .filter((n) => (!category || n.category === category) && (!favorites || n.favorite) && matchesQuery(query, n.title, n.body, n.tags, n.category))
        .sort((a, b) =>
          sort === 'title' ? noteTitle(a).localeCompare(noteTitle(b)) : sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt),
        ),
    [notes, query, category, favorites, sort],
  );

  return (
    <div className="grid items-start gap-2 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside aria-label="Note list" className={cn('flex min-w-0 flex-col border border-line bg-panel', selected && 'max-lg:hidden')}>
        <div className="flex flex-col gap-1 border-b border-line bg-bar p-1.5">
          <SearchBox id="note-search" value={query} onChange={setQuery} placeholder="Search notes" />
          <div className="flex gap-1">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="w-auto min-w-0 flex-1">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort notes" className="w-24 shrink-0">
              <option value="updated">Recent</option>
              <option value="created">Newest</option>
              <option value="title">A–Z</option>
            </Select>
            <Button size="icon" variant={favorites ? 'secondary' : 'ghost'} aria-pressed={favorites} aria-label="Only favorites" title="Only favorites" onClick={() => setFavorites((v) => !v)}>
              <Star className={cn('size-3.5', favorites && 'fill-current text-warn')} />
            </Button>
          </div>
        </div>
        {listed.length === 0 ? (
          <EmptyState icon={NotebookPen} title={notes.length ? 'No notes match' : 'No notes yet'} action={notes.length ? undefined : <Button onClick={() => navigate('notes', createNote().id)}>New note</Button>}>
            {notes.length ? 'Try another search.' : 'Notes save automatically as you type.'}
          </EmptyState>
        ) : (
          <ul className="max-h-[70vh] overflow-y-auto">
            {listed.map((n) => {
              const on = n.id === selectedId;
              const preview = n.body.split('\n').find((l) => l.trim())?.trim() ?? '';
              return (
                <li key={n.id} className="border-b border-line last:border-b-0">
                  <a
                    href={`#notes.${n.id}`}
                    aria-current={on ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('notes', n.id);
                    }}
                    className={cn('block px-2 py-1.5', on ? 'bg-accent-face text-accent-ink' : 'hover:bg-bar')}
                  >
                    <span className="flex items-center gap-1.5">
                      {n.favorite && <Star className={cn('size-3 shrink-0 fill-current', on ? '' : 'text-warn')} aria-label="Favorite" />}
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{noteTitle(n)}</span>
                      <span className={cn('shrink-0 font-mono text-2xs', on ? 'opacity-80' : 'text-subtle')}>{relativeTime(n.updatedAt)}</span>
                    </span>
                    {preview && <span className={cn('block truncate text-xs', on ? 'opacity-80' : 'text-muted')}>{preview}</span>}
                    {(n.category || n.tags.length > 0) && (
                      <span className={cn('block truncate font-mono text-2xs', on ? 'opacity-80' : 'text-subtle')}>
                        {[n.category, ...n.tags.map((t) => `#${t}`)].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      {selected ? (
        <NoteEditor key={selected.id} note={selected} onBack={() => navigate('notes')} />
      ) : (
        <div className="hidden border border-line bg-panel lg:block">
          <EmptyState icon={NotebookPen} title={selectedId ? 'Note not found' : 'Select a note'}>
            {selectedId ? 'It may have been deleted.' : 'Pick a note on the left, or create a new one. Edits save automatically.'}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Reusable prompts, carried over from Agent Command Center. */
function PromptLibrary() {
  const prompts = useHQ((s) => s.prompts);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const tags = useMemo(() => uniqueStrings(prompts.flatMap((p) => p.tags)).sort(), [prompts]);
  const listed = useMemo(
    () =>
      prompts
        .filter((p) => (!tag || p.tags.includes(tag)) && matchesQuery(query, p.title, p.body, p.tags))
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastCopiedAt ?? b.updatedAt).localeCompare(a.lastCopiedAt ?? a.updatedAt)),
    [prompts, query, tag],
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <SearchBox id="prompt-search" value={query} onChange={setQuery} placeholder="Search prompts" className="w-64" />
        <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag" className="w-40">
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
      </div>
      {listed.length === 0 ? (
        <div className="border border-line bg-panel">
          <EmptyState icon={MessageSquareCode} title={prompts.length ? 'No prompts match' : 'No prompts yet'} action={prompts.length ? undefined : <Button onClick={() => openEditor({ kind: 'prompt' })}>New prompt</Button>}>
            {prompts.length ? undefined : 'Save prompts you reuse with coding agents and copy them in one click.'}
          </EmptyState>
        </div>
      ) : (
        <div className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
          {listed.map((p) => (
            <article key={p.id} aria-label={p.title} className="flex min-w-0 flex-col border border-line bg-panel">
              <header className="flex h-7 items-center gap-1.5 border-b border-line bg-bar pr-1 pl-2">
                <button
                  type="button"
                  onClick={() => updatePrompt(p.id, { favorite: !p.favorite })}
                  aria-pressed={p.favorite}
                  aria-label={p.favorite ? `Unfavorite ${p.title}` : `Favorite ${p.title}`}
                  className={p.favorite ? 'text-warn' : 'text-subtle hover:text-warn'}
                >
                  <Star className={cn('size-3.5', p.favorite && 'fill-current')} />
                </button>
                <h3 className="min-w-0 flex-1 truncate text-sm font-bold">{p.title}</h3>
                <Button size="iconSm" variant="ghost" aria-label={`Edit ${p.title}`} onClick={() => openEditor({ kind: 'prompt', id: p.id })}>
                  <Pencil className="size-3" />
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    const ok = await copyText(p.body);
                    if (ok) {
                      recordPromptCopy(p.id);
                      toast('Prompt copied');
                    } else toast('Could not reach the clipboard. Open the prompt and copy the text manually.', 'error');
                  }}
                >
                  <Copy className="size-3" aria-hidden="true" /> Copy
                </Button>
              </header>
              <pre className="max-h-40 overflow-auto px-2 py-1.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-muted">{p.body}</pre>
              <footer className="flex flex-wrap items-center gap-2 border-t border-line px-2 py-1 font-mono text-2xs text-subtle">
                <ProjectChip projectId={p.projectId} />
                {p.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
                <span className="ml-auto">{p.copyCount ? `copied ${p.copyCount}× · ${relativeTime(p.lastCopiedAt ?? p.updatedAt)}` : 'never copied'}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
