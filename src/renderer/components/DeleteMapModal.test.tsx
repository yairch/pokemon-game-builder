import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../services/bridge', () => ({
  bridge: {
    invoke: vi.fn(),
    runDeletePreflight: vi.fn(),
  },
}));

import { bridge } from '../services/bridge';
import DeleteMapModal from './DeleteMapModal';
import type { DeletePreflightResult } from '../../shared/deletePreflightTypes';

const leafNode = {
  info: { id: 1, name: 'Town', parentId: 0, order: 0, expanded: true, scrollX: 0, scrollY: 0 },
  children: [],
};

function makeResult(overrides: Partial<DeletePreflightResult>): DeletePreflightResult {
  return {
    requestedIds: [1],
    deletedIds: [1],
    survivorIds: [],
    newStartMapId: 0,
    newEditMapId: 0,
    startMapPickRequired: false,
    references: [],
    blockers: [],
    warnings: [],
    scanCounts: {
      mapsScanned: 0,
      mapsTotal: 0,
      mapsFailed: 0,
      scriptsScanned: false,
      sectionErrors: 0,
    },
    ...overrides,
  };
}

describe('DeleteMapModal', () => {
  beforeEach(() => {
    const win = window as unknown as { electron?: unknown };
    delete win.electron;
    vi.mocked(bridge.runDeletePreflight).mockImplementation(async () => ({
      success: true,
      data: makeResult({}),
    }));
    vi.mocked(bridge.invoke).mockResolvedValue({ success: true, data: { mapInfos: {}, system: {} } });
  });

  it('returns null when node is null', () => {
    const { container } = render(
      <DeleteMapModal node={null} projectPath="/p" mapInfos={{}} onClose={vi.fn()} onDeleted={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('disables Delete while references blockers exist', async () => {
    vi.mocked(bridge.runDeletePreflight).mockImplementation(async () => ({
      success: true,
      data: makeResult({
        references: [{ sourceKind: 'event', targetMapId: 2, summary: 'Transfer → Map002' }],
        blockers: [{ kind: 'references-found', refCount: 1 }],
      }),
    }));
    render(
      <DeleteMapModal
        node={leafNode}
        projectPath="/proj"
        mapInfos={{ '1': leafNode.info }}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('delete-modal-confirm')).toBeDisabled());
  });

  it('shows start map picker when start map must change', async () => {
    vi.mocked(bridge.runDeletePreflight).mockImplementation(async () => ({
      success: true,
      data: makeResult({
        survivorIds: [2, 3],
        deletedIds: [1],
        startMapPickRequired: true,
        newStartMapId: 0,
        newEditMapId: 2,
        blockers: [{ kind: 'start-map-invalidated', oldStartMapId: 5 }],
      }),
    }));
    render(
      <DeleteMapModal
        node={leafNode}
        projectPath="/proj"
        mapInfos={{
          '2': { id: 2, name: 'Two', parentId: 0, order: 1, expanded: true, scrollX: 0, scrollY: 0 },
          '3': { id: 3, name: 'Three', parentId: 0, order: 2, expanded: true, scrollX: 0, scrollY: 0 },
        }}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('delete-modal-start-map-select')).toBeVisible());
    await waitFor(() => expect(screen.getByTestId('delete-modal-confirm')).toBeEnabled());
  });

  it('Escape invokes onClose after Delete is enabled', async () => {
    const onClose = vi.fn();
    render(
      <DeleteMapModal
        node={leafNode}
        projectPath="/proj"
        mapInfos={{ '1': leafNode.info }}
        onClose={onClose}
        onDeleted={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('delete-modal-confirm')).toBeEnabled());
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', bubbles: true });
    expect(onClose).toHaveBeenCalled();
  });
});
