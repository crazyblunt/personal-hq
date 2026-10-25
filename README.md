# Personal HQ

A personal workspace that looks and works like an early-2000s desktop utility: one place for today's tasks, deadlines, ideas, notes, projects, and a calendar. It grew out of **Agent Command Center** and keeps everything that app stored.

Everything runs in your browser. There is no account and no paid service. Two optional extras use a free Supabase project: sync between your devices, and live Claude suggestions (which need your own Claude API key). Neither is required.

**Open it:** https://crazyblunt.github.io/personal-hq/

## Install it as an app

Personal HQ is an installable web app: it gets its own window and Dock icon, and opens offline once installed.

- **Mac, Chrome:** open the link, then click the install icon at the right end of the address bar (or ⋮ › Cast, save, and share › Install page as app).
- **Mac, Safari:** open the link, then File › Add to Dock.
- **iPhone / iPad:** open the link in Safari, then Share › Add to Home Screen.
- **Android:** open the link in Chrome, then ⋮ › Add to Home screen › Install.

Right-click the Dock icon (Chrome) for shortcuts to Inbox, Tasks, Calendar, and Notes.

Updates arrive automatically: the app checks for a newer version each time it opens while online.

### Moving your data from the Claude version

Each copy keeps its own data. To bring over what you had in the Claude artifact:

1. Open Personal HQ in Claude and go to Settings › Data › **Download backup** (or **Copy JSON** and save the text as a `.json` file).
2. Open the installed app, go to Settings › Data › **Import JSON…**, pick the file, tick *Also import settings*, and press **Import**.

The Claude copy is not changed. To keep your Mac and phone in step from then on, turn on sync (below).

## Sections

| Section | What it does |
| --- | --- |
| **My Day** | A dashboard laid out on a 12-column grid: today's tasks and priorities, deadlines (including idea reminders), active projects with progress, recent captures, a 30-day activity graph, quick actions, and optional clock, countdowns, focus timer, shortcuts, and random idea widgets. **Customize** lets you drag a widget by its title bar, resize it from its corner, show or hide it, **Tidy up** gaps, or reset. On a phone the widgets stack in one column. **Plan with Claude** suggests what to put on today's list. |
| **Inbox** | Everything captured but not organized yet: ideas and Inbox-status tasks. Turn items into tasks, notes, or projects, keep them as ideas, or delete them. **Organize review** (local rules) and **Ask Claude** suggest tags, categories, links, and conversions. |
| **Tasks** | List views (My Day, Upcoming, Overdue, All open, Completed), filters (project, priority, category, status), search, sorting, and a drag-and-drop board. Subtasks, due dates, categories, tags, project/milestone/calendar-event links. |
| **Calendar** | Month, week, and agenda views of events, task due dates, milestones, project target dates, and idea reminders. Overdue items are flagged. |
| **Ideas** | Brain dump. Type and press Enter. Links, `#tags`, and reminders are detected. Favorites, archive, links to other items, and conversion to tasks, notes, or projects (the idea is kept). Each card shows what the idea became and how many links it has. |
| **Projects** | Coding projects, school work, business ideas, and goals. Progress is computed from the project's tasks. Tags, milestones, bookmarks (repository, Claude Code sessions, pull requests, docs, sites), bugs, notes, ideas, linked items, history, archive and restore. **Break into tasks with Claude** proposes next tasks. |
| **Notes** | Searchable notes with autosave, tags, categories, favorites, project links, linked items, and a preview that renders `#` headings, bullets, and tickable `- [ ]` checklists. **Summarize with Claude** adds a summary above the note. Includes the **Prompt library** from Agent Command Center. |
| **Explorer** | One table of every task, note, idea, and project. Filter by type, text, tag, project, and state (open, done, archived); click a column to sort; save the current filters and sort as a named view. The **Tags** tab lists every tag with counts and can rename, merge, or remove a tag everywhere at once. |
| **Activity** | The log of real changes you made, with a daily graph and filters. |
| **Utilities** | Clock, countdowns, focus timer, random idea picker, recently used items, and your own shortcuts. |
| **Settings** | Themes, accent colors, density, startup page, defaults, My Day widgets, keyboard reference, sync, data tools (backup, import, recovery), and Claude. |

### Links between items

Every task, note, idea, and project has a **Linked** panel listing everything it's connected to, in both directions: links you added, items that link to it, the idea or note it came from, what an idea became, related ideas, and a note's linked tasks. **+ Link…** searches all four kinds of item. Links to an item that has been deleted are hidden, not removed.

### Quick add syntax (tasks)

Only the title is required. Optional shortcuts anywhere in the line:

- `!high`, `!low`, `!urgent` (or `!1` to `!4`) set the priority
- `#school` sets the category; further `#words` become tags
- `due:fri`, `due:tomorrow`, `due:2026-11-03`, `due:+3` set the due date
- ending with `today` or `tomorrow` also sets the due date ("Call mom tomorrow")

### Keyboard and menus

Press `?` anywhere for the full, searchable list. On a wide screen the menu bar (File, View, Go, Tools, Help) has every command with its shortcut; the command bar has them all too.

| Keys | Action |
| --- | --- |
| `Ctrl+K` / `⌘K` | Command bar: search everything, jump to sections, create items, run commands, open saved views |
| `/` | Command bar |
| `?` | Keyboard shortcuts |
| `C` | Quick capture |
| `N` | New item for this page: a task (My Day, Tasks), an idea (Inbox, Ideas), a note, a project, or an event |
| `G` then a letter | Go to a section: D My Day, I Inbox, T Tasks, C Calendar, E Ideas, P Projects, N Notes, X Explorer, A Activity, U Utilities, S Settings |
| `Ctrl+Enter` / `⌘Enter` | Save the open editor window |
| `Esc` | Close a window (asks first if you have unsaved edits) |
| `↑` `↓` `Enter` | Move and run in the command bar; start with `>` to show only commands |
| Arrows / `Shift`+arrows | In My Day's customize mode, with a widget's grip focused: move / resize it |

Single-key shortcuts never fire while you're typing in a field or while a window is open.

## Your data

**Where it lives.** All tasks, ideas, notes, projects, events, bugs, prompts, the activity log, settings, widget layout, links between items, and saved Explorer views are saved in this browser's IndexedDB database (`personal-hq`), which has room for hundreds of megabytes. Changes are saved automatically; the status bar shows "Saved", "Saving…", or an error. Earlier versions used `localStorage`; the first time this version opens it copies that data over and leaves the old copy in place. If IndexedDB can't be opened, the app falls back to `localStorage`.

**Protected storage.** On startup the app asks the browser to treat its storage as persistent, so it isn't cleared automatically when space runs low or (in Safari) after a stretch without use. Browsers decide on their own; installed apps are usually granted it. Settings › Data shows whether it was granted, and how much space is used.

**Each browser has its own copy.** A different browser, another computer, or a private window starts empty unless you turn on sync or import a backup. Clearing site data erases that browser's copy. When Personal HQ runs as a Claude artifact, the data belongs to that artifact's address in your browser.

**Daily snapshots.** The first time you open the app each day it saves a snapshot, and keeps the last 7. Settings › Data lists them with a Restore button. They protect against mistakes (a bad import, deleting the wrong thing), not against the browser's data being erased.

**Back up regularly.** Settings › Data › *Download backup (.json)* saves everything to a file (inside a Claude artifact you confirm the download first). *Copy JSON* puts the same backup on the clipboard. Keep backups somewhere safe. If you haven't downloaded one in 7 days (30 with sync on), a reminder appears at the top of the app.

**Importing.** Settings › Data › *Import JSON…* accepts Personal HQ and Agent Command Center backups. The file is validated first and you see a preview with counts. You then choose:

- *Add new records only* (default): nothing you have is changed or removed.
- *Add new and update older copies*: also replaces records the file has a newer version of.
- *Replace everything*: requires an extra confirmation.

Before any replace, restore, or *Delete all data*, a safety copy of the current data is saved and can be restored from Settings › Data. Records that can't be read are listed and skipped; unknown values (such as an unrecognized status) are corrected and reported.

**Kept on each device only.** The undo history for applied suggestions (last 10) and the Claude access code are stored on the device and are never synced or included in backups.

**Older copies.** Links between items, project tags, saved Explorer views, and the My Day grid layout are newer. A copy of the app that hasn't updated yet (the Claude artifact, or a tab or installed app that hasn't reloaded) doesn't show them. When an edit from such a copy arrives through sync, this device keeps its own links, tags, views, and layout. A backup exported from an older copy doesn't contain them, so importing it with *Add new and update older copies* or *Replace everything* drops them for the records it updates.

**Damaged or old data.** If stored data can't be parsed, it is copied to a recovery slot (Settings › Data › Recovery) instead of being thrown away. Data saved by a newer version of the app is never overwritten.

### Migration from Agent Command Center

On first launch, Personal HQ reads Agent Command Center's `acc:*` keys and copies everything into the new format:

- projects, tasks, bugs, notes, and prompts keep their ids, text, dates, and links
- the "Testing" task status becomes *In Progress* with a `#testing` tag
- pinned notes become favorites
- tasks or notes pointing at a deleted project are kept, unlinked
- the activity graph is seeded only from timestamps those records already had (created, completed, resolved), marked as coming from Agent Command Center

The original `acc:*` keys are never modified or deleted. Settings › Data shows whether any original records are missing from the workspace and can add them back.

No sample projects or fake activity are created. A new installation starts empty.

## Sync between devices

Settings › **Sync between devices** keeps your Mac, phone, and any other browser in step.

1. On the device that has your data, press **Turn on sync**. It uploads everything and shows a private 26-character code.
2. On each other device, open Personal HQ, go to Settings › Sync, enter the code, and press **Join**. Anything already on that device is merged in, not replaced.

After that, changes sync a few seconds after you make them, every minute while the app is open, when you switch back to it, and when the connection returns. The status bar shows "⇅ Synced 2:41 PM", "Syncing…", "Sync offline", or "Sync problem". If two devices change the same item, the most recent change wins; deletions sync too.

**Privacy.** Records are encrypted on your device (AES-256-GCM) with a key derived from your code before upload. The server stores ciphertext, opaque row names, and change times; it never sees the code, your text, or even which kind of record a row is. Treat the code like a password: anyone who has it can read and change your synced data. Show it again from Settings while sync is on. If the code is lost on every device, the cloud copy can't be opened (each device still keeps its own data).

**Turning it off.** *Turn off here* stops syncing on one device and keeps its data. *Delete cloud copy* erases the encrypted copy on the server; turn sync off on your other devices too, or they upload their next changes again.

**The server** is a free Supabase project (`personal-hq`, US East). Its only parts are one table, closed to direct access, and three functions (`supabase/migrations/`). Free projects pause after about a week with no requests at all; normal use keeps it awake, and a paused project can be restored from the Supabase dashboard. Sync isn't available inside the Claude artifact, which can't connect to other servers.

## Suggestions and Claude

Personal HQ works fully without Claude. There are three sources of suggestions, listed in Settings › Claude:

- **Local rules** (Organize review): keyword lists, word overlap, and fixed templates in `src/organize/rules.ts`. They run in the browser, send nothing anywhere, and are labeled as local suggestions everywhere.
- **Claude, copy/paste** (no setup): Ask Claude builds a prompt, you paste it into Claude.ai (any plan) and paste the reply back.
- **Claude, live** (optional, set up below): the same jobs, sent through your own Supabase function.

**Jobs, and exactly what each one shares.** Before anything is copied or sent, the Ask Claude window shows the exact data, and nothing else from your workspace is included (no settings, sync code, activity, or other items).

| Job | Where | What it shares |
| --- | --- | --- |
| Organize ideas | Ideas, Inbox, Tools menu | The ideas you tick (title, text, link, tags, category), your tag names, active project names |
| Summarize a note | Note toolbar | That note's title and text |
| Break a project into tasks | Project page | Project name, description, milestones, and the titles of its tasks |
| Plan my day | My Day | Today's date, up to 60 relevant open tasks (title, priority, status, due date, project name), today's event titles and times |

**Checks before anything changes.** A reply must be JSON in the job's exact shape, or it is rejected and nothing changes. Suggestions that mention an item that wasn't shared, use an action the job doesn't allow, or contain an invalid date are rejected and listed with the reason. Text is length-limited and shown as plain text; nothing in a reply is run or opened.

**Review and undo.** Each change shows before → after with a checkbox. Tags are added, never replaced; a summary goes above the note's text, which stays; converting an idea keeps the idea; likely duplicate tasks start unticked. Apply runs everything as one batch: **Undo** in the confirmation (and in Settings › Claude for the last 10 batches) puts it all back, skipping anything you've edited since. The local Organize review works the same way.

### Set up live mode (optional)

Live mode costs money only for the Claude API calls themselves; the Supabase function fits the free plan. A Claude.ai subscription does not include API use.

1. In the Claude Console, create an API key, add credits, and set a monthly spending limit.
2. In the Supabase dashboard (project `personal-hq`), open Edge Functions › Secrets and add:
   - `ANTHROPIC_API_KEY`: the key from step 1
   - `PHQ_AI_ACCESS_CODE`: a long random code, at least 20 characters (Settings › Claude › **Generate a code** makes a 32-character one)
   - optionally `PHQ_AI_MODEL`: defaults to `claude-opus-5-5`; `claude-haiku-5-5` costs far less
3. On each device, paste the same access code into Settings › Claude, press **Save**, then **Test connection**. It never calls Claude and costs nothing.

The function `phq-ai` (`supabase/functions/phq-ai/`) is deployed to the project and answers Test connection, but no request has reached Claude yet: the first real one happens after you add the API key, so check the result of your first live request. If it ever needs redeploying: `supabase functions deploy phq-ai --no-verify-jwt`. It accepts only the four jobs above, builds the instructions itself, checks the access code, limits request size, and never logs what you send. Live requests are **not** end-to-end encrypted: Anthropic receives the data shown in the preview. The API key stays on the server; the app only has the access code. Live mode isn't available inside the Claude artifact, which can't connect to other servers.

### Other privacy notes

With sync and live Claude off, nothing is sent to any server; fonts from Google Fonts are the only network request. With sync on, only encrypted records go to the sync server (see above).

Project links (GitHub repositories, Claude Code sessions, pull requests) are bookmarks that open in a new tab. Personal HQ cannot read or control those services, and the calendar is not connected to Google, Apple, or any other calendar.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # local dev server at http://localhost:5173
npm test           # Vitest suite
npm run typecheck  # TypeScript
npm run build      # type-check, then build
```

`npm run build` writes two files to `dist/`:

- `index.html`: the whole app in one file (scripts and styles inlined)
- `artifact.html`: the same page without the document wrapper, ready to publish as a Claude artifact

To keep existing data when publishing, update the **same** artifact (same URL). Browser storage belongs to the artifact's address, so a new artifact would start empty. Use the backup and import tools to move data otherwise.

### Deploying the hosted app

Pushing to `main` runs `.github/workflows/deploy.yml`: install, test, build, then publish `dist/` to GitHub Pages. A failing test stops the deploy. The installable-app pieces are in `public/` (`manifest.webmanifest`, `sw.js`, `icons/`); regenerate the icons with `node scripts/make-icons.mjs`. The service worker fetches the page from the network first and falls back to its cache offline; it never stores your data.

Note: every GitHub Pages site under `crazyblunt.github.io` shares one browser storage area. Personal HQ only uses keys starting with `phq:`, so other sites there won't collide with it, but they could read it, so don't host untrusted code under the same account's Pages.

### Project layout

```
src/
  data/          data model, validation, storage adapters, migration, store, selectors, backup,
                 links (linking.ts), Explorer rows and views, tags, undo batches
    adapters/    StorageAdapter interface; IndexedDB, localStorage, and in-memory implementations
  ai/            Ask Claude: inputs, copy/paste prompt, reply validation, review and apply, live client
  sync/          end-to-end encrypted sync: code and keys, engine, server transport, controller
  organize/      local rule-based suggestions and the provider interface
  app/           routing, UI state, clock, focus timer, file saving, device-only preferences
  shell/         title bar, sidebar, status bar, command bar
  editors/       editor windows (task, event, project, idea, bug, prompt) and quick capture
  features/      one folder per section
  ui/            shared controls: buttons, fields, dialogs, panels, chips, Linked panel
  lib/           dates, quick add, search, the My Day grid engine
supabase/
  migrations/    sync table and functions
  functions/     phq-ai (live Claude) and _shared/ai-jobs.ts (job definitions shared with the app)
```

Components never touch storage directly. All persistence goes through `StorageAdapter` (`src/data/adapters/types.ts`). Sync sits beside it: it reads the workspace, applies incoming changes through the store, and keeps its own state (code, last change seen, deletions) in the adapter's side store.

The sync server's address and publishable key are in `src/sync/config.ts` (public by design; override with `VITE_SYNC_URL` / `VITE_SYNC_KEY`). To use your own Supabase project, apply the SQL in `supabase/migrations/` and point those at it.

### Tech

React 19, TypeScript, Tailwind CSS 4, Vite, zustand, lucide-react icons, Vitest with Testing Library.
