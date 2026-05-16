import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import type { MapInfosTreeNode } from '../../shared/mapInfosTree';

/**
 * Right-click context menu over a `MapsTree` row.
 *
 * Owned by `MapsTree.tsx` (which holds open/closed state) so the menu can be
 * pixel-positioned at the cursor and the renderer doesn't need its own menu
 * registry. Portals to `document.body` so it floats above the workbench split.
 *
 * v1 has a single action — Delete — so we don't need arrow-key item navigation
 * yet. When more actions arrive (rename / duplicate / etc.), add a roving
 * tabindex pattern across menuitems.
 *
 * Closes on: Escape, outside pointerdown, another contextmenu anywhere outside
 * the menu (so right-clicking a different row opens a fresh menu via the
 * tree's `onContextMenu` handler — both events fire in the same React batch,
 * the closing setState and the new-opening setState collapse into one update).
 */
export interface MapsTreeContextMenuProps {
  /** Cursor x in CSS pixels (typically `e.clientX` from the originating event). */
  x: number;
  /** Cursor y in CSS pixels (typically `e.clientY` from the originating event). */
  y: number;
  /** Tree node the menu was opened for. Passed to action handlers verbatim. */
  node: MapInfosTreeNode;
  /** Closes the menu without performing an action. */
  onClose: () => void;
  /** Destructive action — non-destructive in this commit; commit 7 wires the modal. */
  onDelete: (node: MapInfosTreeNode) => void;
}

const MENU_WIDTH = 180;
const MENU_HEIGHT_APPROX = 44;
const VIEWPORT_MARGIN = 8;

const MapsTreeContextMenu: React.FC<MapsTreeContextMenuProps> = ({
  x,
  y,
  node,
  onClose,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  // Position the menu so it stays inside the viewport. Computed in an effect
  // (not directly during render) so SSR-style first-paint stays at the cursor;
  // jsdom in tests treats window dims as 0 unless explicitly set, so we clamp
  // with sensible fallbacks.
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({ left: x, top: y }));
  useEffect(() => {
    const vw = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 768;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(x, vw - MENU_WIDTH - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(y, vh - MENU_HEIGHT_APPROX - VIEWPORT_MARGIN));
    setPos({ left, top });
  }, [x, y]);

  // Default focus on the Delete item so keyboard users can activate via Enter / Space.
  useEffect(() => {
    deleteRef.current?.focus();
  }, []);

  // Outside-pointerdown / Escape / second-contextmenu → close. Capture-phase so
  // we close BEFORE the inner button's click fires (a left-click on an outside
  // element should still close the menu without also activating that element —
  // we use mousedown semantics for parity with native menus).
  useEffect(() => {
    const insideMenu = (target: EventTarget | null) =>
      target instanceof Node && menuRef.current?.contains(target);

    const onMouseDown = (e: MouseEvent) => {
      if (!insideMenu(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!insideMenu(e.target)) onClose();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [onClose]);

  const mapIdLabel = `Map${String(node.info.id).padStart(3, '0')}`;
  const nodeName = String(node.info.name || 'Untitled map');

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Map actions for ${nodeName} (${mapIdLabel})`}
      style={{ position: 'fixed', left: pos.left, top: pos.top, width: MENU_WIDTH }}
      className="z-[10000] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/[0.08]"
      // Suppress contextmenu inside our own menu so a right-click on a menu item
      // doesn't recurse into the document-level close listener AND open a fresh menu.
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        ref={deleteRef}
        type="button"
        role="menuitem"
        data-testid="maps-tree-context-menu-delete"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none"
        onClick={() => {
          onDelete(node);
          onClose();
        }}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        Delete
      </button>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(menu, document.body) : null;
};

export default MapsTreeContextMenu;
