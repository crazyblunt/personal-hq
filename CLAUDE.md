# Personal HQ

Retro desktop-style personal workspace (tasks, ideas, notes, projects, calendar) for one user, Coda. React 19 + TypeScript 7 + Tailwind 4 + Vite 8 + zustand 5, Vitest 5. Live at https://crazyblunt.github.io/personal-hq/ (public repo `crazyblunt/personal-hq`). User-facing docs are in README.md; this file is for whoever works on the code next.

## Commands

Node is a user-local install and is **not on PATH**. Prefix every session with:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

- `npm run dev`: dev server on :5173
- `npm test`: Vitest (30 files, 218 tests, about 15 s; includes `supabase/functions/phq-ai/handler.test.ts`)
- `npm run typecheck`: `tsc -b`
- `npm run build`: typecheck, then emits `dist/index.html` (hosted app) and `dist/artifact.html` (Claude artifact copy)
- `npm run preview`: serves `dist/` on :4173

Pushing to `main` runs `.github/workflows/deploy.yml` (npm ci → test → build → GitHub Pages). A failing test blocks the deploy. Commits use the repo-local identity "Coda Noyes" with the GitHub noreply address; there is no global git identity.

## Handoff

State as of 2026-10-25: the My Day grid, shortcut registry and menu bar, links/Explorer/tags, and Ask Claude work (spec `docs/superpowers/specs/2026-10-24-myday-grid-shortcuts-organize-claude-design.md`, plan in `docs/superpowers/plans/`) is on branch `feature/myday-grid-organize-claude`, not yet merged into `main` or pushed. The Supabase function `phq-ai` is deployed (see "Live Claude function"). The Supabase migrations in `supabase/migrations/` match what is applied. The user has not yet imported their real data into the hosted app, turned sync on, or set up live Claude.

### Architecture

Data flows one way: components read from `useHQ` (zustand) and change data only through action functions in `src/data/store.ts`. Each action updates memory, logs real activity, and queues a debounced save through a `StorageAdapter`. Nothing in the UI touches storage directly.

| Area | Files | Notes |
| --- | --- | --- |
| Model | `src/data/types.ts` | 8 collections (tasks, ideas, notes, projects, events, bugs, prompts, activity) + `settings`. Dates without time are `YYYY-MM-DD` "date keys"; timestamps are ISO. Tasks, notes, ideas, and projects have `itemLinks: ItemRef[]`; projects have `tags`; settings has `views` (saved Explorer views) and widget `x/y/w/h`. |
| Validation | `src/data/normalize.ts` | Every record from storage, imports, and sync goes through `normalizeCollection`. Unusable records are errors; bad enum values fall back to defaults with a warning. |
| Store | `src/data/store.ts` | Actions, activity logging (edits to the same item within 10 min coalesce; log capped at `ACTIVITY_LIMIT` = 3000), save queue (`flush`), `replaceWorkspace` (takes a safety snapshot first), sync hooks (`onLocalDelete`, `applyRemoteChanges`). For other `src/data` modules only: `patchRecord`, `removeRecords`, `restoreRecord`, and `setBatchRecorder` (hooks `patch`/`insert`/`removeWhere` for undo). |
| Links | `src/data/linking.ts`, `src/ui/LinkedItems.tsx` | `buildLinkIndex` folds `itemLinks`, `relatedIds`, note `taskIds`, `source`, and `converted` into one connection list per item, one entry per pair (precedence: source/converted-to > related idea > linked task/note > linked/linked-from). Missing targets are hidden. `useLinkIndex` keeps one cached index for the whole app. |
| Explorer, tags | `src/data/explorer.ts`, `src/data/tags.ts`, `src/features/explorer/` | Pure row/filter/sort functions; views stored in settings; `renameTag` (renaming onto an existing tag merges) and `removeTag` patch every item and log one activity entry. |
| Undo | `src/data/batches.ts`, `src/app/undo.ts` | `recordBatch(label, source, fn)` records previous versions and created ids; `undoBatch` restores/removes through the store, skipping records changed since (compared by `updatedAt`). Last 10 kept in adapter aux `undo` (device only). Used by Claude apply and the local Organize review. |
| My Day grid | `src/lib/grid.ts`, `src/data/defaults.ts`, `src/features/myday/WidgetGrid.tsx` | Pure grid engine (12 columns; collisions push down; `tidy` floats up). `WIDGET_SIZE_HINTS`, `placeWidgets` (fills missing positions, used by the normalizer as migration from S/M/L). Below 1024px widgets stack in reading order. |
| Commands, shortcuts | `src/shell/commands.ts`, `src/app/shortcuts.ts`, `src/shell/MenuBar.tsx`, `src/shell/ShortcutsDialog.tsx` | Every command has a stable id in `useAppCommands`; `SHORTCUTS` + `matchShortcut` (pure, tested) drive the key handler; the menu bar, `?` window, Settings › Keyboard, and command bar hints all read these. |
| Claude | `src/ai/`, `supabase/functions/_shared/ai-jobs.ts`, `supabase/functions/phq-ai/` | Four jobs. `inputs.ts` builds the minimal data per job; `prompt.ts` the copy/paste prompt; `extract.ts` pulls JSON out of a pasted reply; `validate.ts` checks shape, ids (only ids that were sent), actions, dates, lengths; `apply.ts` builds review rows and applies a batch; `live.ts` calls the function; `AskClaudeDialog.tsx` is the window. |
| Derived data | `src/data/selectors.ts` | My Day rules, task views, project progress (completed ÷ total tasks), calendar items, activity series. Pure and tested. |
| Storage | `src/data/adapters/` | `indexeddb.ts` (default) wraps `idbStorage.ts`, a `Storage`-shaped in-memory map written through to IndexedDB, so it reuses all of `local.ts`. Fallbacks: `local.ts` (localStorage), `memory.ts`. Keys: `phq:<collection>`, `phq:settings`, `phq:meta`, `phq:snapshot` (one safety copy), `phq:daily:<date>` (last 7), `phq:aux:<name>` (sync state), `phq:recovery:*` (unreadable data kept, never dropped). |
| Legacy | `src/data/legacy.ts` | One-time migration from Agent Command Center's `acc:*` localStorage keys. Never modifies or deletes them. |
| Backup | `src/data/backup.ts`, `src/app/backupActions.ts` | Export JSON; import with preview and three modes (`add` default, `update`, `replace`). Accepts Agent Command Center exports. |
| Safety | `src/app/safety.ts` | `navigator.storage.persist()`, storage estimate, daily snapshots (IndexedDB only), backup reminder timing. |
| Sync | `src/sync/` | See below. |
| App state | `src/app/` | `router.ts` (hash tokens), `ui.ts` (open editors, dialogs, toasts with an optional action button, recent items, cross-page requests), `clock.ts` (one shared ticker), `focus.ts`, `media.ts` (`useMediaQuery`), `deviceStorage.ts` (per-device prefs under `phq:device:*`, not backed up or synced; includes `ai-code`). |
| UI | `src/shell/`, `src/editors/`, `src/features/<section>/`, `src/ui/` | Shell = title bar, sidebar, status bar, command bar. Editors are modal windows opened via `openEditor()` and rendered by `EditorHost`. Shared controls in `src/ui/`. |
| Organizer | `src/organize/` | Local keyword rules, word overlap, fixed checklist templates. Labeled "local suggestions" everywhere. `provider.ts` lists `SUGGESTION_SOURCES` (local, Claude copy/paste, Claude live) for Settings › Claude. |
| Theming | `src/index.css` | All colors are CSS variables. `data-hq-theme`, `data-hq-accent`, `data-hq-density` on `<html>` swap tokens. Sizes are rem, so density changes the root font size. |
| Install/offline | `public/manifest.webmanifest`, `public/sw.js`, `scripts/make-icons.mjs` | Service worker is network-first for the app, cache-first for Google Fonts. Icons are generated by a dependency-free pixel-art script. |
| Build | `vite.config.ts` | `singleFile()` plugin inlines JS/CSS into one HTML file and writes `artifact.html` (no doc wrapper, no manifest/SW tags). |

### Supabase sync design

**Server.** Project `personal-hq`, ref `kpodgifoehudokciwlwq`, US East, free plan, org "crazyblunt's Org". Schema: `supabase/migrations/0001_phq_sync.sql`, `0002_phq_sync_anon_only.sql`.

- One table, `public.phq_sync_rows (space, k, updated_at, payload, seq)`, primary key `(space, k)`. RLS is on with no policies, and table privileges are revoked, so direct REST access fails (verified: 42501).
- Three `SECURITY DEFINER` RPCs, executable by `anon` only:
  - `phq_sync_pull(space, since, limit)`: rows with `seq > since`, oldest first, at most 1000
  - `phq_sync_push(space, rows jsonb)`: upsert; an existing row is replaced only when the incoming `updated_at` is greater. Max 500 rows per call, 100,000 per space.
  - `phq_sync_delete_space(space)`
- Supabase's advisors warn that anon can execute SECURITY DEFINER functions, and that RLS has no policies. Both are intentional: access is gated by knowing the 64-hex space id, which is a hash of a 130-bit secret.

**Client** (`src/sync/`):

- `crypto.ts`: the user's sync code is 26 Crockford base32 chars (130 bits, generated on device). `space = SHA-256("phq-space-v1:" + code)`. HKDF from the code derives an AES-256-GCM key (payloads) and an HMAC key (row names: HMAC of `"<collection>:<id>"`). The server sees only space, opaque row names, timestamps, and ciphertext. Input is forgiving (case, dashes, O→0, I/L→1).
- `engine.ts` (`syncOnce`): pull pages since `lastSeq` → decrypt → merge per record → push changes in batches of 200.
  - Record stamp = `updatedAt` (activity uses `at`; settings use `settings.updatedAt`), canonicalized with `toISOString()`. The server compares them as strings and its CHECK constraint requires the exact `YYYY-MM-DDTHH:MM:SS.sssZ` format.
  - `shadow` maps record key → stamp last exchanged; that's how each side knows what's new.
  - `tombstones` record local deletions so they propagate. They're pruned 90 days after being pushed.
  - Last write wins. A remote change is applied only if it's newer than the local record or tombstone; a newer local edit beats an older remote deletion.
  - Settings travel as a single record keyed `settings:settings`.
- `controller.ts`: `enableSync` / `joinSync` (refuses codes with no data on the server, so a typo can't start an empty space) / `disableSync` / `deleteCloudCopy` / `syncNow`. Triggers: 4 s after any local change, every 60 s while visible, on `visibilitychange` and `online`. Rounds are serialized and use `navigator.locks` across tabs. A `generation` counter stops a round that outlives its session. Sync state (including the code) is stored on the device in `phq:aux:sync`.
- `transport.ts`: `fetch` to `/rest/v1/rpc/*`. New `sb_publishable_` keys go in the `apikey` header only; legacy JWT keys also go in `Authorization`. `createMemoryTransport()` implements the same rules for tests.
- `config.ts`: URL and publishable key are committed on purpose (public by design). Override with `VITE_SYNC_URL` / `VITE_SYNC_KEY`.

### Live Claude function

`supabase/functions/phq-ai/` on project `kpodgifoehudokciwlwq`, deployed 2026-10-25 through the Supabase connector as version 1, `verify_jwt: false` (the `x-phq-access` code is the gate). Files: `index.ts` (Deno entry, `npm:@anthropic-ai/sdk@0.133.0`), `handler.ts` (all request logic, runtime-free, tested), `../_shared/ai-jobs.ts`.

- Verified after deploy: POST `{"job":"ping"}` → 503 `not_configured` naming both missing secrets; preflight from `https://crazyblunt.github.io` → 204 with CORS; a foreign `Origin` → 403. Settings › Claude › Test connection shows the same.
- Secrets the user sets in the dashboard: `ANTHROPIC_API_KEY`, `PHQ_AI_ACCESS_CODE`, optional `PHQ_AI_MODEL` (default `claude-opus-5-5`). None are set yet, so **no real Claude call has been tested**. The first live request will be the first check of the SDK call shape (`beta.messages.create` with `output_config: {effort, format: {type: 'json_schema'}}` and, for Opus/Sonnet/Fable, `fallbacks: 'default'` + beta `server-side-fallback-2026-07-01`).
- Redeploy with the connector (`deploy_edge_function`, same three files) or `supabase functions deploy phq-ai --no-verify-jwt`.

### Gotchas

- **Never destroy user data.** Migrations are additive: `acc:*` keys and the old `phq:*` localStorage copy stay forever. Deletions must go through store actions (`removeWhere`) or `replaceWorkspace` so sync records tombstones. `applyRemoteChanges` intentionally doesn't log activity or create tombstones.
- **Two deployments share one codebase.**
  - Hosted PWA: the user's main copy.
  - Claude artifact at https://claude.ai/artifact/3WXJKxNXpPxrpyeoogMtBA: publish `dist/artifact.html` with `capabilities: {downloads: true}`, always to that same URL, because its data lives in that origin's storage.
  - Sync can't run inside the artifact (its CSP blocks other hosts), so `syncAvailable()` turns it off there.
  - The artifact is still on its first release (published before the PWA, IndexedDB, and sync work), so it's behind the hosted app.
- **Hash routing uses bare tokens** (`#tasks`, `#projects.<id>`) so links work inside the artifact viewer. Settings is `#prefs` because the viewer reserves `#settings`.
- **zustand v5 selectors must return stable values.** A selector that builds a new object or array on every call loops forever; wrap it in `useShallow`, or select primitives or existing references.
- **Native `<dialog>` + Chrome:** Escape can close a modal without a cancelable `cancel` event. `ui/Dialog.tsx` listens to the native `close` event to keep React state in step, and reopens with an "unsaved changes" prompt when `dirty`. Don't remove that. `anyModalOpen()` keeps global shortcuts out of open dialogs.
- **Command bar runs actions synchronously.** Deferring them with `setTimeout` lost them under real key presses.
- **StrictMode:** don't guard effects with "already ran" refs. A guarded `startRouter` lost its listeners after StrictMode's mount/unmount/mount.
- **The artifact host injects unlayered `body` styles** (white background, 14px system font). Page-level rules in `index.css` sit outside `@layer` so they win. `:root` safe-area padding deliberately matches the host's values, so it never stacks.
- **Field sizes:** `fieldBase` includes `w-full`. `Input`, `Select`, and `Textarea` drop it when `className` has its own `w-*`, and `Input`/`Select` drop their default `h-7` when it has an `h-*`; otherwise Tailwind's class order lets the defaults win.
- **GitHub Pages origin is shared:** every Pages site under `crazyblunt.github.io` shares one storage origin, including the IndexedDB database `personal-hq`.
- **Service worker cache** is named `phq-shell-v1`. Bump the name if the precache list changes. New deploys appear on the next load, since the page itself is fetched network-first.
- **Supabase free projects pause** after about 7 days with no requests. The transport reports that as a server error, with a hint to restore the project from the dashboard.
- **The Supabase MCP connector here can't create projects:** it asks for a cost-confirmation step it can't perform. The user has to create projects in the dashboard. Migrations, SQL, and advisors work.
- **Tests:**
  - IndexedDB tests import `fake-indexeddb/auto`.
  - jsdom lacks `showModal` and `scrollIntoView`; the code guards both.
  - Don't assert that short strings are absent from ciphertext, since random base64 can contain them.
  - In the dev server console, `window.__hq` exposes the live stores. Dynamically importing `/src/...` can return a stale module copy after hot reload. After changing `SECTIONS` or other module-level constants, reload the page fully.
  - jsdom has no `matchMedia` (use `mockMatchMedia` from `src/test/helpers.ts`; components treat it as narrow) and doesn't close `<dialog>` on Escape (click Close instead).
  - `renderApp` in `app.test.tsx` resets UI-store fields that leak between tests (`myDayCustomize`, `shortcutsOpen`, `askClaude`). Add new open/closed UI flags there.
- **Commands and shortcuts live in one place each.** Add a command to `useAppCommands` (stable id), then reference that id from `SHORTCUTS` or `MENUS`. Menus skip ids that don't exist.
- **Where links are stored:** idea↔idea uses `relatedIds`, note↔task uses the note's `taskIds` (whichever side adds it), everything else uses `itemLinks` on the item it was added from. Go through `linkItems`/`unlinkItems`. Editor drafts must not include link fields (the note editor's autosave would overwrite links the panel saved).
- **`handler.ts` and `_shared/ai-jobs.ts` must stay free of Deno globals and imports** (ai-jobs is bundled into the app too). Relative imports there use `.ts` extensions for Deno; `tsconfig.json` has `allowImportingTsExtensions` and includes those files, but not `index.ts`.
- **Wide content in a CSS grid column:** an implicit `auto` column grows to its widest child, even one inside an `overflow-x-auto` box. Use `grid-cols-1` (`minmax(0, 1fr)`) for single-column grids that contain tables (Settings had this bug at 375px).
- **No linter is configured.** A few `// eslint-disable-line` comments exist anyway.

### Unfinished / next steps

- **This branch:** merge `feature/myday-grid-organize-claude` into `main` and push (that deploys the hosted app). Waiting on the user's OK.
- **User to-dos:** import the backup from the Claude artifact into the hosted app (Settings › Data), then turn sync on (Mac first, then phone with the code). For live Claude (optional): add the two secrets and the access code (README › Set up live mode).
- **Live Claude is untested end to end** until a key exists. Check the first real request of each job; adjust `index.ts` if the API rejects a parameter.
- **No notifications while the app is closed.** That needs web push, which needs a server. It would build on the Supabase project.
- **Settings sync wholesale,** including theme, density, widget layout, and saved views. Per-device appearance would need those fields excluded from the `settings:settings` record.
- **Sync has no "change my code" / key rotation.** "Delete cloud copy" doesn't notify other devices; they'll re-upload their next changes unless turned off. There's no conflict view (last write wins silently, per record, so concurrent edits to the same item from two devices can drop one side, including `itemLinks`).
- **Older copies drop `itemLinks`** when they save an item (the Claude artifact, or a tab that hasn't reloaded).
- **Not verified on real hardware:** the Install button flow; the iOS standalone app (especially the backup download, which may need Copy JSON instead); storage persistence being granted when installed; touch dragging on a tablet wide enough for the grid.
- **Command bar focus:** the search box gets focus one tick after the bar opens; keystrokes sent within that tick (only automation does this) land elsewhere.
- **Not built:** recurring tasks/events, general undo (only suggestion batches can be undone), calendar drag-to-reschedule, richer note markdown (bold, italics, code blocks), attachments, `[[ ]]` mentions, per-widget settings.
- **The Claude artifact copy is outdated.** Republish it (same URL) or tell the user it's retired.
- **Bundle size:** a single 658 KB file (191 KB gzipped) with no code splitting. Fine for now.
