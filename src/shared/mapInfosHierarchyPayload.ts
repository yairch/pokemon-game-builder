import type { MapInfoData, MapInfosReadData, MapInfoHierarchyWriteRow } from './types';

/** Build stdin JSON for `write_map_infos_hierarchy`: one row per MapInfo entry (ids must match MapInfos.rxdata exactly). */
export function buildMapInfosHierarchyPayload(mapInfos: MapInfosReadData): MapInfoHierarchyWriteRow[] {
  return (Object.values(mapInfos) as MapInfoData[])
    .filter((m): m is MapInfoData => m != null && typeof m.id === 'number')
    .map((m) => ({
      id: m.id,
      parentId: m.parentId,
      order: m.order,
    }));
}
