import type { MapInfoData, MapInfosReadData, MapInfoHierarchyWriteRow } from './types';

export type DropPosition = 'before' | 'after' | 'inside';

export interface HierarchyMoveIntent {
  draggedId: number;
  targetId: number;
  position: DropPosition;
}

/** Sort a list of MapInfoData by RMXP rules: order, then id. */
function sortMapInfoSiblings(rows: MapInfoData[]): MapInfoData[] {
  return [...rows].sort((a, b) => (a.order - b.order) || (a.id - b.id));
}

function buildChildrenMap(mapInfos: MapInfosReadData): Map<number, MapInfoData[]> {
  const groups = new Map<number, MapInfoData[]>();
  for (const info of Object.values(mapInfos)) {
    if (!info) continue;
    const list = groups.get(info.parentId) ?? [];
    list.push(info);
    groups.set(info.parentId, list);
  }
  for (const [k, list] of groups) groups.set(k, sortMapInfoSiblings(list));
  return groups;
}

/** True when `candidateId` is the same as `ancestorId` or any descendant in its subtree. */
export function isDescendantOrSame(
  mapInfos: MapInfosReadData,
  ancestorId: number,
  candidateId: number
): boolean {
  if (ancestorId === candidateId) return true;
  const groups = buildChildrenMap(mapInfos);
  const stack: number[] = (groups.get(ancestorId) ?? []).map((m) => m.id);
  while (stack.length > 0) {
    const id = stack.pop() as number;
    if (id === candidateId) return true;
    for (const c of groups.get(id) ?? []) stack.push(c.id);
  }
  return false;
}

/**
 * Compute a complete list of `MapInfoHierarchyWriteRow` rows after moving `draggedId` relative
 * to `targetId` at `position`. Returns `null` when the move is invalid (self / descendant / unknown id).
 * Folder drag is implicit: descendants keep their relative order under the dragged map because their
 * parentId still references the dragged map (only the dragged map's parentId changes).
 */
export function applyHierarchyMove(
  mapInfos: MapInfosReadData,
  draggedId: number,
  targetId: number,
  position: DropPosition
): MapInfoHierarchyWriteRow[] | null {
  if (draggedId === targetId) return null;
  const dragged = mapInfos[String(draggedId)];
  const target = mapInfos[String(targetId)];
  if (!dragged || !target) return null;
  if (isDescendantOrSame(mapInfos, draggedId, targetId)) return null;

  const groups = buildChildrenMap(mapInfos);
  const oldParentId = dragged.parentId;

  let newParentId: number;
  let insertIndex: number;

  if (position === 'inside') {
    newParentId = targetId;
    const siblings = (groups.get(newParentId) ?? []).filter((m) => m.id !== draggedId);
    insertIndex = siblings.length;
  } else {
    newParentId = target.parentId;
    const siblings = (groups.get(newParentId) ?? []).filter((m) => m.id !== draggedId);
    const idx = siblings.findIndex((m) => m.id === targetId);
    if (idx < 0) return null;
    insertIndex = position === 'before' ? idx : idx + 1;
  }

  const newSiblings = (groups.get(newParentId) ?? []).filter((m) => m.id !== draggedId);
  newSiblings.splice(insertIndex, 0, { ...dragged, parentId: newParentId });

  const updates = new Map<number, { parentId: number; order: number }>();
  newSiblings.forEach((m, i) => updates.set(m.id, { parentId: newParentId, order: i }));

  if (oldParentId !== newParentId) {
    const oldSiblings = (groups.get(oldParentId) ?? []).filter((m) => m.id !== draggedId);
    oldSiblings.forEach((m, i) => updates.set(m.id, { parentId: oldParentId, order: i }));
  }

  return (Object.values(mapInfos) as MapInfoData[])
    .filter((m) => m != null)
    .map((m) => {
      const upd = updates.get(m.id);
      return {
        id: m.id,
        parentId: upd ? upd.parentId : m.parentId,
        order: upd ? upd.order : m.order,
      };
    });
}
