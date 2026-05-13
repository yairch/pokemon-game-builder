import { describe, expect, it } from 'vitest';
import { computeStartMapIntegrityIssue } from './startMapIntegrity';
import type { MapInfosReadData, SystemReadData } from './types';

const sys = (startMapId: number): SystemReadData => ({
  startMapId,
  startX: 0,
  startY: 0,
  editMapId: 1,
  partyMembers: [],
  elements: [],
  switches: [],
  variables: [],
  windowskinName: '',
  titleName: '',
  gameoverName: '',
  battleTransition: '',
  battlebackName: '',
});

describe('computeStartMapIntegrityIssue', () => {
  it('returns null while map infos loading', () => {
    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: true,
        systemData: sys(1),
        mapInfos: {},
        mapInfosLoading: true,
        startMapRxdataExists: null,
      })
    ).toBe(null);
  });

  it('returns null when system read failed', () => {
    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: false,
        systemData: null,
        mapInfos: { '1': { id: 1, name: 'A', parentId: 0, order: 0, expanded: true, scrollX: 0, scrollY: 0 } },
        mapInfosLoading: false,
        startMapRxdataExists: true,
      })
    ).toBe(null);
  });

  it('warns when maps exist but start map id is unset', () => {
    const mapInfos: MapInfosReadData = {
      '1': { id: 1, name: 'A', parentId: 0, order: 0, expanded: true, scrollX: 0, scrollY: 0 },
    };
    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: true,
        systemData: sys(0),
        mapInfos,
        mapInfosLoading: false,
        startMapRxdataExists: null,
      })
    ).toEqual({ kind: 'no-start-with-maps', startMapId: 0 });
  });

  it('warns when start id not listed in MapInfos', () => {
    const mapInfos: MapInfosReadData = {
      '1': { id: 1, name: 'A', parentId: 0, order: 0, expanded: true, scrollX: 0, scrollY: 0 },
    };
    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: true,
        systemData: sys(99),
        mapInfos,
        mapInfosLoading: false,
        startMapRxdataExists: null,
      })
    ).toEqual({ kind: 'start-not-in-infos', startMapId: 99 });
  });

  it('returns pending until rxdata existence resolved when start map is registered', () => {
    const mapInfos: MapInfosReadData = {
      '5': { id: 5, name: 'A', parentId: 0, order: 0, expanded: true, scrollX: 0, scrollY: 0 },
    };
    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: true,
        systemData: sys(5),
        mapInfos,
        mapInfosLoading: false,
        startMapRxdataExists: null,
      })
    ).toBe('pending');

    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: true,
        systemData: sys(5),
        mapInfos,
        mapInfosLoading: false,
        startMapRxdataExists: false,
      })
    ).toEqual({ kind: 'start-map-file-missing', startMapId: 5 });

    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: true,
        systemData: sys(5),
        mapInfos,
        mapInfosLoading: false,
        startMapRxdataExists: true,
      })
    ).toBe(null);
  });

  it('warns when MapInfos empty but System still references a positive map id', () => {
    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: true,
        systemData: sys(3),
        mapInfos: {},
        mapInfosLoading: false,
        startMapRxdataExists: null,
      })
    ).toEqual({ kind: 'start-but-empty-infos', startMapId: 3 });
  });

  it('does not warn when no maps and start map id cleared', () => {
    expect(
      computeStartMapIntegrityIssue({
        systemReadOk: true,
        systemData: sys(0),
        mapInfos: {},
        mapInfosLoading: false,
        startMapRxdataExists: null,
      })
    ).toBe(null);
  });
});
