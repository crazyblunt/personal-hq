import { matchShortcut, newItemCommand, shortcutFor, SHORTCUTS, type KeyLike, type MatchState } from './shortcuts';

const st: MatchState = { modalOpen: false, pendingG: false, section: 'tasks' };
const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: document.body, ...extra });

describe('shortcut matcher', () => {
  it('opens the command bar with Ctrl/⌘+K even while typing', () => {
    const input = document.createElement('input');
    expect(matchShortcut(key('k', { ctrlKey: true, target: input }), st)).toEqual({ command: 'open-command' });
    expect(matchShortcut(key('K', { metaKey: true }), st)).toEqual({ command: 'open-command' });
  });

  it('ignores single keys in fields, selects, during composition, and in dialogs', () => {
    for (const tag of ['input', 'textarea', 'select']) expect(matchShortcut(key('c', { target: document.createElement(tag) }), st)).toBeNull();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(matchShortcut(key('c', { target: editable }), st)).toBeNull();
    expect(matchShortcut(key('c', { isComposing: true }), st)).toBeNull();
    expect(matchShortcut(key('c'), { ...st, modalOpen: true })).toBeNull();
    expect(matchShortcut(key('c', { defaultPrevented: true }), st)).toBeNull();
  });

  it('handles G sequences', () => {
    expect(matchShortcut(key('g'), st)).toEqual({ pendingG: true });
    expect(matchShortcut(key('t'), { ...st, pendingG: true })).toEqual({ command: 'go-tasks' });
    expect(matchShortcut(key('q'), { ...st, pendingG: true })).toBeNull();
  });

  it('runs the single-key shortcuts', () => {
    expect(matchShortcut(key('c'), st)).toEqual({ command: 'capture' });
    expect(matchShortcut(key('/'), st)).toEqual({ command: 'open-command' });
  });

  it('N creates the right thing for the page', () => {
    expect(matchShortcut(key('n'), { ...st, section: 'notes' })).toEqual({ command: 'new-note' });
    expect(newItemCommand('myday')).toBe('new-myday-task');
    expect(newItemCommand('tasks')).toBe('new-task');
    expect(newItemCommand('inbox')).toBe('new-idea');
    expect(newItemCommand('ideas')).toBe('new-idea');
    expect(newItemCommand('projects')).toBe('new-project');
    expect(newItemCommand('calendar')).toBe('new-event');
    expect(newItemCommand('activity')).toBe('new-task');
  });

  it('? opens the shortcuts panel and reports keys for commands', () => {
    expect(matchShortcut(key('?', { shiftKey: true }), st)).toEqual({ command: 'show-shortcuts' });
    expect(shortcutFor('go-tasks')).toEqual(['G', 'T']);
    expect(shortcutFor('capture')).toEqual(['C']);
    expect(shortcutFor('cmd-activity')).toBeUndefined();
  });

  it('never claims browser-reserved combos or Alt combos', () => {
    for (const k of ['n', 't', 'w', 'l']) expect(matchShortcut(key(k, { metaKey: true }), st)).toBeNull();
    expect(matchShortcut(key('c', { altKey: true }), st)).toBeNull();
  });

  it('lists every navigation key and gives every entry a label', () => {
    expect(SHORTCUTS.every((s) => s.label && s.keys.length)).toBe(true);
    expect(SHORTCUTS.filter((s) => s.group === 'Navigation' && s.command?.startsWith('go-')).length).toBeGreaterThanOrEqual(10);
  });
});
