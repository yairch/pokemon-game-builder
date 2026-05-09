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

  it('maps read-map events for preview markers', () => {
    const read: MapReadData = {
      tilesetId: 7,
      width: 2,
      height: 2,
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
        ],
      ],
      events: [
        {
          id: 12,
          name: 'Guide NPC',
          x: 1,
          y: 0,
          pages: [],
        },
      ],
    };

    const m = mapReadDataToMapData(42, 'Test Town', read);
    expect(m.events).toEqual([
      {
        id: 12,
        type: 'event',
        x: 1,
        y: 0,
        name: 'Guide NPC',
        graphicTileId: 0,
        characterName: '',
        direction: 2,
        pattern: 0,
      },
    ]);
  });

  it('picks first page that has a visual graphic', () => {
    const read: MapReadData = {
      tilesetId: 7,
      width: 2,
      height: 2,
      autoplayBgm: false,
      bgm: null,
      autoplayBgs: false,
      bgs: null,
      encounterStep: 25,
      encounterList: [],
      layers: [[[1, 2], [3, 4]]],
      events: [
        {
          id: 13,
          name: 'Guard',
          x: 0,
          y: 1,
          pages: [
            {
              index: 0,
              trigger: 0,
              moveType: 0,
              moveSpeed: 3,
              moveFrequency: 3,
              walkAnime: true,
              stepAnime: false,
              directionFix: false,
              through: false,
              alwaysOnTop: false,
              graphic: {
                tileId: 0,
                characterName: '',
                characterHue: 0,
                direction: 2,
                pattern: 0,
                opacity: 255,
                blendType: 0,
              },
              commands: [],
            },
            {
              index: 1,
              trigger: 0,
              moveType: 0,
              moveSpeed: 3,
              moveFrequency: 3,
              walkAnime: true,
              stepAnime: false,
              directionFix: false,
              through: false,
              alwaysOnTop: false,
              graphic: {
                tileId: 0,
                characterName: 'npc001',
                characterHue: 0,
                direction: 2,
                pattern: 0,
                opacity: 255,
                blendType: 0,
              },
              commands: [],
            },
          ],
        },
      ],
    };
    const m = mapReadDataToMapData(7, 'House', read);
    expect(m.events[0]?.characterName).toBe('npc001');
    expect(m.events[0]?.direction).toBe(2);
    expect(m.events[0]?.pattern).toBe(0);
  });
});
