import { Keyboard, LayoutGrid, Palette, Settings, SlidersHorizontal } from 'lucide-react';
import { navigate, SECTION_LABEL } from '../../app/router';
import { confirmAction, openShortcuts, setMyDayCustomize } from '../../app/ui';
import { SHORTCUTS } from '../../app/shortcuts';
import { ShortcutList } from '../../shell/ShortcutsDialog';
import { DEFAULT_WIDGETS } from '../../data/defaults';
import { updateSettings, useHQ } from '../../data/store';
import { ACCENTS, PRIORITIES, PRIORITY_LABEL, SECTIONS, THEMES, THEME_LABEL, type AccentName, type Density, type ThemeName } from '../../data/types';
import { cn } from '../../lib/util';
import { PageHeader, Panel, Segmented } from '../../ui/bits';
import { Button, Check, Field, Select } from '../../ui/controls';
import { WIDGETS } from '../myday/widgets';
import { showWidget } from '../myday/WidgetGrid';
import { NAV_ITEMS } from '../../shell/nav';
import { DataSection } from './DataSection';
import { SyncPanel } from './SyncPanel';
import { ClaudePanel } from './ClaudePanel';

/** Small swatch previews: desk, panel, bar, text. */
const THEME_SWATCH: Record<ThemeName, string[]> = {
  charcoal: ['#1f2022', '#2a2b2e', '#333539', '#d8d9d5'],
  graphite: ['#1b1d21', '#24272c', '#2d3137', '#d5d9df'],
  phosphor: ['#0b0e0b', '#111511', '#172017', '#bcdcb2'],
  amber: ['#14100b', '#1b1610', '#231c13', '#ead2a2'],
  classic: ['#aeaea8', '#d6d5d0', '#c4c3bd', '#1a1a19'],
  auto: ['#2a2b2e', '#333539', '#d6d5d0', '#c4c3bd'],
};
const ACCENT_HEX: Record<AccentName, string> = { green: '#4f7a45', amber: '#8a6420', purple: '#5d4f8c', blue: '#3f6491', teal: '#2f716c', rust: '#8c4a32' };


export function SettingsPage() {
  const s = useHQ((st) => st.settings);

  return (
    <>
      <PageHeader title="Settings" icon={Settings} description="Appearance, preferences, dashboard layout, and your data" />
      <div className="grid grid-cols-1 items-start gap-2 xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Panel title="Appearance" icon={<Palette />}>
            <div className="flex flex-col gap-3 p-2">
              <fieldset>
                <legend className="mb-1 font-mono text-2xs tracking-wider text-muted uppercase">Theme</legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {THEMES.map((t) => (
                    <label key={t} className={cn('flex cursor-default items-center gap-2 border px-2 py-1.5 text-sm', s.theme === t ? 'border-accent bg-inset' : 'border-line hover:bg-bar')}>
                      <input type="radio" name="theme" value={t} checked={s.theme === t} onChange={() => updateSettings({ theme: t })} className="sr-only" />
                      <span className="flex border border-lo" aria-hidden="true">
                        {THEME_SWATCH[t].map((c, i) => (
                          <span key={i} className="block size-3.5" style={{ background: c }} />
                        ))}
                      </span>
                      <span className={cn(s.theme === t && 'font-bold')}>{THEME_LABEL[t]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 font-mono text-2xs tracking-wider text-muted uppercase">Accent color</legend>
                <div className="flex flex-wrap gap-1">
                  {ACCENTS.map((a) => (
                    <label key={a} className="relative" title={a}>
                      <input type="radio" name="accent" value={a} checked={s.accent === a} onChange={() => updateSettings({ accent: a })} className="peer sr-only" aria-label={`${a} accent`} />
                      <span className={cn('flex items-center gap-1.5 px-2 py-1 text-xs capitalize peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-dotted', s.accent === a ? 'bevel-in bg-inset font-bold' : 'bevel-out bg-raised')}>
                        <span className="block size-3 border border-black/40" style={{ background: ACCENT_HEX[a] }} />
                        {a}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <span className="mb-1 block font-mono text-2xs tracking-wider text-muted uppercase">Density</span>
                <Segmented<Density>
                  label="Density"
                  value={s.density}
                  onChange={(density) => updateSettings({ density })}
                  options={[
                    { value: 'compact', label: 'Compact' },
                    { value: 'comfortable', label: 'Comfortable' },
                  ]}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Preferences" icon={<SlidersHorizontal />}>
            <div className="grid gap-3 p-2 sm:grid-cols-2">
              <Field label="Startup page" htmlFor="pref-startup" hint="Opens when you load Personal HQ without a link">
                <Select id="pref-startup" value={s.startupPage} onChange={(e) => updateSettings({ startupPage: e.target.value as typeof s.startupPage })}>
                  {SECTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {SECTION_LABEL[sec]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Default task priority" htmlFor="pref-priority">
                <Select id="pref-priority" value={s.defaultPriority} onChange={(e) => updateSettings({ defaultPriority: e.target.value as typeof s.defaultPriority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="New tasks start in" htmlFor="pref-status" hint="Quick capture always uses Inbox">
                <Select id="pref-status" value={s.defaultTaskStatus} onChange={(e) => updateSettings({ defaultTaskStatus: e.target.value as 'inbox' | 'planned' })}>
                  <option value="planned">Planned</option>
                  <option value="inbox">Inbox</option>
                </Select>
              </Field>
              <Field label="Week starts on" htmlFor="pref-week">
                <Select id="pref-week" value={String(s.weekStartsOn)} onChange={(e) => updateSettings({ weekStartsOn: e.target.value === '0' ? 0 : 1 })}>
                  <option value="1">Monday</option>
                  <option value="0">Sunday</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Check checked={s.clock24h} onChange={(v) => updateSettings({ clock24h: v })} label="24-hour clock" /> Use a 24-hour clock
              </label>
            </div>
          </Panel>

          <Panel
            title="My Day widgets"
            icon={<LayoutGrid />}
            tools={
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    setMyDayCustomize(true);
                    navigate('myday');
                  }}
                >
                  Arrange on My Day
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    confirmAction({
                      title: 'Reset the dashboard layout?',
                      body: 'Widget positions, sizes, and visibility go back to the defaults. Your data is not affected.',
                      confirmLabel: 'Reset layout',
                      danger: false,
                      onConfirm: () => updateSettings({ widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })) }),
                    })
                  }
                >
                  Reset layout
                </Button>
              </>
            }
          >
            <ul className="p-1">
              {s.widgets.map((w) => (
                <li key={w.id} className="flex items-center gap-2 border-b border-line px-1 py-1 last:border-b-0">
                  <Check checked={w.enabled} onChange={(v) => updateSettings({ widgets: v ? showWidget(s.widgets, w.id) : s.widgets.map((x) => (x.id === w.id ? { ...x, enabled: false } : x)) })} label={`Show ${WIDGETS[w.id].title}`} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', !w.enabled && 'text-subtle')}>{WIDGETS[w.id].title}</span>
                    <span className="block truncate text-xs text-subtle">{WIDGETS[w.id].description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Keyboard"
            icon={<Keyboard />}
            tools={
              <Button size="sm" onClick={openShortcuts}>
                Show all shortcuts (?)
              </Button>
            }
          >
            <div className="p-2">
              <ShortcutList items={SHORTCUTS.filter((sc) => sc.group !== 'Navigation')} />
              <p className="mt-2 border-t border-line pt-1 text-2xs text-subtle">Go to a section: G then {NAV_ITEMS.map((n) => `${n.key.toUpperCase()} ${n.label}`).join(' · ')}</p>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-2">
          <SyncPanel />
          <DataSection />
          <ClaudePanel />
        </div>
      </div>
    </>
  );
}
