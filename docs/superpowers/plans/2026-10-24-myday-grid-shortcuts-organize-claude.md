# My Day grid, shortcuts, organization, Claude: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-form My Day grid, a single shortcut registry with a menu bar and `?` panel, cross-item links with an Explorer table and Tags page, and optional Claude help (copy/paste or live through a Supabase function) with preview, validation, and undo.

**Architecture:** Pure, unit-tested logic modules (`src/lib/grid.ts`, `src/app/shortcuts.ts`, `src/data/linking.ts`, `src/data/tags.ts`, `src/data/explorer.ts`, `src/data/batches.ts`, `src/ai/*`) with thin React components on top. All data changes go through store actions; new record fields are additive and filled by the normalizers. The live Claude path is a Deno Edge Function whose request logic lives in a runtime-free `handler.ts` so Vitest can test it.

**Tech Stack:** React 19, TypeScript 7, Tailwind 4, Vite 8, zustand 5, Vitest 5 + Testing Library + jsdom, lucide-react; Supabase Edge Functions (Deno) with `npm:@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-24-myday-grid-shortcuts-organize-claude-design.md`

## Global Constraints

- Node is not on PATH: start every shell with `export PATH="$HOME/.local/node/bin:$PATH"`.
- Verify with `npm test`, `npm run typecheck`, `npm run build` before each commit. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never delete or rewrite stored user data; every new field is optional/defaulted in the normalizers; no `SCHEMA_VERSION` bump; `acc:*` keys untouched.
- zustand selectors must return stable values (`useShallow` or primitives). Don't guard effects with "already ran" refs (StrictMode).
- Keep the retro look: existing tokens (`bg-panel`, `bg-bar`, `bevel-out`, `bevel-in`, `font-mono text-2xs uppercase` labels), compact rows (`h-6`/`h-7`), no new UI libraries.
- Grid: 12 columns at `min-width: 1024px`; row `2rem`; gap `0.5rem`.
- Single-key shortcuts never fire in inputs, textareas, selects, contenteditable, during IME composition, or while a dialog is open. No browser-reserved combos (`⌘N`, `⌘T`, `⌘W`, `⌘L`).
- Claude: the app must work fully without a key, Supabase setup, or paid API. Results are labeled "Claude suggestion"; local rules stay "local suggestions". Default model `claude-opus-5-5`; refusal fallback on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) for models that support it.
- Device-only, never synced or backed up: AI access code (`phq:device:ai-code`), undo batches (adapter aux `undo`).
- Do not claim the function is deployed or working unless deploy and `ping` actually succeed. Push to `main` only after all stages pass and Coda confirms.

## Review Focus

- Widget rectangles that are off-grid or nonsense (negative `x`, `x + w > 12`, `w = 0`, fractional values, arriving from another device) should be clamped or re-placed, never crash or overlap. Test in Task 1 and Task 2.
- Shortcut keys pressed while a `<select>` has focus or during IME composition (`isComposing`) should do nothing. Test in Task 6.
- A pasted Claude reply with prose before/after the JSON, a ```json fence, or a second JSON block should yield the first valid object; a reply with no valid JSON is rejected with "Not valid JSON" and nothing changes. Test in Task 17.
- Renaming a tag to a case variant of itself (`School` → `school`) should change the casing everywhere without duplicating or dropping the tag. Test in Task 13.
- Undo after sync delivered a newer version of a changed item should skip that item and report it, never overwrite the newer edit. Test in Task 19.

---

# Stage 1: My Day grid

### Task 1: Grid engine

**Files:**
- Create: `src/lib/grid.ts`
- Test: `src/lib/grid.test.ts`

**Interfaces:**
- Produces:
  - `GRID_COLS = 12`
  - `interface Rect { x: number; y: number; w: number; h: number }`
  - `interface GridItem extends Rect { id: string }`
  - `interface SizeHint { w: number; h: number; minW: number; minH: number }`
  - `collides(a: Rect, b: Rect): boolean`
  - `clampRect(r: Rect, min: { minW: number; minH: number }, cols = GRID_COLS): Rect`
  - `firstFit(taken: Rect[], w: number, h: number, cols = GRID_COLS): { x: number; y: number }`
  - `pushDown(items: GridItem[], fixedId: string): GridItem[]`
  - `moveTo(items: GridItem[], id: string, to: { x: number; y: number }, min: (id: string) => { minW: number; minH: number }, cols = GRID_COLS): GridItem[]`
  - `resizeTo(items: GridItem[], id: string, size: { w: number; h: number }, min: (id: string) => { minW: number; minH: number }, cols = GRID_COLS): GridItem[]`
  - `tidy(items: GridItem[]): GridItem[]`
  - `stackOrder<T extends Rect>(items: T[]): T[]`
  - `cellFromPoint(p: { x: number; y: number }, grid: { left: number; top: number; width: number }, rowPx: number, gapPx: number, cols = GRID_COLS): { x: number; y: number }`

- [ ] **Step 1: Write the failing tests** in `src/lib/grid.test.ts`:

```ts
it('detects overlap but not edge contact', () => {
  expect(collides({ x: 0, y: 0, w: 4, h: 4 }, { x: 3, y: 3, w: 2, h: 2 })).toBe(true);
  expect(collides({ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 2, h: 2 })).toBe(false);
});
it('clamps off-grid and undersized rects', () => {
  expect(clampRect({ x: -2, y: -1, w: 20, h: 1 }, { minW: 3, minH: 4 })).toEqual({ x: 0, y: 0, w: 12, h: 4 });
  expect(clampRect({ x: 10, y: 2.6, w: 4, h: 5.2 }, { minW: 2, minH: 2 })).toEqual({ x: 8, y: 3, w: 4, h: 5 });
});
it('finds the first row-major spot that fits', () => {
  expect(firstFit([{ x: 0, y: 0, w: 8, h: 4 }], 4, 2)).toEqual({ x: 8, y: 0 });
  expect(firstFit([{ x: 0, y: 0, w: 12, h: 4 }], 6, 2)).toEqual({ x: 0, y: 4 });
});
it('moving onto a widget pushes it (and anything it then hits) down', () => {
  const items = [ { id: 'a', x: 0, y: 0, w: 6, h: 4 }, { id: 'b', x: 6, y: 0, w: 6, h: 4 }, { id: 'c', x: 6, y: 4, w: 6, h: 2 } ];
  const out = moveTo(items, 'a', { x: 6, y: 0 }, () => ({ minW: 1, minH: 1 }));
  expect(out.find((i) => i.id === 'a')).toMatchObject({ x: 6, y: 0 });
  expect(out.find((i) => i.id === 'b')).toMatchObject({ x: 6, y: 4 });
  expect(out.find((i) => i.id === 'c')).toMatchObject({ x: 6, y: 8 });
});
it('leaves gaps: nothing floats up after a move', () => {
  const out = moveTo([{ id: 'a', x: 0, y: 0, w: 4, h: 4 }], 'a', { x: 0, y: 6 }, () => ({ minW: 1, minH: 1 }));
  expect(out[0]).toMatchObject({ y: 6 });
});
it('resizes within limits and pushes overlapped widgets down', () => {
  const items = [ { id: 'a', x: 0, y: 0, w: 4, h: 4 }, { id: 'b', x: 0, y: 4, w: 4, h: 2 } ];
  const out = resizeTo(items, 'a', { w: 40, h: 6 }, () => ({ minW: 3, minH: 3 }));
  expect(out.find((i) => i.id === 'a')).toMatchObject({ w: 12, h: 6 });
  expect(out.find((i) => i.id === 'b')).toMatchObject({ y: 6 });
});
it('tidy closes vertical gaps without reordering', () => {
  const out = tidy([ { id: 'a', x: 0, y: 3, w: 4, h: 2 }, { id: 'b', x: 0, y: 9, w: 4, h: 2 } ]);
  expect(out.map((i) => [i.id, i.y])).toEqual([['a', 0], ['b', 2]]);
});
it('stacks in reading order', () => {
  expect(stackOrder([{ x: 6, y: 0, w: 1, h: 1, id: 'b' }, { x: 0, y: 2, w: 1, h: 1, id: 'c' }, { x: 0, y: 0, w: 1, h: 1, id: 'a' }]).map((i) => i.id)).toEqual(['a', 'b', 'c']);
});
it('maps a pointer position to a cell', () => {
  // 12 columns over 1200px with 8px gaps; rows 32px + 8px gap.
  expect(cellFromPoint({ x: 205, y: 85 }, { left: 0, top: 0, width: 1200 }, 32, 8)).toEqual({ x: 2, y: 2 });
  expect(cellFromPoint({ x: -50, y: -50 }, { left: 0, top: 0, width: 1200 }, 32, 8)).toEqual({ x: 0, y: 0 });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/grid.test.ts` — expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/grid.ts`.** All functions are pure and return new arrays/objects. `clampRect` rounds to integers, then clamps `w` to `[minW, cols]`, `h` to `≥ minH`, `x` to `[0, cols - w]`, `y` to `≥ 0`. `moveTo`/`resizeTo` clamp the target rect, then call `pushDown`. `pushDown` algorithm:

```
settled = [fixed item]
for item of others sorted by (y, x):
  while any s in settled collides(item, s):
    item.y = max over colliding s of (s.y + s.h)
  settled.push(item)
```

`tidy` sorts by (y, x) and lowers each item's `y` while `y > 0` and the rect one row up collides with no already-placed item. `cellFromPoint`: `colW = (width - gap*(cols-1)) / cols`; `x = floor((p.x - left) / (colW + gap))`, `y = floor((p.y - top) / (rowPx + gap))`, both clamped to ≥ 0 and `x ≤ cols - 1`.

- [ ] **Step 4: Run** `npx vitest run src/lib/grid.test.ts` — expected: PASS.

- [ ] **Step 5: Commit** — `git add src/lib/grid.* && git commit -m "Grid engine for the My Day layout"`.

### Task 2: Widget positions in the data model and migration

**Files:**
- Modify: `src/data/types.ts` (`WidgetPref`), `src/data/defaults.ts`, `src/data/normalize.ts` (`widgets()`)
- Test: `src/data/widgets.test.ts`

**Interfaces:**
- Consumes: Task 1 (`firstFit`, `clampRect`, `Rect`, `SizeHint`).
- Produces:
  - `WidgetPref` gains optional `x?: number; y?: number; w?: number; h?: number`.
  - `defaults.ts`: `WIDGET_SIZE_HINTS: Record<WidgetId, SizeHint>`, `WIDTH_FOR_SIZE: Record<WidgetSize, number> = { sm: 4, md: 8, lg: 12 }`, `sizeForWidth(w: number): WidgetSize` (≤ 4 → `sm`, ≤ 8 → `md`, else `lg`), `placeWidgets(widgets: WidgetPref[]): WidgetPref[]` (fills missing rects of **enabled** widgets in list order with `w = WIDTH_FOR_SIZE[size]`, `h = hint.h`, via `firstFit` against already-placed enabled widgets; clamps existing rects with the hint minimums; hidden widgets keep their rect or none).
  - `DEFAULT_WIDGETS` is the current list passed through `placeWidgets` (so defaults have positions).

Size hints (from the spec): today 6×12 min 4×6; deadlines, projects, captures 6×8 min 3×4; activity-graph 6×6 min 4×4; recent-activity 4×8 min 3×4; quick-actions 4×5 min 3×4; focus 3×6 min 3×5; clock, countdowns, shortcuts, random-idea 3×5 min 2×3.

- [ ] **Step 1: Write the failing tests** in `src/data/widgets.test.ts`:

```ts
it('migrates S/M/L widgets without positions into the grid in order', () => {
  const s = normalizeSettings({ widgets: [ { id: 'today', enabled: true, size: 'md' }, { id: 'deadlines', enabled: true, size: 'sm' }, { id: 'clock', enabled: false, size: 'sm' } ] });
  const byId = Object.fromEntries(s.widgets.map((w) => [w.id, w]));
  expect(byId.today).toMatchObject({ x: 0, y: 0, w: 8, h: 12 });
  expect(byId.deadlines).toMatchObject({ x: 8, y: 0, w: 4, h: 8 });
  expect(byId.clock.x).toBeUndefined();
});
it('keeps saved positions and is deterministic across loads', () => {
  const raw = { widgets: [{ id: 'today', enabled: true, size: 'md', x: 2, y: 3, w: 6, h: 10 }] };
  expect(normalizeSettings(raw).widgets[0]).toMatchObject({ x: 2, y: 3, w: 6, h: 10 });
  expect(normalizeSettings(raw)).toEqual(normalizeSettings(raw));
});
it('drops nonsense rects and re-places the widget', () => {
  const s = normalizeSettings({ widgets: [{ id: 'today', enabled: true, size: 'sm', x: 'a', y: -4, w: 0, h: 3 }] });
  expect(s.widgets[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 12 });
});
it('derives size from width', () => {
  expect([3, 4, 5, 8, 9, 12].map(sizeForWidth)).toEqual(['sm', 'sm', 'md', 'md', 'lg', 'lg']);
});
it('default widgets all have positions when enabled', () => {
  expect(DEFAULT_WIDGETS.filter((w) => w.enabled).every((w) => typeof w.x === 'number' && typeof w.h === 'number')).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run src/data/widgets.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement.** In `normalize.ts` `widgets()`, read `x, y, w, h` only when all four are finite numbers with `w ≥ 1`, `h ≥ 1`, `x ≥ 0`, `y ≥ 0`; otherwise omit all four; then return `placeWidgets(out)`. `normalize.ts` already imports from `defaults.ts`; `defaults.ts` imports from `../lib/grid`.

- [ ] **Step 4: Run** `npm test` — expected: all PASS (existing settings tests still pass).

- [ ] **Step 5: Commit** — `git commit -am "Widget grid positions with migration from S/M/L sizes"` (add the new test file).

### Task 3: Grid rendering and narrow-screen stacking

**Files:**
- Create: `src/app/media.ts`, `src/features/myday/WidgetGrid.tsx`
- Modify: `src/features/myday/MyDayPage.tsx`, `src/ui/bits.tsx` (`Panel`), `src/test/helpers.ts`
- Test: `src/test/app.test.tsx` (new `describe('My Day grid')`)

**Interfaces:**
- Consumes: `WIDGET_SIZE_HINTS`, `stackOrder`, `WidgetPref` rects (Task 2).
- Produces:
  - `useMediaQuery(query: string): boolean` (false when `window.matchMedia` is missing); `WIDE_QUERY = '(min-width: 1024px)'`.
  - `Panel` gains `headerProps?: HTMLAttributes<HTMLElement>` spread onto its `<header>`.
  - `WidgetGrid({ widgets, customizing, onChange }: { widgets: WidgetPref[]; customizing: boolean; onChange: (next: WidgetPref[]) => void })`.
  - Test helper `mockMatchMedia(matches: boolean): void` (installs a `window.matchMedia` stub).

- [ ] **Step 1: Write the failing tests:**

```ts
it('lays widgets out on the 12-column grid at desktop width', async () => {
  mockMatchMedia(true);
  await renderApp();
  const today = screen.getByRole('region', { name: 'Today' }).parentElement!;
  expect(today.style.gridColumn).toBe('1 / span 8');
  expect(today.style.gridRow).toBe('1 / span 12');
});
it('stacks widgets in reading order on narrow screens', async () => {
  mockMatchMedia(false);
  await renderApp();
  const titles = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? within(r).getByRole('heading').textContent);
  expect(titles.slice(0, 3)).toEqual(['Today', 'Quick actions', 'Deadlines & events']);
});
```

(Give each widget `Panel` an accessible name via `titleId` so `getByRole('region', { name })` works.)

- [ ] **Step 2: Run** `npx vitest run src/test/app.test.tsx -t "My Day grid"` — expected: FAIL.

- [ ] **Step 3: Implement `WidgetGrid`.** Wide: a container with `display: grid; grid-template-columns: repeat(12, minmax(0,1fr)); grid-auto-rows: 2rem; gap: 0.5rem`; each enabled widget wrapper gets inline `gridColumn: \`${x+1} / span ${w}\``, `gridRow: \`${y+1} / span ${h}\``; the `Panel` fills the cell (`h-full`) and its body scrolls (`bodyClassName="overflow-auto"`). Narrow: a flex column of widgets in `stackOrder`, natural height. `MyDayPage` keeps the header, summary line, and empty state, and renders `WidgetGrid`; the old flow grid, `SPAN`, and `moveWidget` go away (move any existing `moveWidget` test to the grid tests or delete it if it only covered the old flow).

- [ ] **Step 4: Run** `npm test` — expected: PASS.

- [ ] **Step 5: Commit** — `git commit -am "Render My Day as a 12-column grid, stacked on narrow screens"`.

### Task 4: Customize mode: drag, resize, keyboard, tidy, show/hide, reset

**Files:**
- Modify: `src/features/myday/WidgetGrid.tsx`, `src/features/myday/MyDayPage.tsx`, `src/app/ui.ts`, `src/features/settings/SettingsPage.tsx`
- Test: `src/test/app.test.tsx`

**Interfaces:**
- Consumes: `moveTo`, `resizeTo`, `tidy`, `firstFit`, `cellFromPoint`, `clampRect` (Task 1); `WIDGET_SIZE_HINTS`, `sizeForWidth`, `DEFAULT_WIDGETS` (Task 2).
- Produces: `useUI` field `myDayCustomize: boolean` and `setMyDayCustomize(on: boolean)` (so Settings and the View menu can open customize mode).

Behavior to build:
- Wide + customizing: each title bar gets a handle button (`aria-label="Move or resize <title>"`, `aria-roledescription="movable widget"`) and a bottom-right resize grip (`aria-hidden`, pointer only). Pointer drag on the title bar shows a dashed outline at `cellFromPoint` and commits `moveTo` on pointer up; the grip commits `resizeTo` with the cell under the pointer as the new bottom-right corner. Use `setPointerCapture`.
- Keyboard on the handle: Arrow keys → `moveTo` by one cell; Shift+Arrow → `resizeTo` by one cell. A polite live region announces `"<title> moved to column <x+1>, row <y+1>"` or `"<title> resized to <w> by <h>"`.
- Toolbar (existing customize strip): hidden widgets as "+ <title>" buttons (shows the widget with `firstFit` using its hint `w×h`), **Tidy up** (`tidy`), **Reset layout** (existing confirm, resets to `DEFAULT_WIDGETS`). Hide button on each widget stays.
- Every change writes `size: sizeForWidth(w)` alongside the rect via `updateSettings({ widgets })`.
- Narrow + customizing: only hide/show and reset, plus the note "Arrange widgets on a wider screen (1024px or more)."
- Settings › My Day widgets: keep the show/hide checkboxes; replace the width select and up/down buttons with **Arrange on My Day** (`navigate('myday')` + `setMyDayCustomize(true)`) and **Reset layout**.

- [ ] **Step 1: Write the failing tests:**

```ts
it('moves and resizes a widget with the keyboard in customize mode', async () => {
  mockMatchMedia(true);
  const { user } = await renderApp();
  await user.click(screen.getByRole('button', { name: 'Customize' }));
  const handle = screen.getByRole('button', { name: 'Move or resize Today' });
  handle.focus();
  await user.keyboard('{ArrowDown}{Shift>}{ArrowLeft}{/Shift}');
  const today = useHQ.getState().settings.widgets.find((w) => w.id === 'today')!;
  expect(today).toMatchObject({ x: 0, y: 1, w: 7, size: 'md' });
  expect(screen.getByText('Today resized to 7 by 12')).toBeInTheDocument();
});
it('tidy up closes gaps and reset restores the defaults', async () => {
  mockMatchMedia(true);
  const { user } = await renderApp();
  act(() => updateSettings({ widgets: useHQ.getState().settings.widgets.map((w) => (w.id === 'today' ? { ...w, y: 5 } : w)) }));
  await user.click(screen.getByRole('button', { name: 'Customize' }));
  await user.click(screen.getByRole('button', { name: 'Tidy up' }));
  expect(useHQ.getState().settings.widgets.find((w) => w.id === 'today')!.y).toBe(0);
  await user.click(screen.getByRole('button', { name: /Reset layout/ }));
  await user.click(within(openDialog()).getByRole('button', { name: 'Reset layout' }));
  expect(useHQ.getState().settings.widgets).toEqual(DEFAULT_WIDGETS);
});
it('shows a hidden widget in the first free spot', async () => {
  mockMatchMedia(true);
  const { user } = await renderApp();
  await user.click(screen.getByRole('button', { name: 'Customize' }));
  await user.click(screen.getByRole('button', { name: /Clock/ }));
  const clock = useHQ.getState().settings.widgets.find((w) => w.id === 'clock')!;
  expect(clock).toMatchObject({ enabled: true, w: 3, h: 5 });
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/app.test.tsx -t "customize|Tidy|hidden widget"` — expected: FAIL.
- [ ] **Step 3: Implement** the behavior above.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: PASS.
- [ ] **Step 5: Browser check.** `preview_start personal-hq`; at ≥ 1280px wide: drag a widget, resize it, leave a gap, Tidy up, reload (layout persists), Reset. At 375px: single column. Fix anything off, rerun tests.
- [ ] **Step 6: Commit** — `git commit -am "Customize My Day: drag, resize, keyboard moves, tidy up"`.

# Stage 2: Shortcuts and menus

### Task 5: One command module

**Files:**
- Create: `src/shell/commands.ts`
- Modify: `src/shell/CommandBar.tsx`
- Test: `src/shell/commands.test.ts`

**Interfaces:**
- Produces:
  - `interface AppCommand { id: string; group: 'Create' | 'Go to' | 'Commands' | 'Claude' | 'Views'; label: string; icon: LucideIcon; keywords?: string; run: () => void }`
  - `useAppCommands(): AppCommand[]` (memoized).
  - Stable ids: `new-task`, `new-myday-task` (task editor with `defaults: { myDay: today }`), `new-idea` (capture idea), `new-note`, `new-project`, `new-event`, `new-prompt`, `capture`, `open-command`, `show-shortcuts`, `go-<section>` for every section, `customize-myday`, `cmd-overdue`, `cmd-upcoming`, `cmd-completed`, `cmd-today-cal`, `cmd-organize`, `cmd-focus`, `cmd-density`, `cmd-export`, `cmd-import` (navigates to Settings › Data and focuses Import), `cmd-activity`, `theme-<name>` for each of `THEMES`.
  - `findCommand(cmds: AppCommand[], id: string): AppCommand | undefined`.

- [ ] **Step 1: Write the failing test:**

```ts
it('has unique ids and every section has a go-to command', () => {
  const { result } = renderHook(() => useAppCommands());
  const ids = result.current.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const s of SECTIONS) expect(ids).toContain(`go-${s}`);
  for (const t of THEMES) expect(ids).toContain(`theme-${t}`);
});
```

- [ ] **Step 2: Run** `npx vitest run src/shell/commands.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement**: move `useStaticCommands` out of `CommandBar.tsx` into `useAppCommands`, keeping labels and behavior; `CommandBar` maps `AppCommand` to its `CommandItem` (hint filled later in Task 7). The single "Switch theme to …" command becomes the `theme-*` set.
- [ ] **Step 4: Run** `npm test` — expected: PASS (existing command bar tests unchanged).
- [ ] **Step 5: Commit** — `git commit -am "Move app commands into one module with stable ids"`.

### Task 6: Shortcut registry and matcher

**Files:**
- Create: `src/app/shortcuts.ts`
- Modify: `src/App.tsx` (`useGlobalShortcuts`), `src/shell/nav.ts` (add nothing yet; Explorer's key arrives in Task 14)
- Test: `src/app/shortcuts.test.ts`

**Interfaces:**
- Consumes: `isTypingTarget` (`src/app/platform.ts`), `NAV_ITEMS`, `MOD_KEY`.
- Produces:
  - `interface ShortcutDef { id: string; keys: string[]; label: string; group: 'General' | 'Navigation' | 'Create' | 'Editing' | 'My Day'; scope: 'global' | 'dialog' | 'customize'; command?: string }`
  - `SHORTCUTS: ShortcutDef[]` — `⌘/Ctrl K` → `open-command`; `/` → `open-command`; `C` → `capture`; `N` → new item for the page; `?` → `show-shortcuts`; `G` + each `NAV_ITEMS` key → `go-<section>`; display-only entries: `⌘/Ctrl Enter` (dialog, "Save the open editor"), `Esc` (dialog), `↑ ↓ Enter` (command bar), `Arrows` / `Shift+Arrows` (customize).
  - `interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean; defaultPrevented?: boolean; target: EventTarget | null }`
  - `interface MatchState { modalOpen: boolean; pendingG: boolean; section: SectionId }`
  - `type ShortcutHit = { command: string } | { pendingG: true }`
  - `matchShortcut(e: KeyLike, st: MatchState): ShortcutHit | null`
  - `newItemCommand(section: SectionId): 'new-myday-task' | 'new-task' | 'new-idea' | 'new-note' | 'new-project' | 'new-event'` — myday → `new-myday-task`; tasks → `new-task`; inbox, ideas → `new-idea`; notes → `new-note`; projects → `new-project`; calendar → `new-event`; everything else → `new-task`.
  - `shortcutFor(commandId: string): string[] | undefined` (display keys, e.g. `['G', 'T']`).

- [ ] **Step 1: Write the failing tests:**

```ts
const st = { modalOpen: false, pendingG: false, section: 'tasks' as const };
const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: document.body, ...extra });
it('opens the command bar with Ctrl/⌘+K even while typing', () => {
  const input = document.createElement('input');
  expect(matchShortcut(key('k', { ctrlKey: true, target: input }), st)).toEqual({ command: 'open-command' });
});
it('ignores single keys in fields, selects, during composition, and in dialogs', () => {
  for (const tag of ['input', 'textarea', 'select']) expect(matchShortcut(key('c', { target: document.createElement(tag) }), st)).toBeNull();
  expect(matchShortcut(key('c', { isComposing: true }), st)).toBeNull();
  expect(matchShortcut(key('c'), { ...st, modalOpen: true })).toBeNull();
});
it('handles G sequences', () => {
  expect(matchShortcut(key('g'), st)).toEqual({ pendingG: true });
  expect(matchShortcut(key('t'), { ...st, pendingG: true })).toEqual({ command: 'go-tasks' });
});
it('N creates the right thing for the page', () => {
  expect(matchShortcut(key('n'), { ...st, section: 'notes' })).toEqual({ command: 'new-note' });
  expect(newItemCommand('myday')).toBe('new-myday-task');
  expect(newItemCommand('inbox')).toBe('new-idea');
});
it('? opens the shortcuts panel and reports keys for commands', () => {
  expect(matchShortcut(key('?', { shiftKey: true }), st)).toEqual({ command: 'show-shortcuts' });
  expect(shortcutFor('go-tasks')).toEqual(['G', 'T']);
});
it('never claims browser-reserved combos', () => {
  for (const k of ['n', 't', 'w', 'l']) expect(matchShortcut(key(k, { metaKey: true }), st)).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run src/app/shortcuts.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement** the registry and matcher; rewrite `useGlobalShortcuts` in `App.tsx` to call `matchShortcut`, keep the 1200 ms `G` window and the ⌘K toggle-close behavior, and run hits through `findCommand(useAppCommands(), id)` (read the latest list from a ref).
- [ ] **Step 4: Run** `npm test` — expected: PASS (existing shortcut app tests still pass).
- [ ] **Step 5: Commit** — `git commit -am "Single shortcut registry with a tested matcher; add N and ?"`.

### Task 7: Shortcuts panel, hints everywhere, ⌘/Ctrl+Enter

**Files:**
- Create: `src/shell/ShortcutsDialog.tsx`
- Modify: `src/app/ui.ts` (`shortcutsOpen`, `openShortcuts()`, `closeShortcuts()`, include in `anyModalOpen`), `src/App.tsx` (render dialog), `src/shell/commands.ts` (`show-shortcuts` runs `openShortcuts`), `src/shell/CommandBar.tsx` (hint = `shortcutFor(id)?.join(' ')`), `src/features/settings/SettingsPage.tsx` (Keyboard panel generated from `SHORTCUTS` + "Show all shortcuts" button), `src/ui/Dialog.tsx` (⌘/Ctrl+Enter)
- Test: `src/test/app.test.tsx`

- [ ] **Step 1: Write the failing tests:**

```ts
it('? opens a filterable shortcuts panel', async () => {
  const { user } = await renderApp();
  await user.keyboard('?');
  const dlg = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
  await user.type(within(dlg).getByRole('searchbox', { name: 'Filter shortcuts' }), 'capture');
  expect(within(dlg).getByText('Quick capture')).toBeInTheDocument();
  expect(within(dlg).queryByText('Go to Tasks')).toBeNull();
});
it('shows shortcuts next to commands in the command bar', async () => {
  const { user } = await renderApp();
  await user.keyboard('{Control>}k{/Control}');
  await user.type(await screen.findByRole('combobox'), '>capture');
  expect(screen.getByRole('option', { name: /Capture idea/ })).toHaveTextContent('C');
});
it('Ctrl+Enter saves the open editor', async () => {
  const { user } = await renderApp();
  await user.keyboard('n'); // My Day → new task for today
  await user.type(within(openDialog()).getByLabelText('Title'), 'Ship it');
  await user.keyboard('{Control>}{Enter}{/Control}');
  expect(useHQ.getState().tasks.map((t) => t.title)).toContain('Ship it');
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/app.test.tsx -t "shortcuts panel|next to commands|Ctrl\\+Enter"` — expected: FAIL.
- [ ] **Step 3: Implement.** The dialog groups `SHORTCUTS` by `group`, shows keys with `Kbd`, and filters on label + keys (search box labeled "Filter shortcuts"). In `Dialog`, `onKeyDown` on the `<dialog>`: when `(metaKey || ctrlKey) && key === 'Enter'`, find the first `form` inside and call `requestSubmit()`, then `preventDefault()`. Capture dialog keeps its own handling (no double submit: its handler calls `preventDefault`, so the Dialog handler checks `e.defaultPrevented`).
- [ ] **Step 4: Run** `npm test` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Keyboard shortcuts panel, hints in the command bar, Ctrl/Cmd+Enter saves"`.

### Task 8: Menu bar

**Files:**
- Create: `src/shell/MenuBar.tsx`
- Modify: `src/shell/Shell.tsx` (render in `TitleBar` at `lg:` and add "Keyboard shortcuts" to the drawer), `src/shell/commands.ts` if a menu needs a command not yet defined
- Test: `src/test/app.test.tsx`

**Interfaces:**
- Consumes: `useAppCommands`, `findCommand`, `shortcutFor`.
- Produces: `MENUS: { label: 'File' | 'View' | 'Go' | 'Tools' | 'Help'; items: (string | '-')[] }[]` (command ids and separators):
  - File: `new-task`, `new-note`, `new-idea`, `new-project`, `new-event`, `-`, `capture`, `-`, `cmd-import`, `cmd-export`
  - View: `customize-myday`, `go-explorer` (added in Task 14), `-`, `theme-*` (all), `-`, `cmd-density`
  - Go: every `go-<section>`
  - Tools: `open-command`, `cmd-organize`, `-`, Claude commands (added in Task 22), `-`, `cmd-focus`
  - Help: `show-shortcuts`, `go-prefs` labeled "Data & backups"

Menu behavior: `role="menubar"` with top-level `menuitem` buttons (`aria-haspopup="menu"`, `aria-expanded`); click opens the menu with focus kept on the top-level button, and the first ArrowDown focuses the first item; ArrowLeft/Right moves between menus (opening the neighbor when one is open); ArrowDown/Up moves through items (skipping separators); Home/End; Enter/Space runs the item and closes; Esc closes and returns focus to the top-level button; clicking outside closes. Items show accelerators from `shortcutFor` on the right. Unknown ids (not yet defined) are skipped, so later tasks can add them.

- [ ] **Step 1: Write the failing test:**

```ts
it('menu bar opens with a click and runs items from the keyboard', async () => {
  mockMatchMedia(true);
  const { user } = await renderApp();
  await user.click(screen.getByRole('menuitem', { name: 'Go' }));
  const menu = screen.getByRole('menu', { name: 'Go' });
  expect(within(menu).getByRole('menuitem', { name: /Tasks/ })).toHaveTextContent('G T');
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(useRoute.getState().section).toBe('inbox');
  expect(screen.queryByRole('menu')).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/app.test.tsx -t "menu bar"` — expected: FAIL.
- [ ] **Step 3: Implement** `MenuBar` and wire it into `TitleBar` (`hidden lg:flex`).
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: PASS.
- [ ] **Step 5: Browser check** the menus with mouse and keyboard in both light (`classic`) and dark themes. Fix and rerun tests.
- [ ] **Step 6: Commit** — `git commit -am "Classic menu bar with keyboard navigation"`.

# Stage 3: Links, Explorer, tags, conversions, Ideas

### Task 9: Data model for links, project tags, saved views

**Files:**
- Create: `src/data/titles.ts`
- Modify: `src/data/types.ts`, `src/data/normalize.ts`, `src/data/defaults.ts`, `src/data/store.ts` (create defaults, re-export `ideaTitle`, data-layer helpers), `src/organize/review.ts` (rename its local `ItemRef` to `ReviewTarget`), `src/organize/OrganizeDialog.tsx` (type rename only)
- Test: `src/data/links-model.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `LINKABLE_KINDS = ['task', 'note', 'idea', 'project'] as const`; `type LinkableKind`
  - `interface ItemRef { kind: LinkableKind; id: string }`
  - `itemLinks: ItemRef[]` on `Task`, `Note`, `Idea`, `Project`; `tags: string[]` on `Project`
  - `interface ExplorerFilters { kinds: LinkableKind[]; query: string; tag: string; projectId: string; state: 'open' | 'done' | 'archived' | 'all' }` (`kinds: []` means all)
  - `interface ExplorerSort { key: 'type' | 'title' | 'status' | 'project' | 'date' | 'updated' | 'links'; dir: 'asc' | 'desc' }`
  - `interface SavedView { id: string; name: string; filters: ExplorerFilters; sort: ExplorerSort }`; `Settings.views: SavedView[]`
- Produces (titles.ts): `ideaTitle(i: Pick<Idea, 'title' | 'body'>): string` (moved from store, same behavior; store re-exports it), `noteTitle(n: Pick<Note, 'title'>): string` (`n.title.trim() || 'Untitled note'`).
- Produces (store.ts, for data-layer modules only, documented as such): `patchRecord<K extends CollectionName>(name: K, id: string, change: Partial<Item<K>>): Item<K> | undefined` (the existing `patch`), `removeRecords<K>(name: K, pred: (r: Item<K>) => boolean): Item<K>[]` (the existing `removeWhere`), `restoreRecord<K>(name: K, record: Item<K>): void` (replaces the record with this content and a fresh `updatedAt`, or inserts it if missing).
- Normalizers: `itemRefs(o, key)` keeps objects with `kind ∈ LINKABLE_KINDS` and non-empty string `id`, dedupes by `kind:id`; `views()` keeps entries with string `id` and non-empty `name`, filling bad filters/sort with defaults; project `tags` via `strList`. `createTask/createNote/createIdea/createProject` default `itemLinks: []`; `createProject` defaults `tags: []`; `defaultSettings().views = []`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('normalizes item links, dropping malformed entries and duplicates', () => {
  const t = normalizeCollection('tasks', [{ id: 't', title: 'T', itemLinks: [{ kind: 'note', id: 'n1' }, { kind: 'event', id: 'e' }, { kind: 'note' }, { kind: 'note', id: 'n1' }] }]).items[0];
  expect(t.itemLinks).toEqual([{ kind: 'note', id: 'n1' }]);
});
it('defaults the new fields on old records and settings', () => {
  expect(normalizeCollection('projects', [{ id: 'p', name: 'P' }]).items[0]).toMatchObject({ tags: [], itemLinks: [] });
  expect(normalizeSettings({}).views).toEqual([]);
});
it('keeps valid saved views and repairs bad filters', () => {
  const v = normalizeSettings({ views: [{ id: 'v', name: 'School', filters: { kinds: ['task', 'bogus'], state: 'nope' }, sort: { key: 'title', dir: 'asc' } }, { id: 'x' }] }).views;
  expect(v).toEqual([{ id: 'v', name: 'School', filters: { kinds: ['task'], query: '', tag: '', projectId: '', state: 'open' }, sort: { key: 'title', dir: 'asc' } }]);
});
it('restoreRecord writes the old content with a new stamp', () => {
  const t = createTask({ title: 'Old' });
  updateTask(t.id, { title: 'New' });
  restoreRecord('tasks', t);
  const now = useHQ.getState().tasks[0];
  expect(now.title).toBe('Old');
  expect(now.updatedAt >= t.updatedAt).toBe(true);
});
```

- [ ] **Step 2: Run** the new tests — expected: FAIL.
- [ ] **Step 3: Implement** the types, normalizers, defaults, helper exports, and the `ReviewTarget` rename.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: PASS (existing backup/legacy/sync tests still pass with the extra fields).
- [ ] **Step 5: Commit** — `git commit -am "Data model: item links, project tags, saved views"`.

### Task 10: Link index and link actions

**Files:**
- Create: `src/data/linking.ts`
- Test: `src/data/linking.test.ts`

**Interfaces:**
- Consumes: `ItemRef`, `patchRecord`, `logActivity`, `linkIdeas`/`unlinkIdeas`, `ideaTitle`/`noteTitle`.
- Produces:
  - `type Relation = 'linked' | 'linked-from' | 'source' | 'converted-to' | 'related-idea' | 'linked-task' | 'linked-note'`
  - `interface Connection { ref: ItemRef; relation: Relation; removable: boolean }`
  - `refKey(r: ItemRef): string` → `"kind:id"`
  - `buildLinkIndex(ws: Pick<WorkspaceData, 'tasks' | 'notes' | 'ideas' | 'projects'>): Map<string, Connection[]>`
  - `refTitle(ref: ItemRef, ws): string | null` (null when the item is missing)
  - `linkItems(a: ItemRef, b: ItemRef): void`; `unlinkItems(a: ItemRef, b: ItemRef): void`

Rules:
- Sources of connections: `itemLinks` (A→B gives A `linked`, B `linked-from`); `Idea.relatedIds` (`related-idea` both ways); `Note.taskIds` (note gets `linked-task`, task gets `linked-note`); `Task.source`/`Note.source` (item gets `source`, origin gets `converted-to`); `Idea.converted` (idea gets `converted-to`, target gets `source`).
- One connection per pair. Precedence when a pair has several: `source`/`converted-to` > `related-idea` > `linked-task`/`linked-note` > `linked`/`linked-from`.
- `removable` is false for `source` and `converted-to`, true otherwise.
- Connections to missing items are omitted. No self-links.
- `linkItems`: idea+idea → `linkIdeas`; note+task (either order) → add the task id to the note's `taskIds`; otherwise append `b` to `a.itemLinks` unless the pair is already connected. Logs one `updated` activity entry on `a` with detail `Linked to “<title>”`.
- `unlinkItems`: removes the pair from whichever field holds it (`itemLinks` on either side, `relatedIds` via `unlinkIdeas`, `taskIds`).

- [ ] **Step 1: Write the failing tests:**

```ts
it('indexes links both ways with relation labels', () => {
  const n = createNote({ title: 'Lab notes' }); const t = createTask({ title: 'Lab report' }); const p = createProject({ name: 'Chem' });
  linkItems({ kind: 'task', id: t.id }, { kind: 'project', id: p.id });
  linkItems({ kind: 'task', id: t.id }, { kind: 'note', id: n.id });
  const idx = buildLinkIndex(useHQ.getState());
  expect(idx.get(`project:${p.id}`)).toEqual([{ ref: { kind: 'task', id: t.id }, relation: 'linked-from', removable: true }]);
  expect(idx.get(`task:${t.id}`)!.map((c) => c.relation).sort()).toEqual(['linked', 'linked-note']);
  expect(useHQ.getState().notes[0].taskIds).toEqual([t.id]); // note–task pairs live on the note
});
it('routes idea pairs to relatedIds and never duplicates a pair', () => {
  const a = createIdea({ body: 'A' }); const b = createIdea({ body: 'B' });
  linkItems({ kind: 'idea', id: a.id }, { kind: 'idea', id: b.id });
  linkItems({ kind: 'idea', id: b.id }, { kind: 'idea', id: a.id });
  expect(useHQ.getState().ideas.find((i) => i.id === a.id)!.relatedIds).toEqual([b.id]);
  expect(buildLinkIndex(useHQ.getState()).get(`idea:${a.id}`)).toHaveLength(1);
});
it('shows conversions as source / converted-to and hides missing targets', () => {
  const i = createIdea({ body: 'Write essay' }); const t = convertIdea(i.id, 'task')!;
  const idx = buildLinkIndex(useHQ.getState());
  expect(idx.get(`task:${t.id}`)).toEqual([{ ref: { kind: 'idea', id: i.id }, relation: 'source', removable: false }]);
  act(() => deleteIdea(i.id));
  expect(buildLinkIndex(useHQ.getState()).get(`task:${t.id}`) ?? []).toEqual([]);
});
it('unlinks from whichever side holds the link', () => {
  const t = createTask({ title: 'T' }); const p = createProject({ name: 'P' });
  linkItems({ kind: 'task', id: t.id }, { kind: 'project', id: p.id });
  unlinkItems({ kind: 'project', id: p.id }, { kind: 'task', id: t.id });
  expect(useHQ.getState().tasks[0].itemLinks).toEqual([]);
});
```

(`act` isn't needed in pure store tests; drop it if the file has no React.)

- [ ] **Step 2: Run** `npx vitest run src/data/linking.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement** `src/data/linking.ts`.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Link index with backlinks and link/unlink actions"`.

### Task 11: Linked panel in editors and on the project page

**Files:**
- Create: `src/ui/LinkedItems.tsx`
- Modify: `src/editors/TaskEditor.tsx`, `src/features/notes/NoteEditor.tsx` (remove `taskIds` from `Draft`/`pick` and the old "Linked tasks" section), `src/editors/IdeaEditor.tsx` (replace the "Related ideas" list; keep "Possibly related (shared words)" suggestions, whose Link buttons now call `linkItems`), `src/features/projects/ProjectDetail.tsx`
- Test: `src/test/app.test.tsx`

**Interfaces:**
- Consumes: `buildLinkIndex`, `linkItems`, `unlinkItems`, `refTitle` (Task 10); `scoreMatch` (`src/lib/search.ts`).
- Produces:
  - `useConnections(ref: ItemRef): Connection[]` (in `LinkedItems.tsx`; memoizes `buildLinkIndex` on the four collections with `useShallow`).
  - `openRef(ref: ItemRef): void` (task → `openEditor({ kind: 'task', id })`, idea → `openEditor({ kind: 'idea', id })`, note → `navigate('notes', id)`, project → `navigate('projects', id)`).
  - `LinkedItems({ item }: { item: ItemRef })`: rows with type icon, title, relation label (`linked`, `linked from`, `source`, `converted to`, `related idea`, `linked task`, `linked note`), × (`aria-label="Unlink <title>"`) when removable, and **+ Link…** opening an inline picker (search input labeled "Find an item to link", top 8 `scoreMatch` hits across the four types, excluding itself and already-connected items).
- New tasks (no id yet) show "Save the task to add links." instead of the panel.

- [ ] **Step 1: Write the failing tests:**

```ts
it('links a task to a note from the task editor and shows the backlink on the note', async () => {
  const { user } = await renderApp();
  let t!: Task; let n!: Note;
  act(() => { t = createTask({ title: 'Lab report' }); n = createNote({ title: 'Lab notes' }); });
  act(() => openEditor({ kind: 'task', id: t.id }));
  await user.click(within(openDialog()).getByRole('button', { name: '+ Link…' }));
  await user.type(within(openDialog()).getByRole('textbox', { name: 'Find an item to link' }), 'lab notes');
  await user.click(within(openDialog()).getByRole('button', { name: /Lab notes/ }));
  expect(useHQ.getState().notes[0].taskIds).toEqual([t.id]);
  await user.keyboard('{Escape}');
  act(() => navigate('notes', n.id));
  expect(await screen.findByRole('button', { name: /Lab report/ })).toBeInTheDocument();
  expect(screen.getByText('linked task')).toBeInTheDocument();
});
it('note autosave does not undo links added from the panel', async () => {
  // Type in the note body after linking; taskIds must survive the autosave.
});
```

Fill in the second test: link a task from the note's panel, type into the note body, advance timers past 700 ms (`vi.useFakeTimers` or `waitFor`), and assert `taskIds` still contains the task.

- [ ] **Step 2: Run** `npx vitest run src/test/app.test.tsx -t "links a task|autosave does not undo"` — expected: FAIL.
- [ ] **Step 3: Implement** the panel and the editor/project integrations.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: PASS (update existing tests that relied on the old "Related ideas"/"Linked tasks" markup).
- [ ] **Step 5: Commit** — `git commit -am "Linked panel with backlinks in editors and on projects"`.

### Task 12: Project tags and conversions that keep content

**Files:**
- Modify: `src/data/store.ts` (`convertIdea`, `convertNoteToTask`), `src/editors/ProjectEditor.tsx` (Tags field with `TagInput`), `src/features/projects/ProjectDetail.tsx` (show tag chips)
- Test: `src/data/store.test.ts`

- [ ] **Step 1: Write the failing tests:**

```ts
it('idea → project carries tags and links back to the idea', () => {
  const i = createIdea({ body: 'Start a podcast #audio #side' });
  const p = convertIdea(i.id, 'project') as Project;
  expect(p.tags).toEqual(['audio', 'side']);
  expect(p.itemLinks).toEqual([{ kind: 'idea', id: i.id }]);
});
it('note → task keeps the whole note', () => {
  const body = 'x'.repeat(6000);
  const n = createNote({ title: 'Long', body });
  expect(convertNoteToTask(n.id)!.description).toBe(body);
});
```

- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement**: `createProject({ name, description, category: 'other', tags: idea.tags, itemLinks: [{ kind: 'idea', id }] })`; drop `.slice(0, 4000)`; add the Tags field to the project editor.
- [ ] **Step 4: Run** `npm test` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Project tags; conversions keep all content and link back"`.

### Task 13: Explorer selectors, saved views, and tag actions

**Files:**
- Create: `src/data/explorer.ts`, `src/data/tags.ts`
- Modify: `src/lib/util.ts` (`cleanTag`)
- Test: `src/data/explorer.test.ts`, `src/data/tags.test.ts`

**Interfaces:**
- Consumes: `buildLinkIndex`, `refKey` (Task 10), `matchesQuery`, `ideaTitle`/`noteTitle`, `patchRecord`, `logActivity`, `updateSettings`.
- Produces (`explorer.ts`):
  - `interface ExplorerRow { ref: ItemRef; title: string; status: string; state: 'open' | 'done' | 'archived'; projectId: string | null; tags: string[]; date: DateKey | null; updatedAt: string; createdAt: string; links: number; text: string[] }` (`text` = searchable fields)
  - `explorerRows(ws, index: Map<string, Connection[]>): ExplorerRow[]` — status/state: task → `TASK_STATUS_LABEL`, `done` when completed; note → category or `Note`, always `open`; idea → `Archived`/`Inbox`/`Idea`, `archived` when archived; project → `PROJECT_STATUS_LABEL`, `done` when completed, `archived` when archived. Date: task `dueDate`, project `targetDate`, idea `remindOn`, note `null`. `projectId` null for project rows.
  - `filterRows(rows, f: ExplorerFilters): ExplorerRow[]` (`state: 'all'` keeps everything; tag match ignores case)
  - `sortRows(rows, s: ExplorerSort, projectName: (id: string | null) => string): ExplorerRow[]` (nulls last for `date`; ties broken by title)
  - `DEFAULT_FILTERS: ExplorerFilters = { kinds: [], query: '', tag: '', projectId: '', state: 'open' }`; `DEFAULT_SORT: ExplorerSort = { key: 'updated', dir: 'desc' }`
  - `saveView(name: string, filters: ExplorerFilters, sort: ExplorerSort): SavedView`, `renameView(id: string, name: string): void`, `deleteView(id: string): void`
- Produces (`tags.ts`):
  - `interface TagStat { tag: string; total: number; byKind: Record<LinkableKind, number> }`
  - `tagIndex(ws): TagStat[]` (case-insensitive groups; display casing = first seen; sorted A→Z)
  - `renameTag(from: string, to: string): number` (items changed; returns 0 when `cleanTag(to)` is null)
  - `removeTag(tag: string): number`
  - Both edit tasks, notes, ideas, projects via `patchRecord` (one `updatedAt` per changed record) and log a single activity entry `{ action: 'updated', entity: 'workspace', entityId: '', title: '#from → #to' | 'Removed #tag', detail: 'Renamed a tag on N items' | 'Removed a tag from N items' }`.
- Produces (`util.ts`): `cleanTag(raw: string): string | null` — strip leading `#`, trim, spaces → `-`; valid when it matches `/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,39}$/u`.

- [ ] **Step 1: Write the failing tests:**

```ts
// explorer.test.ts
it('builds one row per item with status, state, and date', () => {
  const t = createTask({ title: 'Essay', dueDate: '2026-11-01' }); createNote({ title: 'Ideas', category: 'School' });
  const p = createProject({ name: 'Site' }); updateProject(p.id, { status: 'completed' });
  const rows = explorerRows(useHQ.getState(), buildLinkIndex(useHQ.getState()));
  expect(rows.find((r) => r.ref.id === t.id)).toMatchObject({ status: 'Planned', state: 'open', date: '2026-11-01' });
  expect(rows.find((r) => r.ref.kind === 'note')).toMatchObject({ status: 'School', state: 'open' });
  expect(rows.find((r) => r.ref.id === p.id)).toMatchObject({ state: 'done' });
});
it('filters by kind, tag (any case), state, and text; sorts with nulls last', () => {
  createTask({ title: 'B task', tags: ['School'], dueDate: '2026-11-02' }); createTask({ title: 'A task', tags: ['home'] }); createNote({ title: 'School note', tags: ['school'] });
  const rows = explorerRows(useHQ.getState(), buildLinkIndex(useHQ.getState()));
  expect(filterRows(rows, { ...DEFAULT_FILTERS, tag: 'school' }).map((r) => r.title).sort()).toEqual(['B task', 'School note']);
  expect(filterRows(rows, { ...DEFAULT_FILTERS, kinds: ['note'] })).toHaveLength(1);
  expect(sortRows(filterRows(rows, { ...DEFAULT_FILTERS, kinds: ['task'] }), { key: 'date', dir: 'asc' }, () => '').map((r) => r.title)).toEqual(['B task', 'A task']);
});
it('saves, renames, and deletes views in settings', () => {
  const v = saveView('School', { ...DEFAULT_FILTERS, tag: 'school' }, DEFAULT_SORT);
  renameView(v.id, 'Class'); expect(useHQ.getState().settings.views[0].name).toBe('Class');
  deleteView(v.id); expect(useHQ.getState().settings.views).toEqual([]);
});
// tags.test.ts
it('counts tags across all four types, ignoring case', () => {
  createTask({ title: 'T', tags: ['School'] }); createNote({ title: 'N', tags: ['school'] }); createProject({ name: 'P', tags: ['school'] });
  expect(tagIndex(useHQ.getState())).toEqual([{ tag: 'School', total: 3, byKind: { task: 1, note: 1, idea: 0, project: 1 } }]);
});
it('renames into an existing tag as a merge, with no duplicates', () => {
  createTask({ title: 'T', tags: ['hw', 'school'] });
  expect(renameTag('hw', 'school')).toBe(1);
  expect(useHQ.getState().tasks[0].tags).toEqual(['school']);
});
it('a case-only rename changes casing everywhere', () => {
  createTask({ title: 'T', tags: ['School'] }); createIdea({ body: 'x', tags: ['SCHOOL'] });
  renameTag('school', 'school');
  expect([useHQ.getState().tasks[0].tags, useHQ.getState().ideas[0].tags]).toEqual([['school'], ['school']]);
});
it('removes a tag everywhere and logs one activity entry', () => {
  createTask({ title: 'T', tags: ['old'] }); createNote({ title: 'N', tags: ['old', 'keep'] });
  const before = useHQ.getState().activity.length;
  expect(removeTag('OLD')).toBe(2);
  expect(useHQ.getState().notes[0].tags).toEqual(['keep']);
  expect(useHQ.getState().activity.length).toBe(before + 1);
});
it('rejects invalid tag names', () => {
  createTask({ title: 'T', tags: ['a'] });
  expect(renameTag('a', '   ')).toBe(0);
  expect(cleanTag('#Lab Work')).toBe('Lab-Work');
});
```

- [ ] **Step 2: Run** `npx vitest run src/data/explorer.test.ts src/data/tags.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement** both modules and `cleanTag`.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Explorer rows, filters, sorting, saved views; tag rename/merge/remove"`.

### Task 14: Explorer section

**Files:**
- Create: `src/features/explorer/ExplorerPage.tsx`, `src/features/explorer/ItemsTable.tsx`, `src/features/explorer/TagsPanel.tsx`
- Modify: `src/data/types.ts` (`SECTIONS` gets `'explorer'` after `'notes'`), `src/app/router.ts` (`SECTION_LABEL.explorer = 'Explorer'`), `src/shell/nav.ts` (`{ section: 'explorer', label, icon: Table2, key: 'x' }` after Notes), `src/App.tsx` (`PAGES.explorer`), `src/app/ui.ts` (`explorerRequest: { query?: string; tag?: string; viewId?: string } | null`), `src/shell/commands.ts` (`go-explorer` is automatic; add `view-<id>` commands "Open view: <name>" in group `Views`), `src/shell/CommandBar.tsx` (last result row "See all results in Explorer" when the query is non-empty), `src/shell/MenuBar.tsx` (View › Explorer)
- Test: `src/test/app.test.tsx`

Behavior:
- Header: title "Explorer", tabs **Items** / **Tags** (`Segmented`), saved-view tabs (`All items` + each view), **Save view** (prompts for a name with a small inline input), and on a selected view: Rename, Delete (confirm).
- Items tab: filter bar (type checkboxes, `SearchBox` "Search everything", tag select, project select (`ProjectSelect`), state select), a table with sticky header; column headers are buttons that toggle sort (`aria-sort` on the `th`); rows `h-6`, title truncated, row click → `openRef`. Below `lg`: a two-line list (title; type · status · project · date). Filters/sort persist per device (`readDevice/writeDevice('explorer-ui')`).
- Tags tab: table of `tagIndex` rows (tag, total, per-type counts); tag click → Items with that tag; **Rename** (inline input; confirm says "Rename #from to #to on N items?" or "Merge #from into #to on N items?"); **Remove** (confirm "Remove #tag from N items?").
- `explorerRequest` (from the command bar or a tag chip) is applied on mount/change and then cleared.

- [ ] **Step 1: Write the failing tests:**

```ts
it('Explorer lists all item types and filters by tag', async () => {
  const { user } = await renderApp();
  act(() => { createTask({ title: 'Essay', tags: ['school'] }); createNote({ title: 'Reading', tags: ['school'] }); createIdea({ body: 'Garden #home' }); });
  await user.keyboard('gx');
  const table = await screen.findByRole('table', { name: 'Items' });
  expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by tag' }), 'school');
  expect(within(table).getAllByRole('row')).toHaveLength(3);
});
it('saves a view and opens it from the command bar', async () => {
  const { user } = await renderApp();
  act(() => navigate('explorer'));
  await user.click(await screen.findByRole('button', { name: 'Save view' }));
  await user.type(screen.getByRole('textbox', { name: 'View name' }), 'Everything{Enter}');
  expect(useHQ.getState().settings.views.map((v) => v.name)).toEqual(['Everything']);
  act(() => navigate('myday'));
  await user.keyboard('{Control>}k{/Control}');
  await user.type(await screen.findByRole('combobox'), 'open view');
  await user.keyboard('{Enter}');
  expect(useRoute.getState().section).toBe('explorer');
  expect(screen.getByRole('tab', { name: 'Everything', selected: true })).toBeInTheDocument();
});
it('renames a tag from the Tags tab after confirming', async () => {
  const { user } = await renderApp();
  act(() => { createTask({ title: 'A', tags: ['hw'] }); navigate('explorer'); });
  await user.click(await screen.findByRole('radio', { name: 'Tags' }));
  await user.click(screen.getByRole('button', { name: 'Rename #hw' }));
  await user.type(screen.getByRole('textbox', { name: 'New name for #hw' }), 'homework{Enter}');
  await user.click(within(openDialog()).getByRole('button', { name: 'Rename' }));
  expect(useHQ.getState().tasks[0].tags).toEqual(['homework']);
});
```

(Match the roles to how `Segmented` and the view tabs render; adjust names, not intent.)

- [ ] **Step 2: Run** `npx vitest run src/test/app.test.tsx -t "Explorer|saves a view|renames a tag"` — expected: FAIL.
- [ ] **Step 3: Implement** the section and wiring.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: PASS (a settings test that enumerates sections may need `explorer` added).
- [ ] **Step 5: Browser check** Explorer at desktop and 375px; sort each column; save/rename/delete a view; rename and remove a tag.
- [ ] **Step 6: Commit** — `git commit -am "Explorer: all-items table, saved views, tags page"`.

### Task 15: Idea reminders, idea cards, Notes filter

**Files:**
- Modify: `src/data/selectors.ts` (`CalendarItemKind` adds `'reminder'`; `calendarItems`/`overdueItems` accept `ideas?: Idea[]`), `src/features/myday/widgets.tsx` (Deadlines passes ideas; `KIND_ICON.reminder = Bell`; `openCalendarItem` handles `reminder`), `src/features/calendar/CalendarPage.tsx` (data includes ideas; `openItem`/`KIND_STYLE` handle `reminder`), `src/features/ideas/IdeaParts.tsx` (converted chips + link count), `src/features/notes/NotesPage.tsx` (category filter width)
- Test: `src/data/selectors.test.ts`, `src/test/app.test.tsx`

Rules: an idea contributes a `reminder` item when `remindOn` is in range and it isn't archived; `title` = `ideaTitle(i)`, `projectId` = the idea's, `done: false`, `overdue: remindOn < today`; sort rank after tasks. `overdueItems` includes overdue reminders. Idea cards show each `converted` entry as a button "→ Task: <title>" (title via `refTitle`; skip missing) that calls `openRef`, plus a link-count badge (`Link2` icon, `aria-label="<n> links"`) counting connections other than `converted-to`. The Notes category `Select` gets enough width for "All categories" (`className="w-36"` or wider; check at 375px).

- [ ] **Step 1: Write the failing tests:**

```ts
it('includes idea reminders, flags overdue ones, and skips archived ideas', () => {
  const today = '2026-10-24';
  const ideas = [idea({ id: 'r1', body: 'Call Sam', remindOn: '2026-10-26' }), idea({ id: 'r2', body: 'Pay fee', remindOn: '2026-10-20' }), idea({ id: 'r3', body: 'Old', remindOn: '2026-10-25', archived: true })];
  const items = calendarItems({ tasks: [], events: [], projects: [], ideas }, '2026-10-24', '2026-10-31', today);
  expect(items.map((i) => [i.kind, i.id])).toEqual([['reminder', 'r1']]);
  expect(overdueItems({ tasks: [], projects: [], ideas }, today).map((i) => [i.id, i.overdue])).toEqual([['r2', true]]);
});
```

(`idea()` is a small factory in the test file built on `normalizeCollection('ideas', …)`.)

```ts
it('shows what an idea became on its card', async () => {
  const { user } = await renderApp();
  act(() => { const i = createIdea({ body: 'Finish lab report' }); convertIdea(i.id, 'task'); navigate('ideas'); });
  await user.click(await screen.findByRole('button', { name: '→ Task: Finish lab report' }));
  expect(within(openDialog()).getByDisplayValue('Finish lab report')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Idea reminders on My Day and the calendar; idea cards show conversions and links"`.

# Stage 4: Claude

### Task 16: Shared job definitions

**Files:**
- Create: `supabase/functions/_shared/ai-jobs.ts` (no imports; valid in Deno and Vite)
- Modify: `tsconfig.json` (`"allowImportingTsExtensions": true`; `include` adds `"supabase/functions/_shared"`, `"supabase/functions/phq-ai/handler.ts"`, `"supabase/functions/phq-ai/handler.test.ts"`)
- Test: `src/ai/jobs.test.ts`

**Interfaces:**
- Produces:
  - `AI_JOB_IDS = ['organize', 'summarize', 'breakdown', 'plan'] as const`; `type AiJobId`
  - Input types: `OrganizeInput { ideas: { id: string; title: string; body: string; url: string; tags: string[]; category: string }[]; tags: string[]; projects: { id: string; name: string }[] }`; `SummarizeInput { note: { title: string; body: string } }`; `BreakdownInput { today: string; project: { name: string; description: string; milestones: { id: string; title: string; dueDate: string | null }[] }; existingTasks: string[] }`; `PlanInput { today: string; tasks: { id: string; title: string; priority: string; status: string; dueDate: string | null; project: string | null }[]; events: { title: string; time: string | null }[] }`; `type AiInputs = { organize: OrganizeInput; summarize: SummarizeInput; breakdown: BreakdownInput; plan: PlanInput }`
  - `interface AiJobDef { id: AiJobId; label: string; instructions: string; schema: Record<string, unknown>; maxTokens: number }`; `AI_JOBS: Record<AiJobId, AiJobDef>`
  - `AI_LIMITS = { maxRequestBytes: 200_000, organizeIdeas: 50, planTasks: 60, breakdownTasks: 20, planPicks: 12, summaryChars: 1200, keyPoints: 8, actionItems: 10 }`
- Output schemas (JSON Schema; every object `additionalProperties: false` with all properties `required`; nullable via `type: ['string', 'null']`):
  - organize: `{ suggestions: [{ ideaId: string, reason: string, actions: [{ type: enum add_tags|set_category|set_project|link|convert, tags: string[], category: string|null, projectId: string|null, targetKind: enum idea|project|null, targetId: string|null, to: enum task|note|project|null }] }] }`
  - summarize: `{ summary: string, keyPoints: string[], actionItems: [{ title: string, dueDate: string|null }] }`
  - breakdown: `{ tasks: [{ title: string, description: string, priority: enum low|medium|high|urgent, dueDate: string|null, milestoneId: string|null }] }`
  - plan: `{ focus: string, tasks: [{ taskId: string, reason: string }] }`
- Instructions (one paragraph each, plain and specific): use only ids from the input; dates as `YYYY-MM-DD`; don't invent facts, times, or items; keep existing content; organize suggests at most 5 tags per idea, reusing existing tag names; plan picks at most 12 tasks and never schedules times; breakdown avoids titles already in `existingTasks`.

- [ ] **Step 1: Write the failing test:**

```ts
it('defines four jobs with closed schemas', () => {
  expect(Object.keys(AI_JOBS)).toEqual([...AI_JOB_IDS]);
  const closed = (s: any): boolean => (s.type === 'object' ? s.additionalProperties === false && Object.keys(s.properties).every((k) => s.required.includes(k) && closed(s.properties[k])) : s.type === 'array' ? closed(s.items) : true);
  for (const j of AI_JOB_IDS) expect(closed(AI_JOBS[j].schema)).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run src/ai/jobs.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement** the module and the tsconfig change.
- [ ] **Step 4: Run** `npx vitest run src/ai/jobs.test.ts && npm run typecheck` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Shared Claude job definitions and output schemas"`.

### Task 17: Input builders, copy/paste prompt, JSON extraction

**Files:**
- Create: `src/ai/inputs.ts`, `src/ai/prompt.ts`, `src/ai/extract.ts`
- Test: `src/ai/inputs.test.ts`, `src/ai/extract.test.ts`

**Interfaces:**
- Consumes: `AI_JOBS`, `AI_LIMITS`, input types (Task 16); `isMyDayTask`, `isOpenTask`, `isOverdue`, `eventOccursOn` (selectors).
- Produces:
  - `buildOrganizeInput(ws: WorkspaceData, ideaIds?: string[]): OrganizeInput` — default ideas: Inbox, not archived, newest first; capped at 50; projects = active only.
  - `buildSummarizeInput(note: Note): SummarizeInput`
  - `buildBreakdownInput(ws: WorkspaceData, projectId: string, today: DateKey): BreakdownInput` — `existingTasks` = titles of that project's tasks.
  - `buildPlanInput(ws: WorkspaceData, today: DateKey): PlanInput` — open tasks that are overdue, due within 7 days, on My Day, in progress, or high/urgent; sorted by due date then priority; capped at 60; events occurring today (`title`, `startTime` or null).
  - `bridgePrompt(job: AiJobId, input: unknown): string` — instructions, then "Reply with only a JSON object matching this schema:" + schema, then "Input:" + `JSON.stringify(input, null, 2)`.
  - `extractJson(text: string): unknown` — throws `ExtractError` with message `Not valid JSON` when nothing parses. Order: whole trimmed text; then each ```` ``` ```` / ```` ```json ```` fenced block in order; then, for each `{` in order, the balanced `{…}` starting there (braces counted outside string literals, respecting `\"` escapes); the first one that parses wins.

- [ ] **Step 1: Write the failing tests:**

```ts
// inputs.test.ts
it('organize sends only the listed idea fields, tag names, and active projects', () => {
  const p = createProject({ name: 'Chem' }); createProject({ name: 'Old', status: 'paused' });
  createIdea({ body: 'Lab idea #school', projectId: p.id, favorite: true });
  createTask({ title: 'Secret task' }); createNote({ title: 'Private note' });
  const input = buildOrganizeInput(useHQ.getState());
  expect(Object.keys(input.ideas[0]).sort()).toEqual(['body', 'category', 'id', 'tags', 'title', 'url']);
  expect(input.projects).toEqual([{ id: p.id, name: 'Chem' }]);
  expect(JSON.stringify(input)).not.toMatch(/Secret task|Private note/);
});
it('plan sends task fields without descriptions and caps at 60', () => {
  for (let i = 0; i < 70; i++) createTask({ title: `T${i}`, priority: 'high', description: 'do not send' });
  const input = buildPlanInput(useHQ.getState(), '2026-10-24');
  expect(input.tasks).toHaveLength(60);
  expect(Object.keys(input.tasks[0]).sort()).toEqual(['dueDate', 'id', 'priority', 'project', 'status', 'title']);
  expect(JSON.stringify(input)).not.toContain('do not send');
});
it('summarize sends only that note', () => {
  const n = createNote({ title: 'Lecture', body: 'Body', tags: ['x'] });
  expect(buildSummarizeInput(n)).toEqual({ note: { title: 'Lecture', body: 'Body' } });
});
// extract.test.ts
it('pulls the first JSON object out of prose, fences, or extra blocks', () => {
  expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  expect(extractJson('Here you go:\n```json\n{"a":2}\n```\nHope that helps')).toEqual({ a: 2 });
  expect(extractJson('Sure! {"a":3,"s":"}{"} and also {"b":4}')).toEqual({ a: 3, s: '}{' });
});
it('rejects replies with no valid JSON', () => {
  expect(() => extractJson('Sorry, I cannot help.')).toThrow('Not valid JSON');
  expect(() => extractJson('{"a":1,}')).toThrow('Not valid JSON');
});
```

- [ ] **Step 2: Run** `npx vitest run src/ai` — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Claude inputs with minimal fields, copy/paste prompt, JSON extraction"`.

### Task 18: Reply validation

**Files:**
- Create: `src/ai/validate.ts`
- Test: `src/ai/validate.test.ts`

**Interfaces:**
- Consumes: input types and `AI_LIMITS` (Task 16); `cleanTag` (Task 13); `isDateKey`, `addDays`.
- Produces:
  - `type JobContext = { job: 'organize'; input: OrganizeInput } | { job: 'summarize'; input: SummarizeInput; noteId: string; noteProjectId: string | null } | { job: 'breakdown'; input: BreakdownInput; projectId: string } | { job: 'plan'; input: PlanInput }`
  - `type AiChange = { type: 'add_tags'; ideaId: string; tags: string[]; reason: string } | { type: 'set_category'; ideaId: string; category: string; reason: string } | { type: 'set_project'; ideaId: string; projectId: string; reason: string } | { type: 'link'; ideaId: string; target: ItemRef; reason: string } | { type: 'convert'; ideaId: string; to: 'task' | 'note' | 'project'; reason: string } | { type: 'insert_summary'; noteId: string; text: string } | { type: 'create_task'; title: string; description: string; priority: Priority; dueDate: DateKey | null; projectId: string | null; milestoneId: string | null; sourceNoteId: string | null } | { type: 'add_to_myday'; taskId: string; reason: string }`
  - `interface Rejected { reason: 'Unknown item id' | 'Unsupported action' | 'Invalid date' | 'Over the limit' | 'Missing value'; detail: string }`
  - `type ValidationResult = { ok: true; changes: AiChange[]; rejected: Rejected[]; message: string | null } | { ok: false; error: string }` (`message` = plan `focus`)
  - `validateReply(ctx: JobContext, raw: unknown, today: DateKey): ValidationResult`

Rules (all from the spec):
- Shape check first: wrong top-level type or missing required arrays/strings → `{ ok: false, error: 'Wrong shape: <path>' }`.
- Ids: organize `ideaId` ∈ sent ideas; `set_project.projectId` ∈ sent projects; `link` target ∈ sent ideas (`targetKind: 'idea'`) or sent projects; breakdown `milestoneId` ∈ sent milestones (or null); plan `taskId` ∈ sent tasks. Otherwise `Unknown item id`.
- Actions outside the job's list → `Unsupported action`.
- Dates must pass `isDateKey` and lie in `[addDays(today, -365), addDays(today, 1825)]`, else `Invalid date` (whole item rejected).
- Caps (truncate text with `…`): reason 200, category 40, summary 1,200, key point 200, action item title 140, task title 140, description 2,000, focus 400, plan reason 160. Count caps (keep the first N, reject the rest as `Over the limit`): tags 5 per action (after `cleanTag`, invalid tags dropped), key points 8, action items 10, breakdown tasks 20, plan picks 12. `add_tags` with no valid tags left → `Missing value`.
- Summarize produces one `insert_summary` (`text` = `## Summary (Claude)` + summary + bulleted key points) and one `create_task` per action item (`projectId: noteProjectId`, `sourceNoteId: noteId`). Breakdown `create_task` gets `projectId: ctx.projectId`. Plan produces `add_to_myday` per pick.
- Every string from the reply is treated as plain text.

- [ ] **Step 1: Write the failing tests** (one `it` per rule):

```ts
const org: JobContext = { job: 'organize', input: { ideas: [{ id: 'i1', title: '', body: 'Lab', url: '', tags: [], category: '' }], tags: [], projects: [{ id: 'p1', name: 'Chem' }] } };
const act = (a: object) => ({ type: 'add_tags', tags: [], category: null, projectId: null, targetKind: null, targetId: null, to: null, ...a });
it('rejects a reply that is not the job shape', () => {
  expect(validateReply(org, { nope: 1 }, '2026-10-24')).toEqual({ ok: false, error: 'Wrong shape: suggestions' });
});
it('rejects unknown ids, including real ids that were not sent', () => {
  const r = validateReply(org, { suggestions: [{ ideaId: 'zz', reason: '', actions: [act({ tags: ['x'] })] }, { ideaId: 'i1', reason: '', actions: [act({ type: 'set_project', projectId: 'p9' })] }] }, '2026-10-24');
  expect(r.ok && r.rejected.map((x) => x.reason)).toEqual(['Unknown item id', 'Unknown item id']);
});
it('rejects unsupported actions', () => {
  const r = validateReply(org, { suggestions: [{ ideaId: 'i1', reason: '', actions: [act({ type: 'delete' })] }] }, '2026-10-24');
  expect(r.ok && r.rejected[0].reason).toBe('Unsupported action');
});
it('cleans and caps tags', () => {
  const r = validateReply(org, { suggestions: [{ ideaId: 'i1', reason: 'r', actions: [act({ tags: ['#Lab Work', 'a', 'b', 'c', 'd', 'e', '!!'] })] }] }, '2026-10-24');
  expect(r.ok && r.changes).toEqual([{ type: 'add_tags', ideaId: 'i1', tags: ['Lab-Work', 'a', 'b', 'c', 'd'], reason: 'r' }]);
});
it('rejects invalid and out-of-range dates', () => {
  const ctx: JobContext = { job: 'breakdown', projectId: 'p1', input: { today: '2026-10-24', project: { name: 'P', description: '', milestones: [] }, existingTasks: [] } };
  const t = (dueDate: string | null) => ({ title: 'T', description: '', priority: 'high', dueDate, milestoneId: null });
  const r = validateReply(ctx, { tasks: [t('2026-02-30'), t('2040-01-01'), t(null)] }, '2026-10-24');
  expect(r.ok && [r.rejected.map((x) => x.reason), r.changes.length]).toEqual([['Invalid date', 'Invalid date'], 1]);
});
it('plan keeps at most 12 sent task ids and returns the focus', () => {
  const tasks = Array.from({ length: 15 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, priority: 'high', status: 'planned', dueDate: null, project: null }));
  const r = validateReply({ job: 'plan', input: { today: '2026-10-24', tasks, events: [] } }, { focus: 'Essay first', tasks: tasks.map((t) => ({ taskId: t.id, reason: '' })) }, '2026-10-24');
  expect(r.ok && [r.changes.length, r.rejected.length, r.message]).toEqual([12, 3, 'Essay first']);
});
it('summarize builds a summary insert and linked action-item tasks', () => {
  const r = validateReply({ job: 'summarize', noteId: 'n1', noteProjectId: 'p1', input: { note: { title: 'L', body: 'B' } } }, { summary: 'Short', keyPoints: ['One'], actionItems: [{ title: 'Read ch. 4', dueDate: null }] }, '2026-10-24');
  expect(r.ok && r.changes).toEqual([
    { type: 'insert_summary', noteId: 'n1', text: '## Summary (Claude)\n\nShort\n\n- One' },
    { type: 'create_task', title: 'Read ch. 4', description: '', priority: 'medium', dueDate: null, projectId: 'p1', milestoneId: null, sourceNoteId: 'n1' },
  ]);
});
```

- [ ] **Step 2: Run** `npx vitest run src/ai/validate.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement** `validateReply`.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Strict validation of Claude replies"`.

### Task 19: Undoable batches (also for the local Organize review)

**Files:**
- Create: `src/data/batches.ts`
- Modify: `src/data/store.ts` (batch recorder hook inside `patch`, `insert`, `removeWhere`), `src/app/ui.ts` (toast `action`), `src/App.tsx` (render toast action button; call `loadBatches()` when the store is ready), `src/organize/OrganizeDialog.tsx` (wrap apply in `recordBatch`, toast with Undo)
- Test: `src/data/batches.test.ts`

**Interfaces:**
- Consumes: `restoreRecord`, `removeRecords` (Task 9); adapter `readAux`/`writeAux`.
- Produces:
  - store.ts: `setBatchRecorder(r: BatchRecorder | null): void` with `interface BatchRecorder { touched(collection: CollectionName, before: unknown): void; created(collection: CollectionName, id: string): void }` — `patch` reports the record before its first change in the batch, `insert` reports creations, `removeWhere` reports removed records as touched. `activity` is never reported.
  - `interface BatchRecord { id: string; at: string; label: string; source: 'claude' | 'local'; changed: { collection: CollectionName; before: { id: string; updatedAt: string }; afterStamp: string }[]; created: { collection: CollectionName; id: string; afterStamp: string }[] }`
  - `interface UndoReport { restored: number; removed: number; skipped: string[] }` (`skipped` = titles)
  - `BATCH_KEEP = 10`; `useBatches` (zustand `{ list: BatchRecord[] }`, newest first)
  - `recordBatch(label: string, source: BatchRecord['source'], fn: () => void): BatchRecord | null` (null when nothing changed; persists to aux `undo`)
  - `undoBatch(id: string): UndoReport` — for each changed record: skip (and list) if it no longer exists or its `updatedAt !== afterStamp`, else `restoreRecord`; for each created record: skip if changed since (`updatedAt !== afterStamp`), else `removeRecords`. Logs one activity entry `Undid: <label>`; removes the batch from the list.
  - `loadBatches(): Promise<void>`
  - `toast(message, tone?, action?: { label: string; run: () => void })` — action toasts stay 8 s.

- [ ] **Step 1: Write the failing tests:**

```ts
it('records changes and creations, and undo reverses them', () => {
  const i = createIdea({ body: 'Essay idea' });
  const b = recordBatch('Organize', 'claude', () => { updateIdea(i.id, { tags: ['school'] }); convertIdea(i.id, 'task'); })!;
  expect(b.changed.map((c) => c.collection)).toEqual(['ideas']);
  expect(b.created.map((c) => c.collection)).toEqual(['tasks']);
  expect(undoBatch(b.id)).toEqual({ restored: 1, removed: 1, skipped: [] });
  expect(useHQ.getState().ideas[0]).toMatchObject({ tags: [], converted: [], inbox: true });
  expect(useHQ.getState().tasks).toEqual([]);
});
it('skips items edited after the batch, such as a newer synced version', () => {
  const t = createTask({ title: 'Read' });
  const b = recordBatch('Plan', 'claude', () => updateTask(t.id, { myDay: '2026-10-24' }))!;
  const cur = useHQ.getState().tasks[0];
  applyRemoteChanges([{ collection: 'tasks', id: t.id, record: { ...cur, title: 'Read (edited on phone)', updatedAt: '2099-01-01T00:00:00.000Z' } }]);
  expect(undoBatch(b.id)).toEqual({ restored: 0, removed: 0, skipped: ['Read (edited on phone)'] });
  expect(useHQ.getState().tasks[0].title).toBe('Read (edited on phone)');
});
it('returns null for a batch that changed nothing and keeps only the last 10', async () => {
  expect(recordBatch('Nothing', 'local', () => {})).toBeNull();
  const t = createTask({ title: 'x' });
  for (let n = 0; n < 12; n++) recordBatch(`B${n}`, 'local', () => updateTask(t.id, { title: `x${n}` }));
  expect(useBatches.getState().list).toHaveLength(10);
  expect(await getAdapter().readAux!('undo')).toHaveLength(10);
});
```

- [ ] **Step 2: Run** `npx vitest run src/data/batches.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement**, then switch `OrganizeDialog` apply to `recordBatch('Organization review', 'local', …)` and `toast('Applied N suggestions', 'success', { label: 'Undo', run: () => … })`.
- [ ] **Step 4: Run** `npm test` — expected: PASS (existing Organize app test still passes; add an assertion that its toast offers Undo).
- [ ] **Step 5: Commit** — `git commit -am "Undoable suggestion batches, used by the local Organize review"`.

### Task 20: Review rows, duplicate detection, apply

**Files:**
- Create: `src/ai/apply.ts`
- Test: `src/ai/apply.test.ts`

**Interfaces:**
- Consumes: `AiChange` (Task 18), `recordBatch` (Task 19), `linkItems` (Task 10), store actions (`updateIdea`, `convertIdea`, `updateNote`, `createTask`, `updateTask`).
- Produces:
  - `interface ReviewRow { key: string; change: AiChange; label: string; before: string | null; after: string; duplicate: boolean; checked: boolean }`
  - `isDuplicateTask(title: string, projectId: string | null, ws: WorkspaceData, today: DateKey): boolean` — normalized title (lowercase, collapsed spaces, trimmed, trailing punctuation removed) equals an open task's in the same project, or a task on My Day today.
  - `buildReviewRows(changes: AiChange[], ws: WorkspaceData, today: DateKey): ReviewRow[]` — labels and before/after: `add_tags` "Tags · <idea>" before `school` after `school, lab` (only new tags added; a row whose tags are all present already is dropped); `set_category` before current/`(none)`; `set_project` names; `link` "Link · <idea> ↔ <target>"; `convert` "Convert · <idea> → Task"; `insert_summary` before `(note body unchanged)` after the summary text; `create_task` before `null`; `add_to_myday` before `Not on My Day`. `checked = !duplicate`; an `add_to_myday` for a task already on My Day is dropped.
  - `applyRows(rows: ReviewRow[], label: string): BatchRecord | null` — applies checked rows inside `recordBatch(label, 'claude', …)`: tags merged with `uniqueStrings`; `insert_summary` sets body to `text + '\n\n---\n\n' + body`; `create_task` uses status `planned` and, with `sourceNoteId`, `linkItems(note, task)`; `add_to_myday` sets `myDay: today`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('flags duplicate tasks and leaves them unticked', () => {
  const p = createProject({ name: 'Site' }); createTask({ title: 'Write the README', projectId: p.id });
  const rows = buildReviewRows([{ type: 'create_task', title: 'write the readme.', description: '', priority: 'medium', dueDate: null, projectId: p.id, milestoneId: null, sourceNoteId: null }], useHQ.getState(), '2026-10-24');
  expect(rows[0]).toMatchObject({ duplicate: true, checked: false });
});
it('adds tags without replacing and inserts summaries above the original body', () => {
  const i = createIdea({ body: 'Lab #school' }); const n = createNote({ title: 'L', body: 'Original' });
  const rows = buildReviewRows([{ type: 'add_tags', ideaId: i.id, tags: ['school', 'lab'], reason: '' }, { type: 'insert_summary', noteId: n.id, text: '## Summary (Claude)\n\nShort' }], useHQ.getState(), '2026-10-24');
  expect(rows[0]).toMatchObject({ before: 'school', after: 'school, lab' });
  applyRows(rows, 'Claude');
  expect(useHQ.getState().ideas[0].tags).toEqual(['school', 'lab']);
  expect(useHQ.getState().notes[0].body).toBe('## Summary (Claude)\n\nShort\n\n---\n\nOriginal');
});
it('applies only ticked rows as one undoable batch', () => {
  const t = createTask({ title: 'Read' });
  const rows = buildReviewRows([{ type: 'add_to_myday', taskId: t.id, reason: '' }, { type: 'create_task', title: 'New', description: '', priority: 'low', dueDate: null, projectId: null, milestoneId: null, sourceNoteId: null }], useHQ.getState(), '2026-10-24');
  rows[1].checked = false;
  const b = applyRows(rows, 'Plan my day')!;
  expect(useHQ.getState().tasks.map((x) => x.title)).toEqual(['Read']);
  undoBatch(b.id);
  expect(useHQ.getState().tasks[0].myDay).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run src/ai/apply.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Review rows with duplicate detection; apply Claude changes as a batch"`.

### Task 21: Live client and access code

**Files:**
- Create: `src/ai/live.ts`
- Test: `src/ai/live.test.ts`

**Interfaces:**
- Consumes: `SYNC_URL`, `SYNC_KEY` (`src/sync/config.ts`), `readDevice`/`writeDevice`, `insideArtifactHost` (`src/app/fileSave.ts`).
- Produces:
  - `AI_FUNCTION_PATH = '/functions/v1/phq-ai'`; `aiFunctionUrl(): string`
  - `readAccessCode(): string` / `writeAccessCode(code: string): void` (device key `ai-code`, trimmed; empty removes it)
  - `generateAccessCode(): string` (32 chars, `crypto.getRandomValues`, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`)
  - `liveAvailable(): boolean` — `!insideArtifactHost() && readAccessCode() !== ''`
  - `type LiveErrorCode = 'not_configured' | 'unauthorized' | 'refused' | 'too_large' | 'bad_request' | 'upstream' | 'network'`; `class LiveError extends Error { code: LiveErrorCode; missing?: string[] }`
  - `pingLive(code?: string): Promise<{ apiKeySet: boolean; model: string }>` (throws `LiveError`)
  - `runLive(job: AiJobId, input: unknown): Promise<{ result: unknown; model: string; usage: { input_tokens: number; output_tokens: number } }>` (throws `LiveError`)
  - Requests: `POST aiFunctionUrl()`, headers `content-type: application/json`, `apikey: SYNC_KEY`, `x-phq-access: <code>`; body `{ job, input }` (`{ job: 'ping' }` for ping); 120 s timeout via `AbortController` → `network`. Map status: 503 → `not_configured` (with `missing`), 401 → `unauthorized`, 413 → `too_large`, 422 → `refused`, 400 → `bad_request`, other non-2xx → `upstream`; fetch rejection → `network`.

- [ ] **Step 1: Write the failing tests** (stub `globalThis.fetch` with `vi.fn`):

```ts
it('is unavailable without an access code or inside Claude', () => {
  writeAccessCode('');
  expect(liveAvailable()).toBe(false);
  writeAccessCode('ABC');
  expect(liveAvailable()).toBe(true);
});
it('sends the job with the access code and maps errors', async () => {
  writeAccessCode('CODE123');
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'not_configured', missing: ['ANTHROPIC_API_KEY'] }), { status: 503 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(runLive('plan', { today: '2026-10-24', tasks: [], events: [] })).rejects.toMatchObject({ code: 'not_configured', missing: ['ANTHROPIC_API_KEY'] });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${SYNC_URL}/functions/v1/phq-ai`);
  expect(init.headers['x-phq-access']).toBe('CODE123');
  expect(JSON.parse(init.body)).toEqual({ job: 'plan', input: { today: '2026-10-24', tasks: [], events: [] } });
});
it('generates strong codes', () => {
  const c = generateAccessCode();
  expect(c).toMatch(/^[A-HJKMNP-Z2-9]{32}$/);
  expect(generateAccessCode()).not.toBe(c);
});
```

- [ ] **Step 2: Run** `npx vitest run src/ai/live.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Client for the optional live Claude function"`.

### Task 22: Ask Claude dialog, entry points, Settings › Claude

**Files:**
- Create: `src/ai/AskClaudeDialog.tsx`, `src/features/settings/ClaudePanel.tsx`
- Modify: `src/app/ui.ts` (`askClaude: { job: AiJobId; targetId?: string } | null`, `openAskClaude(req)`, `closeAskClaude()`, included in `anyModalOpen`), `src/App.tsx` (render dialog), `src/shell/commands.ts` (group `Claude`: `ask-organize` "Ask Claude: organize ideas…", `ask-summarize` "Ask Claude: summarize a note…", `ask-breakdown` "Ask Claude: break a project into tasks…", `ask-plan` "Ask Claude: plan my day…"), `src/shell/MenuBar.tsx` (Tools adds the four), `src/features/ideas/IdeasPage.tsx` + `src/features/inbox/InboxPage.tsx` (header button "Ask Claude"), `src/features/notes/NoteEditor.tsx` ("Summarize with Claude"), `src/features/projects/ProjectDetail.tsx` ("Break into tasks with Claude"), `src/features/myday/MyDayPage.tsx` ("Plan my day with Claude"), `src/organize/provider.ts` (`SUGGESTION_SOURCES`), `src/features/settings/SettingsPage.tsx` (replace the "Organization helpers" panel with `ClaudePanel`)
- Test: `src/test/app.test.tsx`

**Interfaces:**
- Consumes: Tasks 16–21.
- Produces: `SUGGESTION_SOURCES: { id: 'local-rules' | 'claude-manual' | 'claude-live'; label: string; kind: 'local' | 'manual' | 'remote'; description: string }[]` — descriptions: local "Keyword rules, word overlap, and fixed templates. Runs in this browser; nothing is sent anywhere."; manual "You copy a prompt into Claude.ai and paste the reply back. Works with any Claude.ai account; no setup."; remote "Sends the items shown before each request to Anthropic through your Supabase function. Not end-to-end encrypted. Off until set up."

Dialog steps (title "Ask Claude · <job label>", labeled "Claude suggestion" in the review):
1. **Choose** — summarize without `targetId`: note picker; breakdown without `targetId`: project picker; organize: checklist of Inbox ideas (all ticked, max 50, "Showing the 50 newest"); plan: none.
2. **Preview** — "This is exactly what will be shared:" + item counts + read-only `<pre>` of `JSON.stringify(input, null, 2)` (labeled "Data to share"); buttons **Copy prompt** (copies `bridgePrompt`, then shows step 3) and, only when `liveAvailable()`, **Send to Anthropic**. When live isn't set up: a one-line link "Set up live mode in Settings › Claude".
3. **Paste** — textarea "Paste Claude's reply" + **Check reply** (runs `extractJson` → `validateReply`; errors shown in `role="alert"` and nothing changes).
4. **Review** — `message` (plan focus) as plain text; rows from `buildReviewRows` with checkboxes (duplicates marked "Possible duplicate"); "N rejected" disclosure listing reason + detail; for live replies "Model <model> · <input> in / <output> out tokens"; **Apply selected** → `applyRows` → close → `toast('Applied N Claude suggestions', 'success', { label: 'Undo', run })`.
Live errors map to messages: not_configured "Live mode isn't set up on the server yet (missing: …). Copy/paste still works."; unauthorized "The access code was rejected. Check it in Settings › Claude."; refused "Claude declined this request."; network "Couldn't reach the function. Check your connection."; others show the code.

Settings › Claude panel: suggestion sources list; access code input (`type="password"`, show/hide toggle, Save, Clear; note "Stored on this device only. Not synced or backed up."); **Generate code** (shows a new code with Copy, for pasting into Supabase); **Test connection** (`pingLive`) with results "Connected · API key set · model <m>" / "Connected, but ANTHROPIC_API_KEY isn't set" / the mapped error; collapsible "How to set up live mode" with the four setup steps from the spec and the `supabase functions deploy phq-ai --no-verify-jwt` fallback; "Recent applied suggestions" listing `useBatches` entries (label, time, source) with **Undo** each, showing the `UndoReport` (skipped titles). Hidden live controls inside the Claude artifact, replaced by "Live mode isn't available inside Claude; copy/paste works."

- [ ] **Step 1: Write the failing tests:**

```ts
it('organizes ideas by copy/paste: preview, paste, review, apply, undo', async () => {
  const { user } = await renderApp();
  let i!: Idea;
  act(() => { i = createIdea({ body: 'Chemistry lab plan' }); createNote({ title: 'Private diary' }); navigate('ideas'); });
  await user.click(await screen.findByRole('button', { name: 'Ask Claude' }));
  await user.click(within(openDialog()).getByRole('button', { name: 'Next' }));
  const data = within(openDialog()).getByLabelText('Data to share');
  expect(data).toHaveTextContent('Chemistry lab plan');
  expect(data).not.toHaveTextContent('Private diary');
  expect(within(openDialog()).queryByRole('button', { name: 'Send to Anthropic' })).toBeNull();
  await user.click(within(openDialog()).getByRole('button', { name: 'Copy prompt' }));
  const reply = JSON.stringify({ suggestions: [{ ideaId: i.id, reason: 'Science', actions: [{ type: 'add_tags', tags: ['school'], category: null, projectId: null, targetKind: null, targetId: null, to: null }] }, { ideaId: 'nope', reason: '', actions: [] }] });
  await user.click(within(openDialog()).getByRole('textbox', { name: "Paste Claude's reply" }));
  await user.paste(`Here you go:\n${reply}`);
  await user.click(within(openDialog()).getByRole('button', { name: 'Check reply' }));
  expect(within(openDialog()).getByText('1 rejected')).toBeInTheDocument();
  await user.click(within(openDialog()).getByRole('button', { name: 'Apply selected' }));
  expect(useHQ.getState().ideas.find((x) => x.id === i.id)!.tags).toEqual(['school']);
  await user.click(await screen.findByRole('button', { name: 'Undo' }));
  expect(useHQ.getState().ideas.find((x) => x.id === i.id)!.tags).toEqual([]);
});
it('rejects a malformed reply without changing anything', async () => {
  // Same flow; paste "not json"; expect role=alert "Not valid JSON" and no state change.
});
it('shows Send to Anthropic only when an access code is saved', async () => {
  writeAccessCode('CODE');
  // open Ask Claude › plan my day → Next → button "Send to Anthropic" is present
});
```

Complete the last two tests following the first one's pattern.

- [ ] **Step 2: Run** `npx vitest run src/test/app.test.tsx -t "copy/paste|malformed reply|Send to Anthropic"` — expected: FAIL.
- [ ] **Step 3: Implement** the dialog, panel, entry points, commands, and menu items.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: PASS.
- [ ] **Step 5: Browser check** each job by copy/paste in the dev server (craft a reply by hand), including Undo from the toast and from Settings › Claude; confirm the Settings panel at 375px.
- [ ] **Step 6: Commit** — `git commit -am "Ask Claude: copy/paste and live flows, review, Settings panel"`.

### Task 23: Supabase Edge Function `phq-ai`

**Files:**
- Create: `supabase/functions/phq-ai/handler.ts` (no Deno globals, no npm imports), `supabase/functions/phq-ai/index.ts` (Deno entry), `supabase/functions/phq-ai/handler.test.ts`
- Modify: `vite.config.ts` only if Vitest doesn't pick up `supabase/**/*.test.ts` by default

**Interfaces:**
- Consumes: `AI_JOBS`, `AI_JOB_IDS`, `AI_LIMITS` from `../_shared/ai-jobs.ts`.
- Produces (`handler.ts`):
  - `ALLOWED_ORIGINS = ['https://crazyblunt.github.io', 'http://localhost:5173', 'http://localhost:4173']`
  - `interface HandlerEnv { apiKey?: string; accessCode?: string; model: string }`
  - `type CallClaude = (req: { model: string; system: string; user: string; schema: Record<string, unknown>; maxTokens: number }) => Promise<{ result: unknown; model: string; usage: { input_tokens: number; output_tokens: number } } | { refused: true }>`
  - `safeEqual(a: string, b: string): boolean` (constant time over the longer length)
  - `handle(req: Request, env: HandlerEnv, callClaude: CallClaude): Promise<Response>`
- Response contract (JSON bodies; CORS headers echo an allowed `Origin`; `Access-Control-Allow-Headers: content-type, apikey, authorization, x-client-info, x-phq-access`):
  - `OPTIONS` → 204. Non-`POST` → 405. `Origin` present and not allowed → 403. Missing `Origin` (curl) is allowed.
  - No `accessCode` env → 503 `{ error: 'not_configured', missing: [...] }` listing `PHQ_AI_ACCESS_CODE` and, if unset, `ANTHROPIC_API_KEY`.
  - `x-phq-access` missing or not `safeEqual` → 401 `{ error: 'unauthorized' }`.
  - Body longer than `AI_LIMITS.maxRequestBytes` → 413 `{ error: 'too_large' }`. Unparseable body or unknown `job` → 400 `{ error: 'bad_request' }`.
  - `job: 'ping'` → 200 `{ ok: true, apiKeySet: boolean, model }` (never calls Claude).
  - Any other job without `apiKey` → 503 `not_configured` with `missing: ['ANTHROPIC_API_KEY']`.
  - Otherwise `callClaude({ model, system: AI_JOBS[job].instructions, user: JSON.stringify(input), schema: AI_JOBS[job].schema, maxTokens: AI_JOBS[job].maxTokens })`; `{ refused: true }` → 422 `{ error: 'refused' }`; thrown error → 502 `{ error: 'upstream' }` (no request body in logs); success → 200 `{ result, model, usage }`.
- `index.ts`: `Deno.serve((req) => handle(req, { apiKey: Deno.env.get('ANTHROPIC_API_KEY'), accessCode: Deno.env.get('PHQ_AI_ACCESS_CODE'), model: Deno.env.get('PHQ_AI_MODEL') || 'claude-opus-5-5' }, callClaude))`. `callClaude` uses `import Anthropic from 'npm:@anthropic-ai/sdk@<exact version>'` (pick the newest version published at least 14 days ago: `npm view @anthropic-ai/sdk time --json`), `client.beta.messages.create({ model, max_tokens, system, messages: [{ role: 'user', content: user }], output_config: { effort: 'medium', format: { type: 'json_schema', schema } }, ...(FALLBACK_MODELS.includes(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}) })` with `FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']`; `stop_reason === 'refusal'` → `{ refused: true }`; otherwise `JSON.parse` the first text block.

- [ ] **Step 1: Write the failing tests** in `handler.test.ts`:

```ts
const env = { apiKey: 'k', accessCode: 'secret-code', model: 'claude-opus-5-5' };
const req = (body: unknown, headers: Record<string, string> = {}) => new Request('https://x/functions/v1/phq-ai', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://crazyblunt.github.io', 'x-phq-access': 'secret-code', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const never: CallClaude = async () => { throw new Error('should not be called'); };
it('reports missing secrets without revealing values', async () => {
  const r = await handle(req({ job: 'ping' }), { model: 'm' }, never);
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: 'not_configured', missing: ['PHQ_AI_ACCESS_CODE', 'ANTHROPIC_API_KEY'] });
});
it('rejects a wrong access code and foreign origins', async () => {
  expect((await handle(req({ job: 'ping' }, { 'x-phq-access': 'nope' }), env, never)).status).toBe(401);
  expect((await handle(req({ job: 'ping' }, { origin: 'https://evil.example' }), env, never)).status).toBe(403);
});
it('ping never calls Claude', async () => {
  const r = await handle(req({ job: 'ping' }), env, never);
  expect(await r.json()).toEqual({ ok: true, apiKeySet: true, model: 'claude-opus-5-5' });
});
it('rejects unknown jobs and oversized bodies', async () => {
  expect((await handle(req({ job: 'run_shell' }), env, never)).status).toBe(400);
  expect((await handle(req('x'.repeat(200_001)), env, never)).status).toBe(413);
});
it('builds the request from the shared job definition and returns the result', async () => {
  const call = vi.fn<CallClaude>().mockResolvedValue({ result: { focus: 'f', tasks: [] }, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 } });
  const r = await handle(req({ job: 'plan', input: { today: '2026-10-24', tasks: [], events: [] } }), env, call);
  expect(call.mock.calls[0][0]).toMatchObject({ system: AI_JOBS.plan.instructions, schema: AI_JOBS.plan.schema, model: 'claude-opus-5-5' });
  expect(await r.json()).toEqual({ result: { focus: 'f', tasks: [] }, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 } });
});
it('maps refusals to 422', async () => {
  expect((await handle(req({ job: 'plan', input: {} }), env, async () => ({ refused: true }))).status).toBe(422);
});
```

- [ ] **Step 2: Run** `npx vitest run supabase/functions/phq-ai/handler.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement** `handler.ts` and `index.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "Supabase Edge Function phq-ai (fixed jobs, access code, ping)"`.
- [ ] **Step 6: Deploy attempt.** Load the Supabase `deploy_edge_function` tool; deploy `phq-ai` to project `kpodgifoehudokciwlwq` with `verify_jwt: false`, entrypoint `index.ts`, files `index.ts`, `handler.ts`, `../_shared/ai-jobs.ts`. If the tool rejects the `_shared` path, copy `ai-jobs.ts` into `supabase/functions/phq-ai/ai-jobs.ts`, point the imports at it, add a Vitest test asserting the two files are byte-identical, commit, and redeploy.
- [ ] **Step 7: Verify.** `curl -s -i -X POST https://kpodgifoehudokciwlwq.supabase.co/functions/v1/phq-ai -H 'content-type: application/json' -d '{"job":"ping"}'` — expected: `503` with `{"error":"not_configured",...}` (secrets not set yet). Also from the dev app: Settings › Claude › Test connection with any code shows the "isn't set up on the server" message. If deploy or verification fails, record the exact error for the final report and leave the manual-deploy instructions in place. Never report success that wasn't observed.

# Stage 5: Docs and wrap-up

### Task 24: README, CLAUDE.md, final verification

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: README** — update the Sections table (My Day grid; Explorer; Linked panel; Ideas reminders), the Keyboard table (from `SHORTCUTS`, including `?`, `N`, `G X`, `⌘/Ctrl+Enter`, customize keys) and mention the menu bar; replace "Privacy and local suggestions" with "Suggestions and Claude": local rules, copy/paste mode, live mode (what each job sends, the preview, validation, undo), and "Set up live mode" (Claude Console key + credits + spending limit; Supabase secrets `ANTHROPIC_API_KEY`, `PHQ_AI_ACCESS_CODE`, optional `PHQ_AI_MODEL`; the access code on each device; Test connection; `supabase functions deploy phq-ai --no-verify-jwt` if the function isn't deployed). State plainly: Personal HQ works fully without any of it, and nothing costs money until a key with credits exists. Update "Your data" with the new fields, device-only access code and undo history, and the older-copy `itemLinks` limitation. Update the layout tree (`src/ai/`, `supabase/functions/phq-ai/`).
- [ ] **Step 2: CLAUDE.md** — architecture rows for grid, shortcuts/commands/menu, linking/explorer/tags, batches, `src/ai/`, the function; gotchas (commands live in `src/shell/commands.ts` and shortcuts in `src/app/shortcuts.ts`; link storage rules; `handler.ts` must stay runtime-free; shared job file; the function's deploy state as actually observed); unfinished items updated (remove fixed ones: idea reminders, Notes filter; add anything left open).
- [ ] **Step 3: Full verification** — `npm test`, `npm run typecheck`, `npm run build`: all pass. Browser pass in the dev server and the built preview (`personal-hq-build`): My Day grid (wide + 375px), menus, `?`, `N`, Explorer, Linked panel, Claude copy/paste + Undo, light and dark themes. No console errors.
- [ ] **Step 4: Commit** — `git commit -am "Docs for the grid, shortcuts, Explorer, and Claude"`.
- [ ] **Step 5: Ask Coda before pushing** (pushing to `main` deploys the live app). Push only on a yes; then confirm the GitHub Actions run succeeded.
