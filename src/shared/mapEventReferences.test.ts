import { describe, expect, it } from 'vitest';
import {
  MAP_ID_IDIOMS,
  extractMapReferencesFromEvents,
  scanTextForMapIds,
} from './mapEventReferences';
import type {
  EventCommandData,
  EventData,
  EventGraphicData,
  EventPageData,
} from './types';

// ---------- fixture builders ----------

function cmd(code: number, parameters: any[] = [], indent = 0): EventCommandData {
  return { code, indent, parameters };
}

const STUB_GRAPHIC: EventGraphicData = {
  tileId: 0,
  characterName: '',
  characterHue: 0,
  direction: 2,
  pattern: 0,
  opacity: 255,
  blendType: 0,
};

function page(commands: EventCommandData[], index = 0): EventPageData {
  return {
    index,
    trigger: 0,
    moveType: 0,
    moveSpeed: 3,
    moveFrequency: 3,
    walkAnime: true,
    stepAnime: false,
    directionFix: false,
    through: false,
    alwaysOnTop: false,
    graphic: STUB_GRAPHIC,
    commands,
  };
}

function event(id: number, pages: EventPageData[], name = `Event ${id}`): EventData {
  return { id, name, x: 0, y: 0, pages };
}

// ---------- scanTextForMapIds ----------

describe('scanTextForMapIds', () => {
  it('returns empty when delete set is empty', () => {
    expect(scanTextForMapIds('pbDirectTransfer(5)', new Set())).toEqual([]);
  });

  it('returns empty for empty text', () => {
    expect(scanTextForMapIds('', new Set([5]))).toEqual([]);
  });

  it('flags every literal in delete set with `possible` when no idiom present', () => {
    const result = scanTextForMapIds('foo 5 bar 7 baz', new Set([5, 7]));
    expect(result.map((r) => r.targetMapId).sort()).toEqual([5, 7]);
    for (const r of result) expect(r.confidence).toBe('possible');
  });

  it('upgrades all matches to `high` when an idiom is present', () => {
    const result = scanTextForMapIds('pbDirectTransfer(7, 5, 5)', new Set([5, 7]));
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const r of result) expect(r.confidence).toBe('high');
  });

  it('idiom match is case-insensitive', () => {
    const result = scanTextForMapIds('# pbdirecttransfer 5 here', new Set([5]));
    expect(result[0]?.confidence).toBe('high');
  });

  it('does not match a substring of a longer number', () => {
    // 123 is a substring of 1234 textually, but `\b\d+\b` matches the complete digit run.
    const result = scanTextForMapIds('id=1234 next', new Set([123]));
    expect(result).toEqual([]);
  });

  it('captures a trimmed snippet around the match', () => {
    const result = scanTextForMapIds(
      'pbDirectTransfer(5, 10, 10) # transfer to start map',
      new Set([5])
    );
    expect(result[0]?.snippet).toContain('5');
    expect(result[0]?.snippet.length).toBeLessThanOrEqual(64);
  });

  it('MAP_ID_IDIOMS is the canonical list and stable order', () => {
    expect(MAP_ID_IDIOMS).toContain('pbDirectTransfer');
    expect(MAP_ID_IDIOMS).toContain('$game_temp.player_new_map_id');
    expect(Object.isFrozen(MAP_ID_IDIOMS)).toBe(true);
  });
});

// ---------- extractMapReferencesFromEvents ----------

describe('extractMapReferencesFromEvents', () => {
  it('returns empty when no events', () => {
    expect(extractMapReferencesFromEvents(1, undefined, new Set([5]))).toEqual([]);
    expect(extractMapReferencesFromEvents(1, [], new Set([5]))).toEqual([]);
  });

  it('returns empty when delete set is empty', () => {
    const evt = event(1, [page([cmd(201, [0, 5, 1, 1, 2, 0])])]);
    expect(extractMapReferencesFromEvents(1, [evt], new Set())).toEqual([]);
  });

  it('flags 201 Transfer Player (direct) to a deleted map', () => {
    const evt = event(7, [page([cmd(201, [0, 5, 10, 10, 2, 0])])]);
    const refs = extractMapReferencesFromEvents(1, [evt], new Set([5]));
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      sourceKind: 'event',
      sourceMapId: 1,
      sourceEventId: 7,
      sourceLine: 0,
      targetMapId: 5,
    });
    expect(refs[0].confidence).toBeUndefined();
    expect(refs[0].summary).toContain('Map005');
  });

  it('ignores 201 with appoint_type=1 (variable, not literal)', () => {
    // params[0]=1 means "map id from variable" — we can't statically resolve.
    const evt = event(7, [page([cmd(201, [1, 5, 10, 10, 2, 0])])]);
    expect(extractMapReferencesFromEvents(1, [evt], new Set([5]))).toEqual([]);
  });

  it('ignores 201 to a surviving map id', () => {
    const evt = event(7, [page([cmd(201, [0, 99, 0, 0, 2, 0])])]);
    expect(extractMapReferencesFromEvents(1, [evt], new Set([5]))).toEqual([]);
  });

  it('flags 355 Script with idiom as high confidence', () => {
    const evt = event(2, [page([cmd(355, ['pbDirectTransfer(5, 8, 8)'])])]);
    const refs = extractMapReferencesFromEvents(1, [evt], new Set([5]));
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      sourceKind: 'event',
      sourceMapId: 1,
      sourceEventId: 2,
      targetMapId: 5,
      confidence: 'high',
    });
    expect(refs[0].summary?.startsWith('Script ref')).toBe(true);
  });

  it('flags 355 Script bare numeric match as possible confidence', () => {
    const evt = event(2, [page([cmd(355, ['some_var = 5'])])]);
    const refs = extractMapReferencesFromEvents(1, [evt], new Set([5]));
    expect(refs).toHaveLength(1);
    expect(refs[0].confidence).toBe('possible');
  });

  it('flags 108 Comment text references', () => {
    const evt = event(3, [page([cmd(108, ['Transfer to Map ID 7'])])]);
    const refs = extractMapReferencesFromEvents(1, [evt], new Set([7]));
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      sourceKind: 'event',
      sourceEventId: 3,
      targetMapId: 7,
      confidence: 'high',
    });
    expect(refs[0].summary?.startsWith('Comment ref')).toBe(true);
  });

  it('handles 408 / 655 continuation codes the same as their primary codes', () => {
    const evt = event(4, [
      page([
        cmd(108, ['First line referencing 5']),
        cmd(408, ['Continued comment 7']),
        cmd(355, ['x = 5']),
        cmd(655, ['y = 7']),
      ]),
    ]);
    const refs = extractMapReferencesFromEvents(1, [evt], new Set([5, 7]));
    const targets = refs.map((r) => r.targetMapId).sort();
    expect(targets).toEqual([5, 5, 7, 7]);
  });

  it('does NOT flag 202 Set Event Location (no map id in stock RPGXP)', () => {
    // params=[event_id, appoint_type, x, y, direction]. The value 5 here is event_id; we must not flag it.
    const evt = event(8, [page([cmd(202, [5, 0, 0, 0, 2])])]);
    expect(extractMapReferencesFromEvents(1, [evt], new Set([5]))).toEqual([]);
  });

  it('does NOT flag 209 Set Move Route (move commands carry x/y/dir, not map ids)', () => {
    const evt = event(9, [page([cmd(209, [5, { list: [] }])])]);
    expect(extractMapReferencesFromEvents(1, [evt], new Set([5]))).toEqual([]);
  });

  it('does NOT flag 117 Call Common Event (params[0] is a common event id)', () => {
    const evt = event(10, [page([cmd(117, [5])])]);
    expect(extractMapReferencesFromEvents(1, [evt], new Set([5]))).toEqual([]);
  });

  it('aggregates across multiple events and pages, preserving order', () => {
    const evt1 = event(1, [
      page([cmd(201, [0, 5, 0, 0, 2, 0])], 0),
      page([cmd(355, ['pbDirectTransfer(7)'])], 1),
    ]);
    const evt2 = event(2, [page([cmd(108, ['note: Map ID 5 to be deleted'])])]);
    const refs = extractMapReferencesFromEvents(42, [evt1, evt2], new Set([5, 7]));
    expect(refs.map((r) => [r.sourceEventId, r.targetMapId])).toEqual([
      [1, 5],
      [1, 7],
      [2, 5],
    ]);
    for (const r of refs) expect(r.sourceMapId).toBe(42);
  });
});
