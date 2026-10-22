import { useShallow } from 'zustand/react/shallow';
import { useHQ } from '../data/store';
import { NOTE_CATEGORIES } from '../data/types';
import { uniqueStrings } from '../lib/util';
import { Select } from '../ui/controls';

/** Categories already used anywhere, plus the standard ones, for autocomplete. */
export function useCategoryOptions(): string[] {
  const used = useHQ(useShallow((s) => [...s.tasks, ...s.ideas, ...s.notes].map((x) => x.category).filter(Boolean)));
  return uniqueStrings([...NOTE_CATEGORIES, ...used]).sort((a, b) => a.localeCompare(b));
}

export function CategoryDatalist({ id }: { id: string }) {
  const options = useCategoryOptions();
  return (
    <datalist id={id}>
      {options.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}

/** Project picker. Archived projects are hidden unless already selected. */
export function ProjectSelect({ id, value, onChange, emptyLabel = 'No project' }: { id: string; value: string | null; onChange: (id: string | null) => void; emptyLabel?: string }) {
  const projects = useHQ(useShallow((s) => s.projects.filter((p) => p.status !== 'archived' || p.id === value)));
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.status === 'archived' ? ' (archived)' : ''}
        </option>
      ))}
    </Select>
  );
}

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
