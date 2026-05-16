import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import MapsTree from '../MapsTree';
import type { MapInfoData } from '../../../shared/types';
import type { MapInfosTreeNode } from '../../../shared/mapInfosTree';

/**
 * Renderer tests for the right-click context menu on `MapsTree`. We verify the
 * MapsTree → MapsTreeContextMenu wiring end-to-end (open at row, fire callback,
 * close on Escape / outside / second-contextmenu) rather than testing the menu
 * in isolation, since the position + node binding logic lives in MapsTree.
 */

function makeInfo(overrides: Partial<MapInfoData> & Pick<MapInfoData, 'id' | 'name' | 'order'>): MapInfoData {
  return {
    parentId: 0,
    expanded: true,
    scrollX: 0,
    scrollY: 0,
    ...overrides,
  };
}

function leaf(id: number, name: string, order = id): MapInfosTreeNode {
  return { info: makeInfo({ id, name, order }), children: [] };
}

const sampleRoots: MapInfosTreeNode[] = [
  leaf(1, 'Pallet Town'),
  leaf(2, 'Route 1'),
  leaf(3, 'Viridian City'),
];

afterEach(() => {
  cleanup();
});

describe('MapsTree right-click context menu', () => {
  it('opens at the row that received the contextmenu event', () => {
    render(
      <MapsTree
        roots={sampleRoots}
        selectedMapId={null}
        onSelectMap={() => {}}
        resetKey="proj-a"
      />,
    );

    expect(screen.queryByRole('menu')).toBeNull();

    const row = screen.getByTestId('maps-tree-row-2');
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 });

    const menu = screen.getByRole('menu');
    expect(menu).toBeTruthy();
    expect(menu.getAttribute('aria-label')).toContain('Route 1');
    expect(menu.getAttribute('aria-label')).toContain('Map002');
  });

  it('suppresses the native browser menu on rows (preventDefault called)', () => {
    render(
      <MapsTree
        roots={sampleRoots}
        selectedMapId={null}
        onSelectMap={() => {}}
        resetKey="proj-a"
      />,
    );

    const row = screen.getByTestId('maps-tree-row-1');
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 });
    const dispatched = row.dispatchEvent(evt);
    // dispatchEvent returns false when defaultPrevented — our row handler must preventDefault.
    expect(dispatched).toBe(false);
  });

  it('invokes onDeleteMap with the right node when Delete is clicked, then closes', () => {
    const onDeleteMap = vi.fn();
    render(
      <MapsTree
        roots={sampleRoots}
        selectedMapId={null}
        onSelectMap={() => {}}
        resetKey="proj-a"
        onDeleteMap={onDeleteMap}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('maps-tree-row-3'), { clientX: 40, clientY: 40 });

    const deleteItem = screen.getByTestId('maps-tree-context-menu-delete');
    fireEvent.click(deleteItem);

    expect(onDeleteMap).toHaveBeenCalledTimes(1);
    const node = onDeleteMap.mock.calls[0]![0] as MapInfosTreeNode;
    expect(node.info.id).toBe(3);
    expect(node.info.name).toBe('Viridian City');

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape', () => {
    render(
      <MapsTree
        roots={sampleRoots}
        selectedMapId={null}
        onSelectMap={() => {}}
        resetKey="proj-a"
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('maps-tree-row-1'), { clientX: 10, clientY: 10 });
    expect(screen.queryByRole('menu')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on outside pointer down (mousedown outside the menu)', () => {
    render(
      <MapsTree
        roots={sampleRoots}
        selectedMapId={null}
        onSelectMap={() => {}}
        resetKey="proj-a"
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('maps-tree-row-2'), { clientX: 10, clientY: 10 });
    expect(screen.queryByRole('menu')).not.toBeNull();

    // mousedown on the document body (outside the portal-mounted menu) should close.
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('re-targets to a new row when a second contextmenu fires elsewhere', () => {
    render(
      <MapsTree
        roots={sampleRoots}
        selectedMapId={null}
        onSelectMap={() => {}}
        resetKey="proj-a"
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('maps-tree-row-1'), { clientX: 10, clientY: 10 });
    expect(screen.getByRole('menu').getAttribute('aria-label')).toContain('Map001');

    fireEvent.contextMenu(screen.getByTestId('maps-tree-row-3'), { clientX: 50, clientY: 50 });
    // After the close listener fires AND the new row's onContextMenu fires, the menu
    // should be open on the new row. React batches both updates into one render.
    expect(screen.getByRole('menu').getAttribute('aria-label')).toContain('Map003');
  });

  it('does nothing if onDeleteMap is not provided (menu still opens and closes)', () => {
    render(
      <MapsTree
        roots={sampleRoots}
        selectedMapId={null}
        onSelectMap={() => {}}
        resetKey="proj-a"
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('maps-tree-row-1'), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId('maps-tree-context-menu-delete'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
