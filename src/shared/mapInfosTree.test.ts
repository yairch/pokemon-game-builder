import { describe, expect, it } from 'vitest';
import {
  buildMapInfosTree,
  getDefaultPreviewMapId,
  preorderMapTreeIds,
} from './mapInfosTree';
import type { MapInfosReadData } from './types';

function stubInfo(
  overrides: Partial<{
    id: number;
    name: string;
    parentId: number;
    order: number;
    expanded: boolean;
    scrollX: number;
    scrollY: number;
  }>
) {
  return {
    id: 1,
    name: 'A',
    parentId: 0,
    order: 0,
    expanded: true,
    scrollX: 0,
    scrollY: 0,
    ...overrides,
  };
}

describe('buildMapInfosTree', () => {
  it('orders siblings by order then id', () => {
    const data: MapInfosReadData = {
      '10': stubInfo({ id: 10, name: 'second', parentId: 0, order: 2 }),
      '5': stubInfo({ id: 5, name: 'first', parentId: 0, order: 1 }),
    };
    const roots = buildMapInfosTree(data);
    expect(roots.map((r) => r.info.id)).toEqual([5, 10]);
  });

  it('nests children under parent id', () => {
    const data: MapInfosReadData = {
      '1': stubInfo({ id: 1, name: 'root', parentId: 0, order: 0 }),
      '2': stubInfo({ id: 2, name: 'kid', parentId: 1, order: 0 }),
    };
    const roots = buildMapInfosTree(data);
    expect(roots).toHaveLength(1);
    expect(roots[0].info.id).toBe(1);
    expect(roots[0].children.map((c) => c.info.id)).toEqual([2]);
  });

  it('tolerates missing parent by attaching to root', () => {
    const data: MapInfosReadData = {
      '99': stubInfo({ id: 99, name: 'orphan', parentId: 4242, order: 0 }),
    };
    const roots = buildMapInfosTree(data);
    expect(roots).toHaveLength(1);
    expect(roots[0].info.id).toBe(99);
  });
});

describe('preorderMapTreeIds / default preview id', () => {
  it('lists preorder ids depth-first', () => {
    const data: MapInfosReadData = {
      '1': stubInfo({ id: 1, name: 'a', parentId: 0, order: 0 }),
      '3': stubInfo({ id: 3, name: 'c', parentId: 0, order: 1 }),
      '2': stubInfo({ id: 2, name: 'b', parentId: 1, order: 0 }),
    };
    expect(preorderMapTreeIds(buildMapInfosTree(data))).toEqual([1, 2, 3]);
  });

  it('getDefaultPreviewMapId returns first preorder map', () => {
    const data: MapInfosReadData = {
      '1': stubInfo({ id: 1, name: 'a', parentId: 0, order: 0 }),
      '2': stubInfo({ id: 2, name: 'b', parentId: 0, order: 1 }),
    };
    expect(getDefaultPreviewMapId(data)).toBe(1);
  });
});
