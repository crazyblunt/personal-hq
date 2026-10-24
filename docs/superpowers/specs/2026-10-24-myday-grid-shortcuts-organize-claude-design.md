# Personal HQ: My Day grid, shortcuts, organization, Claude

Date: 2026-10-24. Status: approved in conversation, awaiting written review.

## Intent

Coda wants Personal HQ to feel like their own desktop: a My Day page they can lay out freely, shortcuts they can discover, a Notion-like way to connect and find tasks, notes, ideas, and projects, and practical help from Claude, all without losing the dark, compact, retro look or any saved data. The app must stay fully usable with no API key, no Supabase setup, and no paid service.

Success means:

- My Day widgets can be placed and resized (width and height) on a grid, the layout persists and syncs, and it can be reset.
- Every shortcut is listed in one reference panel, shown in menus and the command bar, and never fires while typing.
- Any task, note, idea, or project can link to any other, every item shows what links to it, tags work across all four types, and one table can filter and sort everything.
- Claude can organize ideas, summarize a note, break a project into tasks, and plan the day, through copy/paste with no setup, or live once configured, with transparent data sharing, strict validation, previews, and undo.
- Existing data loads unchanged; all new fields are additive.

## What already works (kept)

- My Day: 12 widgets; hide/show, drag or arrow reorder, S/M/L width, reset; saved in `settings.widgets` and synced.
- Shortcuts: `⌘/Ctrl+K`, `/`, `C`, `G` + letter; `isTypingTarget` and `anyModalOpen` guards; a list in Settings › Keyboard.
- Links: task → project/event/milestone; note → project and `taskIds`; idea → project and `relatedIds`; idea → task/note/project conversion keeps the idea and records `converted`.
- Search: command bar searches everything (6 per type); per-page filters; sorting on Tasks and Notes.
- Organization: local rule-based review (`src/organize/`), labeled "local suggestions"; `provider.ts` is the provider seam.

## Out of scope (decided)

Per-widget settings, new widget types, a separate phone layout, `[[ ]]` mentions, custom key bindings, bulk table actions, linking calendar events, global undo outside suggestion batches.

---

## 1. My Day grid

**Model.** `WidgetPref` gains optional `x, y, w, h` (grid cells). The grid has 12 columns at widths ≥ 1024px; a row is `2rem` (scales with density); gap `0.5rem`. Each widget definition gets a default size and a minimum size (initial values below, tuned during the browser check). `size` (`sm`/`md`/`lg`) is still written, derived from `w` (≤ 4 → sm, ≤ 8 → md, else lg), so older copies render sensibly.

| Widget | Default w×h | Min w×h |
| --- | --- | --- |
| today | 6×12 | 4×6 |
| deadlines, projects, captures | 6×8 | 3×4 |
| activity-graph | 6×6 | 4×4 |
| recent-activity | 4×8 | 3×4 |
| quick-actions | 4×5 | 3×4 |
| focus | 3×6 | 3×5 |
| clock, countdowns, shortcuts, random-idea | 3×5 | 2×3 |

**Migration.** On load, enabled widgets without a position are flowed into the grid in their current order: `w` from size (sm 4, md 8, lg 12), `h` from the default, each at the first row-major position where it fits. Hidden widgets get a position when shown again (first free spot that fits its default size). Nothing is removed.

**Grid engine** (`src/features/myday/grid.ts`, pure, unit-tested): `collides`, `firstFit`, `placeMissing`, `moveTo` (place at target cell, then push colliding widgets down, recursively), `resizeTo` (clamped to min size and 12 columns, then push down), `tidy` (float everything up to close gaps), `stackOrder` (sort by `y`, then `x`).

**Behavior.**

- Customize mode (existing button). Dragging a widget's title bar moves it, with an outline at the target cell; a corner handle resizes it in cells. Collisions push other widgets down; nothing floats up on its own, so gaps can be left on purpose. **Tidy up** closes gaps. **Reset layout** restores the defaults.
- Keyboard in customize mode: each title bar is focusable; arrows move one cell, Shift+arrows resize; changes are announced in a live region ("Today moved to column 3, row 5").
- Content taller than its box scrolls inside the widget.
- Below 1024px: one column in `stackOrder`, natural heights. Customize there offers show/hide and reset only, with a note that arranging happens on a wider screen.
- Settings › My Day widgets keeps show/hide; its width and order controls become an "Arrange on My Day" link and Reset.

## 2. Shortcuts and menus

**Registry.** `src/app/shortcuts.ts` lists every shortcut: id, display keys, label, group, scope (`global`, `customize`, `dialog`), and the command it runs. A pure matcher (`matchShortcut(event, state)`) decides what a key event does, so the typing guard and sequences are unit-tested. The global key handler, the `?` panel, Settings › Keyboard, command bar hints, and menu accelerators all read the registry.

**Commands.** The static command list moves out of `CommandBar.tsx` into one module (`src/shell/commands.ts`) with stable ids. The command bar, the menu bar, and shortcut hints use those ids, so a command exists once.

**Rules.** Single-key shortcuts never fire in inputs, textareas, selects, contenteditable, or while a dialog is open. Only `⌘/Ctrl` combos work everywhere. No browser-reserved combos (`⌘N`, `⌘T`, `⌘W`, `⌘L`, …).

**Shortcuts.**

| Keys | Action |
| --- | --- |
| `⌘/Ctrl+K`, `/` | Command bar (existing) |
| `C` | Quick capture (existing) |
| `G` + letter | Go to a section (existing), plus `G X` Explorer |
| `?` | Keyboard shortcuts panel (grouped, with a filter box) |
| `N` | New item for the current page: My Day/Tasks → task (on My Day it is added to today), Inbox/Ideas → capture idea, Notes → note, Projects → project, Calendar → event, elsewhere → task |
| `⌘/Ctrl+Enter` | Save in any editor window (handled once in `ui/Dialog.tsx` via `requestSubmit`) |
| Arrows / Shift+arrows | Move / resize the focused widget in My Day customize mode |
| `Esc` | Close windows (existing) |

**Menu bar** (`src/shell/MenuBar.tsx`), in the title bar at ≥ 1024px: File (new task/note/idea/project/event, capture, import, download backup), View (customize My Day, Explorer, theme, density), Go (sections with their `G` keys), Tools (command bar, Organize review (local), Ask Claude ▸, focus timer), Help (keyboard shortcuts, data & backups). Opens on click; arrow keys move between items and menus; Enter runs; Esc closes and returns focus. Uses the ARIA menubar pattern. Everything in the menus is also in the command bar; the phone drawer gets a "Keyboard shortcuts" entry.

**Command bar** shows each command's shortcut on the right, not only "Go to".

## 3. Organization

**Data.**

- `ItemRef = { kind: 'task' | 'note' | 'idea' | 'project'; id: string }`.
- `itemLinks: ItemRef[]` on `Task`, `Note`, `Idea`, `Project` (default `[]`). Named to avoid `Project.links` (URL bookmarks).
- `Project.tags: string[]` (default `[]`).
- `Settings.views: SavedView[]` (default `[]`), `SavedView = { id, name, filters: { kinds, query, tag, projectId, state }, sort: { key, dir } }`.

**Where a link is stored.** Idea↔idea pairs always use `relatedIds` (symmetric, existing). Note–task pairs always use the note's `taskIds`, whichever side adds the link. Every other link goes in `itemLinks` on the item it was added from. Store actions `linkItems(a, b)` and `unlinkItems(a, b)` route to the right field, log activity, and edit whichever record holds the link. Links whose target is missing (deleted, or not yet synced) are hidden, not removed.

**Link index** (`src/data/links.ts`, pure): builds, per item, the deduplicated list of connections with a relation label: linked, linked from, source idea/note, converted to, related idea, linked task, linked note (a note whose `taskIds` includes this task). Project membership stays in the existing Project field and is not repeated.

**Linked panel** (`src/ui/LinkedItems.tsx`) in the task, note, and idea editors and on the project page: rows with type icon, title, and relation; click opens the item; × removes where removal is meaningful; **+ Link…** opens a picker that searches tasks, notes, ideas, and projects (reusing `scoreMatch`). It replaces the idea editor's "Related ideas" and the note editor's "Linked tasks" sections.

**Explorer** (new section `explorer`, label "Explorer", `G X`, sidebar entry under Notes):

- *Items tab*: one table of tasks, notes, ideas, projects. Columns: type, title, status, project, tags, date (due / target / reminder), updated, links. Header click sorts (asc/desc). Filters: type, text, tag, project, state (open / done / archived / all). Row click opens the item. Phones get a two-line list. Rows come from pure selectors in `src/data/explorer.ts` (`explorerRows`, `filterRows`, `sortRows`).
- *Saved views*: "Save view" stores filters + sort with a name in `settings.views` (synced). Views appear as tabs at the top of Explorer and as command bar commands ("Open view: School"); rename and delete from the tab.
- *Tags tab*: every tag with counts per type; click filters Items by that tag. **Rename** applies to every item with the tag; renaming to an existing tag merges them (no duplicates on any item). **Remove** takes the tag off every item. Both confirm first, write one activity entry, and change items through store actions so sync records each one. Tags match case-insensitively.
- The command bar's search results end with "See all results in Explorer" (opens Items with the query).

**Conversions keep content.** Idea → project carries the idea's tags and adds an `itemLinks` entry back to the idea. Note → task keeps the whole note body (the 4,000-character cut is removed). Every converted item shows its source in the Linked panel.

**Small fix.** The Notes list category filter no longer truncates "All categories".

## 4. Claude

**Optional.** Nothing in the app requires an API key, Supabase setup, or a paid API. Local suggestions keep working on their own. Copy/paste mode works with any Claude.ai account. Live mode appears only after setup on that device, and never inside the Claude artifact (its CSP blocks other hosts).

**Jobs, and the only data each sends.**

| Job | Input sent | Output (validated) |
| --- | --- | --- |
| Organize ideas | Selected ideas (Inbox by default, max 50): id, title, body, url, tags, category. Existing tag names. Active projects: id, name. | Per idea: actions from `add_tags`, `set_category`, `set_project` (a sent project), `link` (a sent idea or project), `convert` (`task`/`note`/`project`); a reason. |
| Summarize note | That note's title and body. | `summary` (≤ 1,200 chars), `keyPoints` (≤ 8), `actionItems` (≤ 10: title, optional due date). |
| Break project into tasks | Project name, description, milestones (id, title, due date), titles of the project's tasks, today's date. | Up to 20 tasks: title, optional description, priority, optional due date, optional milestone id (a sent one). |
| Plan my day | Today's date; up to 60 open tasks that are overdue, due within 7 days, on My Day, in progress, or high/urgent: id, title, priority, status, due date, project name. Today's events: title, time. | `focus` (≤ 400 chars); up to 12 task ids (sent ones) with a short reason. |

Nothing else is sent: no settings, sync code, activity, or other records. Task descriptions are never sent by Plan my day or Break into tasks.

**Shared job definitions.** Instructions, output JSON schemas, and limits live in one module shared by the app (for copy/paste prompts and validation) and the Supabase function. Preferred location: `supabase/functions/_shared/ai-jobs.ts`, imported by both. If the function bundler can't include it, the function gets a generated copy and a test fails when the copies differ.

**Flow** (`src/ai/AskClaudeDialog.tsx`):

1. Choose the items (where the job allows).
2. Preview: the exact JSON input, pretty-printed and scrollable, with item counts.
3. Either **Copy prompt** (instructions + schema + input) → paste into Claude.ai → paste the reply back, or **Send to Anthropic** (live mode only; this screen is the confirmation).
4. Validate (below), then review.
5. Review: each change shown as before → after with a checkbox; created items listed; rejected suggestions listed with reasons; live replies show model and token counts. Labeled "Claude suggestion".
6. **Apply** selected changes, recorded as an undoable batch.

**Validation** (`src/ai/validate.ts`, in the app, for both paths):

- Extract JSON from the reply (code fences tolerated). Not JSON, or not the job's shape → whole reply rejected with the reason; nothing applied.
- Every id must be one of the ids sent for this job; otherwise that suggestion is rejected.
- Actions must be in the job's fixed list; otherwise rejected.
- Dates must be valid `YYYY-MM-DD` between one year ago and five years ahead; otherwise rejected.
- Text is length-capped and treated as plain text; tags are cleaned to the app's tag format.
- Suggestions map only to specific store actions on items within the job. Replies are never executed, rendered as HTML, or used to fetch anything.

**Applying safely** (`src/ai/apply.ts`):

- Tags are added, never replaced. Summaries are inserted above the note body under a divider; the body is unchanged. Conversions keep the idea.
- Proposed tasks that match an open task in the same project (normalized title), or a task already on My Day, are flagged as duplicates and unticked.
- Each Apply records a batch: the previous version of every changed record, the ids of created records, and their stamps after applying. **Undo** (in the result toast, and for the last 10 batches in Settings › Claude) restores previous versions and removes created records through store actions, so sync propagates it. Records changed since the batch are skipped and listed. Batches are stored on the device (adapter aux `undo`), not synced or backed up.
- The local Organize review uses the same apply and undo.

**Live path: Supabase Edge Function `phq-ai`** (`supabase/functions/phq-ai/index.ts`, Deno):

- `POST` only (plus CORS preflight). Allowed origins: `https://crazyblunt.github.io`, `http://localhost:5173`, `http://localhost:4173`.
- Header `x-phq-access` must match secret `PHQ_AI_ACCESS_CODE` (constant-time compare). Missing secrets → `503 not_configured` naming which are missing, never their values.
- Body ≤ 200 KB; `job` must be one of the four, or `ping`. `ping` never calls Claude and reports whether the API key is set and which model is configured.
- Builds the instructions on the server from the shared job definitions; calls the Claude API with the official SDK (`npm:@anthropic-ai/sdk`), structured JSON output, model from `PHQ_AI_MODEL` (default `claude-opus-5-5`), explicit effort, and server-side refusal fallback enabled. Returns `{ result, model, usage }`; a refusal returns a clear error.
- Doesn't log request bodies. JWT verification is off at the gateway; the access code is the gate.

**Settings › Claude** (new panel): providers (Local rules · local; Claude copy/paste · manual; Claude live · sends data to Anthropic, not end-to-end encrypted, off until set up); access code field (stored on this device only, `phq:device:ai-code`, not synced or backed up); **Generate code** (random, for copying into Supabase); **Test connection** (`ping`); setup steps; recent applied batches with Undo.

**Entry points.** Tools › Ask Claude menu, command bar, Ideas and Inbox headers (Organize ideas), note editor (Summarize), project page (Break into tasks), My Day header (Plan my day).

**Responsibilities.**

| Who | What |
| --- | --- |
| Claude Code | Write the function and app code. Try deploying `phq-ai` with the Supabase connector and test it with `ping` (expected: `not_configured` until secrets exist). Report only what actually succeeded. |
| Coda (only for live mode) | Create a Claude Console API key, add credits, set a spending limit. Add `ANTHROPIC_API_KEY` and `PHQ_AI_ACCESS_CODE` (optionally `PHQ_AI_MODEL`) under Supabase › Edge Functions › Secrets. Paste the access code into Settings › Claude on each device. If the connector deploy fails: `supabase functions deploy phq-ai --no-verify-jwt` (steps in README). |

The function fits Supabase's free plan. Only Claude API calls cost money, and only after a key with credits exists.

## 5. Ideas connected to the rest of the app

- `calendarItems` includes idea reminders (`remindOn`) for ideas that aren't archived: they appear in the Deadlines widget and in every calendar view, flagged overdue when past, and open the idea when clicked. They stop showing once the reminder is cleared or the idea is archived.
- Idea cards show what the idea became ("→ Task: Finish lab report", clickable) and a link count.
- Ideas and Inbox headers get "Ask Claude" next to "Organize review".

## Data safety

- All changes are additive: `WidgetPref.x/y/w/h`, `Settings.views`, `itemLinks` on four types, `Project.tags`. Normalizers fill defaults and drop malformed entries with a warning. No schema version bump. Backup format unchanged; old backups import.
- `explorer` is added to `SECTIONS`; an older copy that reads `startupPage: 'explorer'` falls back to its default.
- Nothing is deleted or rewritten; `acc:*` keys stay untouched.
- Device-only: AI access code, undo batches.
- Known limitation: editing an item in an older copy (the Claude artifact, or a tab that hasn't loaded the update) drops that item's `itemLinks`.

## Testing

- Unit: grid engine (migration from S/M/L, first fit, move with push-down, resize clamps, tidy, stack order); shortcut matcher (typing and dialog guards, `G` sequences, `?`, `N` targets); link index (each relation, dedupe, missing targets) and link/unlink routing; tag rename/merge/remove; Explorer rows, filters, sorting; normalizers for every new field; conversions keeping full content; idea reminders in `calendarItems`; AI input builders (only the listed fields), prompt text, JSON extraction, every validation rule, duplicate detection, apply and undo (including skipped records).
- App (Testing Library): menu bar keyboard navigation; `?` panel; `N` per page; `⌘/Ctrl+Enter` saves; Linked panel add/remove; Explorer saved view; copy/paste → review → apply → undo.
- Browser: dev server at desktop and phone widths, light and dark themes; grid drag/resize and keyboard moves; menus; Explorer; Claude copy/paste flow.
- Function: shared validators run in Vitest; after deploy, `ping` from the app. A real Claude call can't be tested until Coda adds a key, and the report will say so.
- `npm test`, `npm run typecheck`, `npm run build` before each commit.

## Stages

1. My Day grid
2. Shortcuts and menus
3. Links, Explorer, tags, conversions, Ideas changes
4. Claude: copy/paste, live path, apply/undo, Settings panel, function deploy attempt
5. Docs: README and CLAUDE.md

Each stage: implement → tests → typecheck → browser check → commit. Push to `main` (which deploys the live app) only after all stages pass and Coda confirms.
