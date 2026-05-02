import { describe, expect, it } from 'vitest';
import { mapReadDataToMapData } from './mapReadToMapData';
import type { MapReadData } from './types';

describe('mapReadDataToMapData', () => {
  it('fills id/name and copies geometry and layers', () => {
    const read: MapReadData = {
      tilesetId: 7,
      width: 2,
      height: 3,
      autoplayBgm: false,
      bgm: null,
      autoplayBgs: false,
      bgs: null,
      encounterStep: 25,
      encounterList: [],
      layers: [
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      ],
      events: [],
    };
    const m = mapReadDataToMapData(42, 'Test Town', read);
    expect(m).toMatchObject({
      id: 42,
      name: 'Test Town',
      tilesetId: 7,
      width: 2,
      height: 3,
      layers: read.layers,
      events: [],
    });
  });
});
