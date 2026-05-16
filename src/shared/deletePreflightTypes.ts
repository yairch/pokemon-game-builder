/**
 * Shared shape for delete-preflight progress + results — consumed by the renderer modal,
 * the main-process orchestrator (`delete-preflight.ts`), handlers, and the REST adapter.
 */

import type { MapReference } from './deleteIntegrity';

/** Stepped progress event. Emitted at the start of each stage and once per completed map read. */
export type DeletePreflightProgress =
  | { step: 'system' }
  | { step: 'map-events'; current: number; total: number }
  | { step: 'scripts' }
  | { step: 'done' };

/** Conditions that prevent confirm until resolved or cleared by fixing references externally. */
export type DeletePreflightBlocker =
  | { kind: 'start-map-invalidated'; oldStartMapId: number }
  | { kind: 'references-found'; refCount: number };

/** Non-blocking notices. */
export type DeletePreflightWarning =
  | { kind: 'delete-to-zero' }
  | { kind: 'edit-map-changed'; from: number; to: number }
  | { kind: 'script-section-errors'; count: number };

export interface DeletePreflightResult {
  requestedIds: number[];
  deletedIds: number[];
  survivorIds: number[];
  newStartMapId: number;
  newEditMapId: number;
  startMapPickRequired: boolean;
  references: MapReference[];
  blockers: DeletePreflightBlocker[];
  warnings: DeletePreflightWarning[];
  scanCounts: {
    mapsScanned: number;
    mapsTotal: number;
    mapsFailed: number;
    scriptsScanned: boolean;
    sectionErrors: number;
  };
}
