import { Pencil, Tags, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { confirmAction, toast } from '../../app/ui';
import { useHQ } from '../../data/store';
import { removeTag, renameTag, tagIndex, type TagStat } from '../../data/tags';
import { cleanTag } from '../../lib/util';
import { EmptyState } from '../../ui/bits';
import { Button } from '../../ui/controls';

function RenameField({ stat, all, onDone }: { stat: TagStat; all: TagStat[]; onDone: () => void }) {
  const [value, setValue] = useState(stat.tag);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const next = cleanTag(value);
    if (!next) return setError('Use letters, numbers, - or _ (up to 40).');
    if (next === stat.tag) return onDone();
    const merge = all.some((t) => t.tag.toLowerCase() === next.toLowerCase() && t.tag.toLowerCase() !== stat.tag.toLowerCase());
    const n = stat.total;
    confirmAction({
      title: merge ? 'Merge tags?' : 'Rename tag?',
      body: merge ? `Merge #${stat.tag} into #${next} on ${n} item${n === 1 ? '' : 's'}?` : `Rename #${stat.tag} to #${next} on ${n} item${n === 1 ? '' : 's'}?`,
      confirmLabel: merge ? 'Merge' : 'Rename',
      danger: false,
      onConfirm: () => {
        const changed = renameTag(stat.tag, next);
        toast(`${merge ? 'Merged' : 'Renamed'} #${stat.tag} on ${changed} item${changed === 1 ? '' : 's'}`);
      },
    });
    onDone();
  };
  return (
    <span className="flex min-w-0 flex-col">
      <input
        autoFocus
        onFocus={(e) => e.target.select()}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onDone();
          }
        }}
        onBlur={() => !error && onDone()}
        aria-label={`New name for #${stat.tag}`}
        aria-invalid={error ? true : undefined}
        className="h-6 w-full bevel-in bg-inset px-1.5 font-mono text-xs"
      />
      {error && (
        <span role="alert" className="text-2xs text-bad">
          {error}
        </span>
      )}
    </span>
  );
}

/** Every tag across tasks, notes, ideas, and projects, with rename/merge and remove. */
export function TagsPanel({ onPick }: { onPick: (tag: string) => void }) {
  const data = useHQ(useShallow((s) => ({ tasks: s.tasks, notes: s.notes, ideas: s.ideas, projects: s.projects })));
  const stats = useMemo(() => tagIndex(data), [data]);
  const [editing, setEditing] = useState<string | null>(null);
  if (!stats.length)
    return (
      <div className="border border-line bg-panel">
        <EmptyState icon={Tags} title="No tags yet">
          Add tags to tasks, notes, ideas, or projects (or write #tags in captured ideas) and they all show up here.
        </EmptyState>
      </div>
    );
  return (
    <div className="overflow-auto border border-line bg-panel">
      <table aria-label="Tags" className="w-full border-collapse text-sm">
        <thead className="bg-bar font-mono text-2xs tracking-wider text-subtle uppercase">
          <tr>
            <th scope="col" className="h-6 border-b border-line px-2 text-left font-normal">
              Tag
            </th>
            <th scope="col" className="w-14 border-b border-line px-2 text-right font-normal">
              Total
            </th>
            {['Tasks', 'Notes', 'Ideas', 'Projects'].map((h) => (
              <th key={h} scope="col" className="hidden w-16 border-b border-line px-2 text-right font-normal sm:table-cell">
                {h}
              </th>
            ))}
            <th scope="col" className="w-16 border-b border-line px-2 font-normal">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.tag.toLowerCase()} className="border-b border-line last:border-b-0 hover:bg-bar">
              <td className="px-2 py-0.5">
                {editing === s.tag ? (
                  <RenameField stat={s} all={stats} onDone={() => setEditing(null)} />
                ) : (
                  <button type="button" onClick={() => onPick(s.tag)} className="font-mono text-xs text-purple hover:underline" title={`Show everything tagged #${s.tag}`}>
                    #{s.tag}
                  </button>
                )}
              </td>
              <td className="px-2 py-0.5 text-right font-mono text-xs tabular">{s.total}</td>
              {(['task', 'note', 'idea', 'project'] as const).map((k) => (
                <td key={k} className="hidden px-2 py-0.5 text-right font-mono text-2xs text-subtle tabular sm:table-cell">
                  {s.byKind[k] || ''}
                </td>
              ))}
              <td className="px-1 py-0.5">
                <span className="flex justify-end gap-0.5">
                  <Button size="iconSm" variant="ghost" aria-label={`Rename #${s.tag}`} title="Rename or merge" onClick={() => setEditing(s.tag)}>
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={`Remove #${s.tag}`}
                    title="Remove from every item"
                    onClick={() =>
                      confirmAction({
                        title: 'Remove this tag?',
                        body: `Remove #${s.tag} from ${s.total} item${s.total === 1 ? '' : 's'}? The items themselves are kept.`,
                        confirmLabel: 'Remove tag',
                        onConfirm: () => {
                          const n = removeTag(s.tag);
                          toast(`Removed #${s.tag} from ${n} item${n === 1 ? '' : 's'}`);
                        },
                      })
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
