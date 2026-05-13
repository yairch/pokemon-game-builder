import type { MapInfosReadData, SystemReadData } from './types';

export type StartMapIntegrityIssue =
  | { kind: 'no-start-with-maps'; startMapId: number }
  | { kind: 'start-not-in-infos'; startMapId: number }
  | { kind: 'start-map-file-missing'; startMapId: number }
  | { kind: 'start-but-empty-infos'; startMapId: number };

/** Waiting on async map-file existence check for the current start map id. */
export type StartMapIntegrityPending = 'pending';

/**
 * Decide whether to show the proactive start-map banner (excluding loading / unreadable System).
 * Returns `'pending'` when `map.rxdata` existence must still be resolved for fidelity.
 */
export function computeStartMapIntegrityIssue(params: {
  systemReadOk: boolean;
  systemData: SystemReadData | null;
  mapInfos: MapInfosReadData | null;
  mapInfosLoading: boolean;
  /** Result of fs check for Data/Mapxxx.rxdata when applicable; null if not resolved yet */
  startMapRxdataExists: boolean | null;
}): StartMapIntegrityIssue | null | StartMapIntegrityPending {
  const { systemReadOk, systemData, mapInfos, mapInfosLoading, startMapRxdataExists } = params;

  if (!systemReadOk || !systemData || mapInfosLoading || mapInfos === null) return null;

  const mapKeys = Object.keys(mapInfos).filter((k) => mapInfos[k] != null);
  const hasMaps = mapKeys.length > 0;
  const sid = Number(systemData.startMapId);

  if (!hasMaps) {
    if (sid >= 1) {
      return { kind: 'start-but-empty-infos', startMapId: sid };
    }
    return null;
  }

  if (sid < 1) {
    return { kind: 'no-start-with-maps', startMapId: sid };
  }

  const inInfos = Object.prototype.hasOwnProperty.call(mapInfos, String(sid));
  if (!inInfos) {
    return { kind: 'start-not-in-infos', startMapId: sid };
  }

  if (startMapRxdataExists === null) return 'pending';
  if (!startMapRxdataExists) {
    return { kind: 'start-map-file-missing', startMapId: sid };
  }

  return null;
}
