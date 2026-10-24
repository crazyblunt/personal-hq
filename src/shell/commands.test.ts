import { renderHook } from '@testing-library/react';
import { SECTIONS, THEMES } from '../data/types';
import { findCommand, useAppCommands } from './commands';

describe('app commands', () => {
  it('has unique ids and every section has a go-to command', () => {
    const { result } = renderHook(() => useAppCommands());
    const ids = result.current.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SECTIONS) expect(ids).toContain(`go-${s}`);
    for (const t of THEMES) expect(ids).toContain(`theme-${t}`);
    for (const id of ['new-task', 'new-myday-task', 'new-idea', 'new-note', 'new-project', 'new-event', 'capture', 'open-command', 'show-shortcuts', 'customize-myday', 'cmd-import', 'cmd-export']) expect(ids).toContain(id);
  });

  it('finds a command by id', () => {
    const { result } = renderHook(() => useAppCommands());
    expect(findCommand(result.current, 'go-tasks')?.label).toBe('Go to Tasks');
    expect(findCommand(result.current, 'nope')).toBeUndefined();
  });
});
