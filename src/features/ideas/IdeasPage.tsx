import { Lightbulb, ScanSearch, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { readDevice, writeDevice } from '../../app/deviceStorage';
import { navigate, useRoute } from '../../app/router';
import { openEditor, openOrganize } from '../../app/ui';
import { useHQ } from '../../data/store';
import { IDEA_KINDS, IDEA_KIND_LABEL } from '../../data/types';
import { matchesQuery } from '../../lib/search';
import { uniqueStrings } from '../../lib/util';
import { EmptyState, PageHeader, SearchBox, Segmented } from '../../ui/bits';
import { Button, Select } from '../../ui/controls';
import { CaptureBox, IdeaCard } from './IdeaParts';

type Show = 'all' | 'inbox' | 'favorites' | 'archived';

export function IdeasPage() {
  const route = useRoute();
  const ideas = useHQ((s) => s.ideas);
  const [show, setShow] = useState<Show>(() => readDevice<Show>('ideas-show', 'all'));
  const [kind, setKind] = useState('');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (route.id) {
      openEditor({ kind: 'idea', id: route.id });
      navigate('ideas', null, { replace: true });
    }
  }, [route.id]);

  const tags = useMemo(() => uniqueStrings(ideas.flatMap((i) => i.tags)).sort((a, b) => a.localeCompare(b)), [ideas]);
  const counts = useMemo(
    () => ({
      all: ideas.filter((i) => !i.archived).length,
      inbox: ideas.filter((i) => i.inbox && !i.archived).length,
      favorites: ideas.filter((i) => i.favorite && !i.archived).length,
      archived: ideas.filter((i) => i.archived).length,
    }),
    [ideas],
  );
  const listed = useMemo(
    () =>
      ideas
        .filter((i) => (show === 'archived' ? i.archived : !i.archived))
        .filter((i) => (show === 'inbox' ? i.inbox : show === 'favorites' ? i.favorite : true))
        .filter((i) => (!kind || i.kind === kind) && (!tag || i.tags.some((t) => t.toLowerCase() === tag.toLowerCase())))
        .filter((i) => matchesQuery(query, i.title, i.body, i.url, i.tags, i.category))
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt.localeCompare(a.createdAt)),
    [ideas, show, kind, tag, query],
  );
  const filtered = Boolean(kind || tag || query);

  return (
    <>
      <PageHeader
        title="Ideas"
        icon={Lightbulb}
        description="Brain dump: capture first, organize later"
        actions={
          <Button onClick={openOrganize} title="Rule-based suggestions for tags, links, and tasks">
            <ScanSearch className="size-3.5" aria-hidden="true" /> Organize review
          </Button>
        }
      />
      <CaptureBox />
      <div className="mb-2 flex flex-col gap-1.5 lg:flex-row lg:items-center">
        <Segmented
          label="Show"
          value={show}
          onChange={(v) => {
            setShow(v);
            writeDevice('ideas-show', v);
          }}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'inbox', label: 'Inbox', count: counts.inbox },
            { value: 'favorites', label: 'Favorites', count: counts.favorites },
            { value: 'archived', label: 'Archived', count: counts.archived },
          ]}
        />
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-1 sm:items-center">
          <SearchBox id="idea-search" value={query} onChange={setQuery} placeholder="Search ideas" className="col-span-2 sm:w-56" />
          <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by kind" className="sm:w-32">
            <option value="">Any kind</option>
            {IDEA_KINDS.map((k) => (
              <option key={k} value={k}>
                {IDEA_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag" className="sm:w-36">
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </Select>
          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setKind('');
                setTag('');
                setQuery('');
              }}
            >
              <X className="size-3.5" aria-hidden="true" /> Clear
            </Button>
          )}
        </div>
      </div>
      {listed.length === 0 ? (
        <div className="border border-line bg-panel">
          <EmptyState icon={Lightbulb} title={filtered ? 'No ideas match' : show === 'archived' ? 'No archived ideas' : 'No ideas yet'}>
            {filtered ? 'Try another search or clear the filters.' : 'Type anything in the box above and press Enter. Tags written as #tag are picked up automatically.'}
          </EmptyState>
        </div>
      ) : (
        <div className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {listed.map((i) => (
            <IdeaCard key={i.id} idea={i} inboxActions />
          ))}
        </div>
      )}
    </>
  );
}
