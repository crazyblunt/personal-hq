import { cellFromPoint, clampRect, collides, firstFit, moveTo, resizeTo, stackOrder, tidy } from './grid';

const anyMin = () => ({ minW: 1, minH: 1 });

describe('grid engine', () => {
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
    const items = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      { id: 'c', x: 6, y: 4, w: 6, h: 2 },
    ];
    const out = moveTo(items, 'a', { x: 6, y: 0 }, anyMin);
    expect(out.find((i) => i.id === 'a')).toMatchObject({ x: 6, y: 0 });
    expect(out.find((i) => i.id === 'b')).toMatchObject({ x: 6, y: 4 });
    expect(out.find((i) => i.id === 'c')).toMatchObject({ x: 6, y: 8 });
  });

  it('leaves gaps: nothing floats up after a move', () => {
    const out = moveTo([{ id: 'a', x: 0, y: 0, w: 4, h: 4 }], 'a', { x: 0, y: 6 }, anyMin);
    expect(out[0]).toMatchObject({ y: 6 });
  });

  it('resizes within limits and pushes overlapped widgets down', () => {
    const items = [
      { id: 'a', x: 0, y: 0, w: 4, h: 4 },
      { id: 'b', x: 0, y: 4, w: 4, h: 2 },
    ];
    const out = resizeTo(items, 'a', { w: 40, h: 6 }, () => ({ minW: 3, minH: 3 }));
    expect(out.find((i) => i.id === 'a')).toMatchObject({ w: 12, h: 6 });
    expect(out.find((i) => i.id === 'b')).toMatchObject({ y: 6 });
  });

  it('tidy closes vertical gaps without reordering', () => {
    const out = tidy([
      { id: 'a', x: 0, y: 3, w: 4, h: 2 },
      { id: 'b', x: 0, y: 9, w: 4, h: 2 },
    ]);
    expect(out.map((i) => [i.id, i.y])).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });

  it('stacks in reading order', () => {
    const items = [
      { x: 6, y: 0, w: 1, h: 1, id: 'b' },
      { x: 0, y: 2, w: 1, h: 1, id: 'c' },
      { x: 0, y: 0, w: 1, h: 1, id: 'a' },
    ];
    expect(stackOrder(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('maps a pointer position to a cell', () => {
    // 12 columns over 1200px with 8px gaps; rows 32px + 8px gap.
    expect(cellFromPoint({ x: 205, y: 85 }, { left: 0, top: 0, width: 1200 }, 32, 8)).toEqual({ x: 2, y: 2 });
    expect(cellFromPoint({ x: -50, y: -50 }, { left: 0, top: 0, width: 1200 }, 32, 8)).toEqual({ x: 0, y: 0 });
  });
});
