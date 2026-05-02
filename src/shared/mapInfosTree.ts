import type { MapInfoData, MapInfosReadData } from './types';

export interface MapInfosTreeNode {
  info: MapInfoData;
  children: MapInfosTreeNode[];
}

/** RPG Maker XP / Essentials: sibling order follows `order`, then tie-break `id`. */
function sortSiblingRows(rows: MapInfoData[]): MapInfoData[] {
  return [...rows].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id - b.id;
  });
}

/**
 * Build a forest of map tree nodes using `parentId` + `order`, like RMXP MapInfos.
 * Entries whose parent is missing attach at root (same as treating parent as `0`).
 */
export function buildMapInfosTree(mapInfos: MapInfosReadData): MapInfosTreeNode[] {
  const list = Object.values(mapInfos).filter(Boolean) as MapInfoData[];
  const idSet = new Set(list.map((e) => e.id));

  const normalizedParentById = new Map<number, number>();
  for (const info of list) {
    let p = info.parentId;
    if (p !== 0 && !idSet.has(p)) p = 0;
    normalizedParentById.set(info.id, p);
  }

  const byParent = new Map<number, MapInfoData[]>();
  for (const info of list) {
    const p = normalizedParentById.get(info.id) ?? 0;
    const bucket = byParent.get(p) ?? [];
    bucket.push(info);
    byParent.set(p, bucket);
  }

  for (const [pid, bucket] of byParent) {
    byParent.set(pid, sortSiblingRows(bucket));
  }

  function toTreeNode(info: MapInfoData): MapInfosTreeNode {
    const rawChildren = byParent.get(info.id) ?? [];
    const children = sortSiblingRows(rawChildren).map(toTreeNode);
    return { info, children };
  }

  const roots = byParent.get(0) ?? [];
  return roots.map(toTreeNode);
}

export function preorderMapTreeIds(roots: MapInfosTreeNode[]): number[] {
  const ids: number[] = [];
  function walk(n: MapInfosTreeNode) {
    ids.push(n.info.id);
    for (const c of n.children) walk(c);
  }
  for (const r of roots) walk(r);
  return ids;
}

/** Default map shown in preview after load (first preorder node). */
export function getDefaultPreviewMapId(mapInfos: MapInfosReadData | null): number | null {
  if (!mapInfos || Object.keys(mapInfos).length === 0) return null;
  const preorder = preorderMapTreeIds(buildMapInfosTree(mapInfos));
  return preorder[0] ?? null;
}
