import { describe, expect, it } from 'vitest';
import { applyHierarchyMove, isDescendantOrSame } from './mapInfosHierarchyMove';
import type { MapInfoData, MapInfosReadData } from './types';

function mk(id: number, parentId: number, order: number, name = `M${id}`): MapInfoData {
  return { id, name, parentId, order, expanded: true, scrollX: 0, scrollY: 0 };
}

function infos(...rows: MapInfoData[]): MapInfosReadData {
  const out: MapInfosReadData = {};
  for (const r of rows) out[String(r.id)] = r;
  return out;
}

function row(rows: ReturnType<typeof applyHierarchyMove>, id: number) {
  if (rows == null) throw new Error('expected non-null rows');
  const r = rows.find((x) => x.id === id);
  if (!r) throw new Error(`missing row for ${id}`);
  return r;
}

describe('isDescendantOrSame', () => {
  it('returns true for self', () => {
    expect(isDescendantOrSame(infos(mk(1, 0, 0)), 1, 1)).toBe(true);
  });

  it('finds nested descendants', () => {
    const m = infos(mk(1, 0, 0), mk(2, 1, 0), mk(3, 2, 0));
    expect(isDescendantOrSame(m, 1, 3)).toBe(true);
  });

  it('rejects unrelated maps', () => {
    const m = infos(mk(1, 0, 0), mk(2, 0, 1));
    expect(isDescendantOrSame(m, 1, 2)).toBe(false);
  });
});

describe('applyHierarchyMove', () => {
  it('rejects self-drop', () => {
    expect(applyHierarchyMove(infos(mk(1, 0, 0)), 1, 1, 'inside')).toBeNull();
  });

  it('rejects dropping a map onto its descendant', () => {
    const m = infos(mk(1, 0, 0), mk(2, 1, 0));
    expect(applyHierarchyMove(m, 1, 2, 'inside')).toBeNull();
  });

  it('reorders siblings: move B before A', () => {
    const m = infos(mk(1, 0, 0, 'A'), mk(2, 0, 1, 'B'));
    const out = applyHierarchyMove(m, 2, 1, 'before')!;
    expect(row(out, 2)).toEqual({ id: 2, parentId: 0, order: 0 });
    expect(row(out, 1)).toEqual({ id: 1, parentId: 0, order: 1 });
  });

  it('reorders siblings: move A after B', () => {
    const m = infos(mk(1, 0, 0, 'A'), mk(2, 0, 1, 'B'));
    const out = applyHierarchyMove(m, 1, 2, 'after')!;
    expect(row(out, 2)).toEqual({ id: 2, parentId: 0, order: 0 });
    expect(row(out, 1)).toEqual({ id: 1, parentId: 0, order: 1 });
  });

  it('reparents inside another map and appends to end', () => {
    const m = infos(mk(1, 0, 0, 'A'), mk(2, 0, 1, 'B'), mk(3, 2, 0, 'B-child'));
    const out = applyHierarchyMove(m, 1, 2, 'inside')!;
    expect(row(out, 1)).toEqual({ id: 1, parentId: 2, order: 1 });
    expect(row(out, 3)).toEqual({ id: 3, parentId: 2, order: 0 });
    expect(row(out, 2)).toEqual({ id: 2, parentId: 0, order: 0 });
  });

  it('renumbers old siblings after a reparent', () => {
    const m = infos(
      mk(1, 0, 0, 'P'),
      mk(10, 1, 0, 'A'),
      mk(11, 1, 1, 'B'),
      mk(12, 1, 2, 'C'),
      mk(2, 0, 1, 'Other')
    );
    const out = applyHierarchyMove(m, 11, 2, 'inside')!;
    expect(row(out, 11).parentId).toBe(2);
    expect(row(out, 10)).toEqual({ id: 10, parentId: 1, order: 0 });
    expect(row(out, 12)).toEqual({ id: 12, parentId: 1, order: 1 });
  });

  it('moves a folder with children: descendants stay attached', () => {
    const m = infos(
      mk(1, 0, 0, 'P'),
      mk(2, 1, 0, 'C1'),
      mk(3, 1, 1, 'C2'),
      mk(4, 2, 0, 'C1-child'),
      mk(5, 0, 1, 'Other')
    );
    const out = applyHierarchyMove(m, 1, 5, 'inside')!;
    expect(row(out, 1)).toEqual({ id: 1, parentId: 5, order: 0 });
    expect(row(out, 2).parentId).toBe(1);
    expect(row(out, 3).parentId).toBe(1);
    expect(row(out, 4).parentId).toBe(2);
  });

  it('preserves order for non-affected branches', () => {
    const m = infos(
      mk(1, 0, 0, 'A'),
      mk(2, 0, 1, 'B'),
      mk(3, 0, 2, 'C'),
      mk(10, 2, 0, 'B-1'),
      mk(11, 2, 1, 'B-2')
    );
    const out = applyHierarchyMove(m, 3, 1, 'before')!;
    expect(row(out, 3).order).toBe(0);
    expect(row(out, 1).order).toBe(1);
    expect(row(out, 2).order).toBe(2);
    expect(row(out, 10)).toEqual({ id: 10, parentId: 2, order: 0 });
    expect(row(out, 11)).toEqual({ id: 11, parentId: 2, order: 1 });
  });

  it('returns one row per existing map', () => {
    const m = infos(mk(1, 0, 0), mk(2, 0, 1), mk(3, 1, 0));
    const out = applyHierarchyMove(m, 3, 2, 'after')!;
    expect(out.length).toBe(3);
    expect(out.map((r) => r.id).sort()).toEqual([1, 2, 3]);
  });
});
