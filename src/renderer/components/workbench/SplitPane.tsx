import React, { useCallback, useEffect, useRef, useState } from 'react';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface SplitPaneProps {
  orientation: 'horizontal' | 'vertical';
  /** sessionStorage key for the primary size ratio */
  storageKey: string;
  /** Primary pane size ratio (0–1). Primary is left (horizontal) or top (vertical). */
  defaultRatio?: number;
  minPrimaryPx?: number;
  minSecondaryPx?: number;
  className?: string;
  primary: React.ReactNode;
  secondary: React.ReactNode;
}

/**
 * Draggable split between two panes. Ratio persists for the browser session.
 * Double-click the separator to reset to defaultRatio.
 */
export const SplitPane: React.FC<SplitPaneProps> = ({
  orientation,
  storageKey,
  defaultRatio = 0.5,
  minPrimaryPx = 120,
  minSecondaryPx = 160,
  className = '',
  primary,
  secondary,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(defaultRatio);
  const draggingRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw == null) return;
      const v = Number(raw);
      if (Number.isFinite(v) && v > 0.08 && v < 0.92) setRatio(v);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const persist = useCallback(
    (r: number) => {
      setRatio(r);
      try {
        sessionStorage.setItem(storageKey, String(r));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const total = orientation === 'horizontal' ? rect.width : rect.height;
      if (total <= 0) return;
      const next =
        orientation === 'horizontal'
          ? (e.clientX - rect.left) / total
          : (e.clientY - rect.top) / total;
      const minR = minPrimaryPx / total;
      const maxR = 1 - minSecondaryPx / total;
      persist(clamp(next, minR, maxR));
    },
    [orientation, minPrimaryPx, minSecondaryPx, persist]
  );

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback(() => {
    draggingRef.current = true;
    document.body.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  }, [orientation, onPointerMove, endDrag]);

  useEffect(() => () => endDrag(), [endDrag]);

  const onSeparatorKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.02;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const total = orientation === 'horizontal' ? rect.width : rect.height;
    if (total <= 0) return;
    const minR = minPrimaryPx / total;
    const maxR = 1 - minSecondaryPx / total;

    const decreasePrimary =
      orientation === 'horizontal' ? e.key === 'ArrowLeft' : e.key === 'ArrowUp';
    const increasePrimary =
      orientation === 'horizontal' ? e.key === 'ArrowRight' : e.key === 'ArrowDown';

    if (decreasePrimary) {
      e.preventDefault();
      persist(clamp(ratio - step, minR, maxR));
    } else if (increasePrimary) {
      e.preventDefault();
      persist(clamp(ratio + step, minR, maxR));
    }
  };

  const flexDir = orientation === 'horizontal' ? 'flex-row' : 'flex-col';
  const sepCursor = orientation === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize';
  const sepSize = orientation === 'horizontal' ? 'w-1.5 min-w-[6px]' : 'h-1.5 min-h-[6px]';

  return (
    <div
      ref={containerRef}
      className={`flex ${flexDir} min-h-0 min-w-0 flex-1 overflow-hidden ${className}`}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden flex flex-col"
        style={{ flex: `${ratio} 1 0px` }}
      >
        {primary}
      </div>
      <div
        role="separator"
        aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className={`flex-shrink-0 bg-zinc-300/90 hover:bg-blue-500/80 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 z-10 ${sepSize} ${sepCursor}`}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).focus();
          startDrag();
        }}
        onDoubleClick={() => persist(defaultRatio)}
        onKeyDown={onSeparatorKeyDown}
      />
      <div
        className="min-h-0 min-w-0 overflow-hidden flex flex-col"
        style={{ flex: `${1 - ratio} 1 0px` }}
      >
        {secondary}
      </div>
    </div>
  );
};
