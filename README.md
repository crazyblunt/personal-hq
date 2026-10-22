# Personal HQ

A personal workspace that looks and works like an early-2000s desktop utility: one place for today's tasks, deadlines, ideas, notes, projects, and a calendar. It grew out of **Agent Command Center** and keeps everything that app stored.

Everything runs in your browser. There is no account, server, database, or paid service.

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
| **My Day** | Customizable dashboard: today's tasks and priorities, deadlines, active projects with progress, recent captures, a 30-day activity graph, quick actions, and optional clock, countdowns, focus timer, shortcuts, and random idea widgets. Drag widgets, resize them (S/M/L), hide or show them. |
| **Inbox** | Everything captured but not organized yet: ideas and Inbox-status tasks. Turn items into tasks, notes, or projects, keep them as ideas, or delete them. |
| **Tasks** | List views (My Day, Upcoming, Overdue, All open, Completed), filters (project, priority, category, status), search, sorting, and a drag-and-drop board. Subtasks, due dates, categories, tags, project/milestone/calendar-event links. |
| **Calendar** | Month, week, and agenda views of events, task due dates, milestones, and project target dates. Overdue items are flagged. |
| **Ideas** | Brain dump. Type and press Enter. Links, `#tags`, and reminders are detected. Favorites, archive, related-idea links, and conversion to tasks, notes, or projects. |
| **Projects** | Coding projects, school work, business ideas, and goals. Progress is computed from the project's tasks. Milestones, links (repository, Claude Code sessions, pull requests, docs, sites), bugs, notes, ideas, history, archive and restore. |
| **Notes** | Searchable notes with autosave, tags, categories, favorites, project and task links, and a preview that renders `#` headings, bullets, and tickable `- [ ]` checklists. Includes the **Prompt library** from Agent Command Center. |
| **Activity** | The log of real changes you made, with a daily graph and filters. |
| **Utilities** | Clock, countdowns, focus timer, random idea picker, recently used items, and your own shortcuts. |
| **Settings** | Themes, accent colors, density, startup page, defaults, widget layout, keyboard reference, and all data tools (backup, import, recovery). |

### Quick add syntax (tasks)

Only the title is required. Optional shortcuts anywhere in the line:

- `!high`, `!low`, `!urgent` (or `!1` to `!4`) set the priority
- `#school` sets the category; further `#words` become tags
- `due:fri`, `due:tomorrow`, `due:2026-11-03`, `due:+3` set the due date
- ending with `today` or `tomorrow` also sets the due date ("Call mom tomorrow")

### Keyboard

| Keys | Action |
| --- | --- |
| `Ctrl+K` / `⌘K` | Command bar: search everything, jump to sections, create items, run commands |
| `/` | Command bar (when not typing in a field) |
| `C` | Quick capture (when not typing in a field) |
| `G` then a letter | Go to a section: D My Day, I Inbox, T Tasks, C Calendar, E Ideas, P Projects, N Notes, A Activity, U Utilities, S Settings |
| `↑` `↓` `Enter` `Esc` | Move, run, and close in the command bar; `Esc` closes windows (asking first if you have unsaved edits) |

In the command bar, start with `>` to show only commands.

## Your data

**Where it lives.** All tasks, ideas, notes, projects, events, bugs, prompts, the activity log, settings, and widget layout are saved in this browser's IndexedDB database (`personal-hq`), which has room for hundreds of megabytes. Changes are saved automatically; the status bar shows "Saved", "Saving…", or an error. Earlier versions used `localStorage`; the first time this version opens it copies that data over and leaves the old copy in place. If IndexedDB can't be opened, the app falls back to `localStorage`.

**Protected storage.** On startup the app asks the browser to treat its storage as persistent, so it isn't cleared automatically when space runs low or (in Safari) after a stretch without use. Browsers decide on their own; installed apps are usually granted it. Settings › Data shows whether it was granted, and how much space is used.

**Each browser has its own copy.** A different browser, another computer, or a private window starts empty unless you turn on sync or import a backup. Clearing site data erases that browser's copy. When Personal HQ runs as a Claude artifact, the data belongs to that artifact's address in your browser.

**Daily snapshots.** The first time you open the app each day it saves a snapshot, and keeps the last 7. Settings › Data lists them with a Restore button. They protect against mistakes (a bad import, deleting the wrong thing), not against the browser's data being erased.

**Back up regularly.** Settings › Data › *Download backup (.json)* saves everything to a file (inside a Claude artifact you confirm the download first). *Copy JSON* puts the same backup on the clipboard. Keep backups somewhere safe. If you haven't downloaded one in 7 days (30 with sync on), a reminder appears at the top of the app.

**Importing.** Settings › Data › *Import JSON…* accepts Personal HQ and Agent Command Center backups. The file is validated first and you see a preview with counts. You then choose:

- *Add new records only* (default): nothing you have is changed or removed.
- *Add new and update older copies*: also replaces records the file has a newer version of.
- *Replace everything*: requires an extra confirmation.

Before any replace, restore, or *Delete all data*, a safety copy of the current data is saved and can be restored from Settings › Data. Records that can't be read are listed and skipped; unknown values (such as an unrecognized status) are corrected and reported.

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

## Privacy and local suggestions

With sync off, nothing is sent to any server; fonts from Google Fonts are the only network request. With sync on, only encrypted records go to the sync server (see above).

The tag, category, similar-item, "looks like a to-do", and checklist suggestions are **local rules**: keyword lists, word overlap, and fixed templates in `src/organize/rules.ts`. They are labeled as local suggestions everywhere and never claim to come from an AI model. The organization review shows every suggestion with its reason; nothing changes until you select items and press Apply.

To add a real AI provider later, implement `OrganizerProvider` in `src/organize/provider.ts` with a `review()` that calls **your own server**, which holds the API key. Never put API keys in this frontend, and only send data after the user turns the provider on in Settings.

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
  data/          data model, validation, storage adapters, migration, store, selectors, backup
    adapters/    StorageAdapter interface; IndexedDB, localStorage, and in-memory implementations
  sync/          end-to-end encrypted sync: code and keys, engine, server transport, controller
  organize/      local rule-based suggestions and the provider interface
  app/           routing, UI state, clock, focus timer, file saving, device-only preferences
  shell/         title bar, sidebar, status bar, command bar
  editors/       editor windows (task, event, project, idea, bug, prompt) and quick capture
  features/      one folder per section
  ui/            shared controls: buttons, fields, dialogs, panels, chips
```

Components never touch storage directly. All persistence goes through `StorageAdapter` (`src/data/adapters/types.ts`). Sync sits beside it: it reads the workspace, applies incoming changes through the store, and keeps its own state (code, last change seen, deletions) in the adapter's side store.

The sync server's address and publishable key are in `src/sync/config.ts` (public by design; override with `VITE_SYNC_URL` / `VITE_SYNC_KEY`). To use your own Supabase project, apply the SQL in `supabase/migrations/` and point those at it.

### Tech

React 19, TypeScript, Tailwind CSS 4, Vite, zustand, lucide-react icons, Vitest with Testing Library.
