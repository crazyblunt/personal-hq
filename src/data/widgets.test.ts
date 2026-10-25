import { DEFAULT_WIDGETS, sizeForWidth } from './defaults';
import { normalizeSettings } from './normalize';

describe('widget grid positions', () => {
  it('migrates S/M/L widgets without positions into the grid in order', () => {
    const s = normalizeSettings({
      widgets: [
        { id: 'today', enabled: true, size: 'md' },
        { id: 'deadlines', enabled: true, size: 'sm' },
        { id: 'clock', enabled: false, size: 'sm' },
      ],
    });
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

  it('pushes overlapping saved widgets apart', () => {
    const s = normalizeSettings({
      widgets: [
        { id: 'today', enabled: true, size: 'md', x: 0, y: 0, w: 8, h: 12 },
        { id: 'deadlines', enabled: true, size: 'sm', x: 4, y: 2, w: 6, h: 8 },
      ],
    });
    const byId = Object.fromEntries(s.widgets.map((w) => [w.id, w]));
    expect(byId.deadlines).toMatchObject({ x: 4, y: 12 });
  });

  it('derives size from width', () => {
    expect([3, 4, 5, 8, 9, 12].map(sizeForWidth)).toEqual(['sm', 'sm', 'md', 'md', 'lg', 'lg']);
  });

  it('default widgets all have positions when enabled', () => {
    expect(DEFAULT_WIDGETS.filter((w) => w.enabled).every((w) => typeof w.x === 'number' && typeof w.h === 'number')).toBe(true);
  });

  it('loads quickly even when a synced or imported layout has absurd sizes', () => {
    const start = performance.now();
    const s = normalizeSettings({ widgets: [{ id: 'today', enabled: true, size: 'lg', x: 0, y: 3e5, w: 12, h: 1e6 }, { id: 'deadlines', enabled: true, size: 'sm' }] });
    expect(performance.now() - start).toBeLessThan(100);
    expect(s.widgets.find((w) => w.id === 'today')).toMatchObject({ y: 500, h: 60 });
  });
});

