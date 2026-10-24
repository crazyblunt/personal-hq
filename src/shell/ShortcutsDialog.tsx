import { Keyboard } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SHORTCUTS, type ShortcutDef } from '../app/shortcuts';
import { closeShortcuts, useUI } from '../app/ui';
import { Kbd } from '../ui/bits';
import { Button, Input } from '../ui/controls';
import { Dialog } from '../ui/Dialog';

const GROUPS: ShortcutDef['group'][] = ['General', 'Create', 'Navigation', 'Editing', 'My Day'];

/** Every shortcut, grouped, as Kbd chips. Shared by the `?` window and Settings › Keyboard. */
export function ShortcutList({ items }: { items: ShortcutDef[] }) {
  return (
    <div className="flex flex-col gap-2">
      {GROUPS.map((g) => {
        const rows = items.filter((s) => s.group === g);
        if (!rows.length) return null;
        return (
          <section key={g} aria-label={g}>
            <h3 className="mb-0.5 font-mono text-2xs font-semibold tracking-wider text-subtle uppercase">{g}</h3>
            <ul className="flex flex-col gap-0.5 text-sm">
              {rows.map((s) => (
                <li key={s.id} className="flex items-start gap-2">
                  <span className="flex w-28 shrink-0 flex-wrap gap-0.5">
                    {s.keys.map((k, i) => (
                      <Kbd key={`${k}-${i}`}>{k}</Kbd>
                    ))}
                  </span>
                  <span className="text-muted">{s.label}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (open) setFilter('');
  }, [open]);
  const items = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? SHORTCUTS.filter((s) => `${s.label} ${s.keys.join(' ')}`.toLowerCase().includes(q)) : SHORTCUTS;
  }, [filter]);
  return (
    <Dialog open={open} onClose={closeShortcuts} title="Keyboard shortcuts" icon={<Keyboard />} size="lg" footer={<Button onClick={closeShortcuts}>Close</Button>}>
      <div className="flex flex-col gap-2">
        <Input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter shortcuts" aria-label="Filter shortcuts" autoFocus />
        {items.length ? <ShortcutList items={items} /> : <p className="text-sm text-muted">No shortcut matches “{filter}”.</p>}
        <p className="text-2xs text-subtle">Single keys never fire while you are typing in a field or while a window is open.</p>
      </div>
    </Dialog>
  );
}
