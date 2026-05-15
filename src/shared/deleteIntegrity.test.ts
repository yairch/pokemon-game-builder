import { describe, expect, it } from 'vitest';
import { pickEditMapIdAutoFix, simulateDelete } from './deleteIntegrity';
import type { MapInfoData, MapInfosReadData } from './types';

function mi(
  id: number,
  parentId = 0,
  order = id,
  name = `Map${String(id).padStart(3, '0')}`
): MapInfoData {
  return { id, name, parentId, order, expanded: false, scrollX: 0, scrollY: 0 };
}

function infos(...rows: MapInfoData[]): MapInfosReadData {
  const out: MapInfosReadData = {};
  for (const r of rows) out[String(r.id)] = r;
  return out;
}

describe('simulateDelete', () => {
  it('returns empty results for null MapInfos', () => {
    const r = simulateDelete(null, [1, 2]);
    expect(r.deletedIds).toEqual([]);
    expect(r.survivorIds).toEqual([]);
  });

  it('empty seed list is a no-op on a populated tree', () => {
    const data = infos(mi(1), mi(2), mi(3));
    const r = simulateDelete(data, []);
    expect(r.deletedIds).toEqual([]);
    expect(r.survivorIds).toEqual([1, 2, 3]);
  });

  it('drops a single leaf from a flat tree', () => {
    const data = infos(mi(1), mi(2), mi(3));
    const r = simulateDelete(data, [2]);
    expect(r.deletedIds).toEqual([2]);
    expect(r.survivorIds).toEqual([1, 3]);
  });

  it('expands a folder seed to include every descendant (depth > 1)', () => {
    // 1 (folder) ─ 2 (folder) ─ 4 (leaf)
    //                        └ 5 (leaf)
    //          └ 3 (leaf)
    // 6 (root sibling, survives)
    const data = infos(
      mi(1, 0, 0),
      mi(2, 1, 0),
      mi(3, 1, 1),
      mi(4, 2, 0),
      mi(5, 2, 1),
      mi(6, 0, 1)
    );
    const r = simulateDelete(data, [1]);
    expect(r.deletedIds).toEqual([1, 2, 3, 4, 5]);
    expect(r.survivorIds).toEqual([6]);
  });

  it('is idempotent when seeds overlap (descendant included with its ancestor)', () => {
    const data = infos(mi(1, 0, 0), mi(2, 1, 0), mi(3, 1, 1));
    const r = simulateDelete(data, [1, 2, 3, 2]);
    expect(r.deletedIds).toEqual([1, 2, 3]);
    expect(r.survivorIds).toEqual([]);
  });

  it('ignores seed ids that are not in MapInfos', () => {
    const data = infos(mi(1), mi(2));
    const r = simulateDelete(data, [99, 1, 42]);
    expect(r.deletedIds).toEqual([1]);
    expect(r.survivorIds).toEqual([2]);
  });

  it('survivorIds is preorder (parent_id + order) of remaining tree', () => {
    // Surviving tree after deleting id=20:
    //   10 ─ 11
    //   30 ─ 31
    //      └ 32
    const data = infos(
      mi(10, 0, 0),
      mi(11, 10, 0),
      mi(20, 0, 1),
      mi(21, 20, 0),
      mi(30, 0, 2),
      mi(31, 30, 0),
      mi(32, 30, 1)
    );
    const r = simulateDelete(data, [20]);
    expect(r.deletedIds).toEqual([20, 21]);
    expect(r.survivorIds).toEqual([10, 11, 30, 31, 32]);
  });

  it('terminates on a corrupt parent_id cycle (A↔B)', () => {
    // 1's parent is 2, 2's parent is 1 — pathological but possible if data was hand-edited.
    // Without the visited guard this would loop forever; with it, deleting either one
    // takes both (each is the other's "child" by parent_id index).
    const data = infos(mi(1, 2, 0), mi(2, 1, 0), mi(3, 0, 0));
    const r = simulateDelete(data, [1]);
    expect(r.deletedIds.sort()).toEqual([1, 2]);
    expect(r.survivorIds).toEqual([3]);
  });
});

describe('pickEditMapIdAutoFix', () => {
  it('keeps the resolved start map id when it survives', () => {
    expect(pickEditMapIdAutoFix([1, 5, 9], 5)).toBe(5);
  });

  it('falls back to the first preorder survivor when start map id is not in survivors', () => {
    expect(pickEditMapIdAutoFix([7, 8, 9], 5)).toBe(7);
  });

  it('returns 0 when no survivors remain (regardless of start map id)', () => {
    expect(pickEditMapIdAutoFix([], 5)).toBe(0);
    expect(pickEditMapIdAutoFix([], 0)).toBe(0);
  });

  it('falls back to first survivor when start map id is 0 / unset', () => {
    expect(pickEditMapIdAutoFix([3, 4], 0)).toBe(3);
  });

  it('treats negative / sub-1 start map id as unset (falls back to first survivor)', () => {
    expect(pickEditMapIdAutoFix([2, 5], -1)).toBe(2);
  });
});
