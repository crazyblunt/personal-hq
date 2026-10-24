import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { navigate } from '../app/router';
import { useUI } from '../app/ui';
import { buildExport } from '../data/backup';
import { createMemoryAdapter } from '../data/adapters/memory';
import { emptyWorkspace } from '../data/defaults';
import { createNote, createTask, initStore, useHQ } from '../data/store';
import { clearMatchMedia, mockMatchMedia } from './helpers';

async function renderApp() {
  location.hash = '';
  await initStore(createMemoryAdapter());
  useUI.setState({ editor: null, commandOpen: false, capture: null, organizeOpen: false, confirm: null, toasts: [] });
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
});
