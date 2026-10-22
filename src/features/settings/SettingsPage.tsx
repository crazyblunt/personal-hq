import { ArrowDown, ArrowUp, Bot, Keyboard, LayoutGrid, Palette, Settings, SlidersHorizontal } from 'lucide-react';
import { MOD_KEY } from '../../app/platform';
import { SECTION_LABEL } from '../../app/router';
import { updateSettings, useHQ } from '../../data/store';
import { ACCENTS, PRIORITIES, PRIORITY_LABEL, SECTIONS, THEMES, THEME_LABEL, WIDGET_SIZES, type AccentName, type Density, type ThemeName } from '../../data/types';
import { providers } from '../../organize/provider';
import { cn } from '../../lib/util';
import { Kbd, PageHeader, Panel, Segmented } from '../../ui/bits';
import { Button, Check, Field, Select } from '../../ui/controls';
import { WIDGETS } from '../myday/widgets';
import { NAV_ITEMS } from '../../shell/nav';
import { DataSection } from './DataSection';

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

const SHORTCUTS: [string[], string][] = [
  [[MOD_KEY, 'K'], 'Open the command bar (search, navigate, create, run commands)'],
  [['/'], 'Open the command bar when not typing in a field'],
  [['C'], 'Quick capture when not typing in a field'],
  [['G', '…'], 'Go to a section: G then D My Day, I Inbox, T Tasks, C Calendar, E Ideas, P Projects, N Notes, A Activity, U Utilities, S Settings'],
  [['Enter'], 'Save quick-add, capture, and command bar entries'],
  [['Esc'], 'Close the command bar or a window (asks first if you have unsaved edits)'],
  [['↑', '↓'], 'Move through command bar results'],
];

export function SettingsPage() {
  const s = useHQ((st) => st.settings);
  const move = (i: number, dir: -1 | 1) => {
    const next = [...s.widgets];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    updateSettings({ widgets: next });
  };

  return (
    <>
      <PageHeader title="Settings" icon={Settings} description="Appearance, preferences, dashboard layout, and your data" />
      <div className="grid items-start gap-2 xl:grid-cols-2">
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

          <Panel title="My Day widgets" icon={<LayoutGrid />}>
            <ul className="p-1">
              {s.widgets.map((w, i) => (
                <li key={w.id} className="flex items-center gap-2 border-b border-line px-1 py-1 last:border-b-0">
                  <Check checked={w.enabled} onChange={(v) => updateSettings({ widgets: s.widgets.map((x) => (x.id === w.id ? { ...x, enabled: v } : x)) })} label={`Show ${WIDGETS[w.id].title}`} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', !w.enabled && 'text-subtle')}>{WIDGETS[w.id].title}</span>
                    <span className="block truncate text-xs text-subtle">{WIDGETS[w.id].description}</span>
                  </span>
                  <Select value={w.size} onChange={(e) => updateSettings({ widgets: s.widgets.map((x) => (x.id === w.id ? { ...x, size: e.target.value as typeof w.size } : x)) })} aria-label={`${WIDGETS[w.id].title} width`} className="h-6 w-24 text-xs">
                    {WIDGET_SIZES.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz === 'sm' ? 'Small' : sz === 'md' ? 'Medium' : 'Large'}
                      </option>
                    ))}
                  </Select>
                  <Button size="iconSm" variant="ghost" aria-label={`Move ${WIDGETS[w.id].title} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button size="iconSm" variant="ghost" aria-label={`Move ${WIDGETS[w.id].title} down`} disabled={i === s.widgets.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Keyboard" icon={<Keyboard />}>
            <ul className="flex flex-col gap-1 p-2 text-sm">
              {SHORTCUTS.map(([keys, what]) => (
                <li key={what} className="flex items-start gap-2">
                  <span className="flex w-24 shrink-0 gap-0.5">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                  <span className="text-muted">{what}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-2 py-1 text-2xs text-subtle">Navigation keys: {NAV_ITEMS.map((n) => `${n.key.toUpperCase()} ${n.label}`).join(' · ')}</p>
          </Panel>
        </div>

        <div className="flex flex-col gap-2">
          <DataSection />
          <Panel title="Organization helpers" icon={<Bot />}>
            <div className="flex flex-col gap-2 p-2 text-sm">
              <p className="text-muted">
                Tag, category, similarity, to-do, and checklist suggestions are <strong className="text-fg">local rules</strong>: keyword lists, word overlap, and fixed templates that run in this browser. They are labeled as local suggestions and never claim to come from an AI model.
              </p>
              <ul className="border border-line bg-inset">
                {providers.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 px-2 py-1">
                    <span className="mt-1 size-2 shrink-0 bg-ok-fill" aria-hidden="true" />
                    <span>
                      <span className="block font-bold">{p.label}</span>
                      <span className="block text-xs text-muted">{p.description}</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-start gap-2 border-t border-line px-2 py-1 text-subtle">
                  <span className="mt-1 size-2 shrink-0 bg-line-strong" aria-hidden="true" />
                  <span>
                    <span className="block font-bold">AI provider: not connected</span>
                    <span className="block text-xs">A future integration would run through your own server so API keys never reach this page, and would only be used after you turn it on here.</span>
                  </span>
                </li>
              </ul>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
