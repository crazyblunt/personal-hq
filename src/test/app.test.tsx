import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { navigate, useRoute } from '../app/router';
import { openEditor, useUI } from '../app/ui';
import { buildExport } from '../data/backup';
import { createMemoryAdapter } from '../data/adapters/memory';
import { emptyWorkspace } from '../data/defaults';
import { DEFAULT_WIDGETS } from '../data/defaults';
import type { Note, Task } from '../data/types';
import { createIdea, createNote, createTask, initStore, updateSettings, useHQ } from '../data/store';
import { clearMatchMedia, mockMatchMedia } from './helpers';

async function renderApp() {
  location.hash = '';
  await initStore(createMemoryAdapter());
  useUI.setState({ editor: null, commandOpen: false, capture: null, organizeOpen: false, confirm: null, toasts: [], myDayCustomize: false, shortcutsOpen: false });
  const user = userEvent.setup();
  const utils = render(<App />);
  await screen.findByRole('heading', { name: 'My Day', level: 1 });
  return { user, ...utils };
}

const openDialog = () => document.querySelector('dialog[open]') as HTMLElement;

describe('Personal HQ app', () => {
  it('starts on My Day with empty states and no invented data', async () => {
    await renderApp();
    expect(screen.getByText('Nothing scheduled for today')).toBeInTheDocument();
    expect(screen.getByText('No active projects')).toBeInTheDocument();
    expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
  });

  it('adds a task for today from the My Day quick add, with inline shortcuts', async () => {
    const { user } = await renderApp();
    await user.type(screen.getByPlaceholderText(/Add a task for today/), 'Finish lab report !high #school{Enter}');
    const task = useHQ.getState().tasks[0];
    expect(task).toMatchObject({ title: 'Finish lab report', priority: 'high', category: 'school' });
    expect(task.myDay).not.toBeNull();
    // Listed under Today and in Recent activity.
    expect(await screen.findAllByRole('button', { name: 'Finish lab report' })).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Complete “Finish lab report”' })).toBeInTheDocument();
  });

  it('opens the command bar with Ctrl+K, finds a task, and opens it with Enter', async () => {
    const { user } = await renderApp();
    act(() => {
      createTask({ title: 'Write history essay' });
    });
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', { name: /Search or type a command/ });
    await user.type(input, 'history');
    const option = await screen.findByRole('option', { name: /Write history essay/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(within(openDialog()).getByDisplayValue('Write history essay')).toBeInTheDocument());
    expect(useUI.getState().commandOpen).toBe(false);
  });

  it('runs built-in commands from the bar and navigates with arrow keys', async () => {
    const { user } = await renderApp();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), '>go to notes');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Notes', level: 1 })).toBeInTheDocument();
  });

  it('asks before discarding unsaved edits in an editor window', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.type(await screen.findByLabelText('Title'), 'Half-written');
    await user.click(within(openDialog()).getByRole('button', { name: 'Close' }));
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('Half-written')).toBeInTheDocument();
    expect(useHQ.getState().tasks).toHaveLength(0);
  });

  it('autosaves notes while typing and when leaving the note', async () => {
    const { user } = await renderApp();
    let id = '';
    act(() => {
      id = createNote({ title: 'Lecture 5' }).id;
      navigate('notes', id);
    });
    const body = await screen.findByLabelText('Note text');
    await user.type(body, 'Mitochondria');
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    await waitFor(() => expect(useHQ.getState().notes[0].body).toBe('Mitochondria'), { timeout: 2000 });
    await user.type(body, ' rule');
    act(() => navigate('tasks'));
    expect(useHQ.getState().notes.find((n) => n.id === id)!.body).toBe('Mitochondria rule');
  });

  it('previews an import and adds records without overwriting existing ones', async () => {
    const { user } = await renderApp();
    act(() => {
      createTask({ title: 'Existing' });
      navigate('prefs');
    });
    const existing = useHQ.getState().tasks[0];
    const file = { ...emptyWorkspace(), tasks: [{ ...existing, title: 'Changed in backup', updatedAt: '2999-01-01T00:00:00.000Z' }] };
    file.ideas = [
      {
        id: 'imported-idea',
        title: '',
        body: 'From the backup',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        kind: 'idea',
        url: '',
        tags: [],
        category: '',
        favorite: false,
        inbox: true,
        archived: false,
        projectId: null,
        relatedIds: [],
        converted: [],
        remindOn: null,
        itemLinks: [],
      },
    ];
    const blob = new File([JSON.stringify(buildExport(file))], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Backup file to import'), blob);
    const dialog = await screen.findByRole('dialog', { name: 'Import backup.json' });
    expect(within(dialog).getByText('Add new records only')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(useHQ.getState().ideas.map((i) => i.id)).toEqual(['imported-idea']));
    expect(useHQ.getState().tasks[0].title).toBe('Existing');
  });

  it('rejects an invalid import file with a clear message', async () => {
    const { user } = await renderApp();
    act(() => navigate('prefs'));
    await user.upload(await screen.findByLabelText('Backup file to import'), new File(['{broken'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText(/bad.json couldn’t be imported: This file isn't valid JSON/)).toBeInTheDocument();
  });

  it('every sidebar section opens', async () => {
    const { user } = await renderApp();
    const nav = screen.getAllByRole('navigation', { name: 'Sections' })[0];
    for (const name of ['Inbox', 'Tasks', 'Calendar', 'Ideas', 'Projects', 'Notes', 'Activity', 'Utilities', 'Settings', 'My Day']) {
      await user.click(within(nav).getByRole('link', { name: new RegExp(`^${name}`) }));
      expect(await screen.findByRole('heading', { name, level: 1 })).toBeInTheDocument();
    }
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'c' });
    expect(await screen.findByRole('heading', { name: 'Calendar', level: 1 })).toBeInTheDocument();
  });
});

describe('My Day grid', () => {
  afterEach(() => clearMatchMedia());

  const regionTitles = () => screen.getAllByRole('region').map((r) => r.querySelector('h2')?.textContent);

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
    expect(regionTitles().slice(0, 3)).toEqual(['Today', 'Quick actions', 'Deadlines & events']);
    expect(screen.getByRole('region', { name: 'Today' }).parentElement!.style.gridColumn).toBe('');
  });

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
    expect(screen.getByRole('region', { name: 'Clock' })).toBeInTheDocument();
  });
});

describe('Keyboard shortcuts', () => {
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
    await user.type(await screen.findByRole('combobox'), '>go to tasks');
    expect(screen.getByRole('option', { name: /Go to Tasks/ })).toHaveTextContent('G T');
    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), '>keyboard');
    expect(screen.getByRole('option', { name: /Keyboard shortcuts/ })).toHaveTextContent('?');
  });

  it('Ctrl+Enter saves the open editor', async () => {
    const { user } = await renderApp();
    await user.keyboard('n');
    await user.type(within(openDialog()).getByLabelText('Title'), 'Ship it');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(useHQ.getState().tasks.map((t) => t.title)).toContain('Ship it'));
    expect(useHQ.getState().tasks[0].myDay).not.toBeNull();
  });
});

describe('Menu bar', () => {
  afterEach(() => clearMatchMedia());

  it('opens with a click and runs items from the keyboard', async () => {
    mockMatchMedia(true);
    const { user } = await renderApp();
    await user.click(screen.getByRole('menuitem', { name: 'Go' }));
    const menu = screen.getByRole('menu', { name: 'Go' });
    expect(within(menu).getByRole('menuitem', { name: /Tasks/ })).toHaveTextContent('G T');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(useRoute.getState().section).toBe('inbox');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves between menus with the arrow keys and closes with Escape', async () => {
    mockMatchMedia(true);
    const { user } = await renderApp();
    await user.click(screen.getByRole('menuitem', { name: 'File' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('menu', { name: 'View' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'View' })).toHaveFocus();
  });
});

describe('Linked panel', () => {
  it('links a task to a note from the task editor and shows the backlink on the note', async () => {
    const { user } = await renderApp();
    let t!: Task;
    let n!: Note;
    act(() => {
      t = createTask({ title: 'Lab report' });
      n = createNote({ title: 'Lab notes' });
    });
    act(() => openEditor({ kind: 'task', id: t.id }));
    await user.click(within(openDialog()).getByRole('button', { name: '+ Link…' }));
    await user.type(within(openDialog()).getByRole('textbox', { name: 'Find an item to link' }), 'lab notes');
    await user.click(within(openDialog()).getByRole('button', { name: /Lab notes/ }));
    expect(useHQ.getState().notes[0].taskIds).toEqual([t.id]);
    await user.click(within(openDialog()).getByRole('button', { name: 'Close' }));
    act(() => navigate('notes', n.id));
    const panel = await screen.findByRole('region', { name: 'Linked' });
    expect(within(panel).getByRole('button', { name: 'Lab report' })).toBeInTheDocument();
    expect(within(panel).getByText('linked task')).toBeInTheDocument();
  });

  it('note autosave does not undo links added from the panel', async () => {
    const { user } = await renderApp();
    let t!: Task;
    let n!: Note;
    act(() => {
      t = createTask({ title: 'Read chapter 4' });
      n = createNote({ title: 'Reading notes' });
      navigate('notes', n.id);
    });
    const panel = await screen.findByRole('region', { name: 'Linked' });
    await user.click(within(panel).getByRole('button', { name: '+ Link…' }));
    await user.type(within(panel).getByRole('textbox', { name: 'Find an item to link' }), 'chapter');
    await user.click(within(panel).getByRole('button', { name: /Read chapter 4/ }));
    await user.type(screen.getByRole('textbox', { name: 'Note text' }), 'More thoughts');
    await waitFor(() => expect(useHQ.getState().notes[0].body).toBe('More thoughts'), { timeout: 3000 });
    expect(useHQ.getState().notes[0].taskIds).toEqual([t.id]);
  });
});

describe('Explorer', () => {
  it('lists all item types and filters by tag', async () => {
    const { user } = await renderApp();
    act(() => {
      createTask({ title: 'Essay', tags: ['school'] });
      createNote({ title: 'Reading', tags: ['school'] });
      createIdea({ body: 'Garden #home' });
    });
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
    expect(await screen.findByRole('tab', { name: 'Everything', selected: true })).toBeInTheDocument();
  });

  it('renames a tag from the Tags tab after confirming', async () => {
    const { user } = await renderApp();
    act(() => {
      createTask({ title: 'A', tags: ['hw'] });
      navigate('explorer');
    });
    await user.click(await screen.findByRole('radio', { name: /Tags/ }));
    await user.click(screen.getByRole('button', { name: 'Rename #hw' }));
    await user.clear(screen.getByRole('textbox', { name: 'New name for #hw' }));
    await user.type(screen.getByRole('textbox', { name: 'New name for #hw' }), 'homework{Enter}');
    await user.click(within(openDialog()).getByRole('button', { name: 'Rename' }));
    expect(useHQ.getState().tasks[0].tags).toEqual(['homework']);
  });

  it('command bar search offers all results in Explorer', async () => {
    const { user } = await renderApp();
    act(() => {
      createTask({ title: 'Biology lab' });
    });
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'biology');
    await user.click(screen.getByRole('option', { name: /See all results in Explorer/ }));
    expect(useRoute.getState().section).toBe('explorer');
    expect(await screen.findByRole('searchbox', { name: 'Search everything' })).toHaveValue('biology');
  });
});

