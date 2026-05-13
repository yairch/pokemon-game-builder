import { describe, expect, it } from 'vitest';
import { buildMapInfosHierarchyPayload } from './mapInfosHierarchyPayload';
import type { MapInfosReadData } from './types';

describe('buildMapInfosHierarchyPayload', () => {
  it('outputs one row per map with id, parentId, order', () => {
    const data: MapInfosReadData = {
      '1': { id: 1, name: 'A', parentId: 0, order: 1, expanded: true, scrollX: 0, scrollY: 0 },
      '2': { id: 2, name: 'B', parentId: 1, order: 0, expanded: false, scrollX: 0, scrollY: 0 },
    };
    const rows = buildMapInfosHierarchyPayload(data);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ id: 1, parentId: 0, order: 1 });
    expect(rows).toContainEqual({ id: 2, parentId: 1, order: 0 });
  });

  it('returns empty array for empty map infos', () => {
    expect(buildMapInfosHierarchyPayload({})).toEqual([]);
  });
});
