import React, { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';

export interface HeaderPopoverProps {
  label: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  disabled?: boolean;
  buttonClassName?: string;
  panelClassName?: string;
  /** Max panel width in CSS pixels (clamped to viewport). */
  panelMaxWidthPx?: number;
  /** Highlight button when panel is open */
  accentWhenOpen?: boolean;
}

const VIEW_MARGIN = 14;
const GAP = 6;

/**
 * Header dropdown using fixed positioning clamped to the viewport (no horizontal/vertical clip).
 */
export const HeaderPopover: React.FC<HeaderPopoverProps> = ({
  label,
  isOpen,
  onOpenChange,
  children,
  align = 'left',
  disabled = false,
  buttonClassName = '',
  panelClassName = '',
  panelMaxWidthPx = 380,
  accentWhenOpen = true,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const btnId = useId();
  const panelId = useId();

  const positionPanel = useCallback(() => {
    const panel = panelRef.current;
    const btn = btnRef.current;
    if (!panel || !btn || !isOpen) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = Math.min(panelMaxWidthPx, vw - VIEW_MARGIN * 2);
    const maxH = Math.min(560, Math.floor(vh * 0.7), vh - VIEW_MARGIN * 2);

    panel.style.boxSizing = 'border-box';
    panel.style.width = 'auto';
    panel.style.maxWidth = `${maxW}px`;
    panel.style.maxHeight = `${maxH}px`;

    const br = btn.getBoundingClientRect();
    const ph = panel.offsetHeight;
    const pw = panel.offsetWidth;

    let left = align === 'right' ? br.right - pw : br.left;
    left = Math.min(Math.max(left, VIEW_MARGIN), vw - pw - VIEW_MARGIN);

    let top = br.bottom + GAP;
    if (top + ph > vh - VIEW_MARGIN) {
      top = br.top - ph - GAP;
    }
    top = Math.min(Math.max(top, VIEW_MARGIN), vh - ph - VIEW_MARGIN);

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }, [align, isOpen, panelMaxWidthPx]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    positionPanel();
    const panel = panelRef.current;
    const ro =
      typeof ResizeObserver !== 'undefined' && panel ? new ResizeObserver(() => positionPanel()) : null;
    if (panel) ro?.observe(panel);
    return () => ro?.disconnect();
  }, [isOpen, positionPanel]);

  useEffect(() => {
    if (!isOpen) return;
    const update = () => positionPanel();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen, positionPanel]);

  useEffect(() => {
    if (!isOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    window.requestAnimationFrame(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      el?.focus();
    });
  }, [isOpen]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        id={btnId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? panelId : undefined}
        disabled={disabled}
        className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
          isOpen && accentWhenOpen
            ? 'border-blue-400 bg-blue-50 text-blue-900'
            : 'border-zinc-200/90 bg-white text-zinc-800 hover:bg-zinc-50'
        } ${buttonClassName}`}
        onClick={() => !disabled && onOpenChange(!isOpen)}
      >
        {label}
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={btnId}
          className={`fixed z-[200] min-w-0 overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-lg ring-1 ring-black/[0.06] ${panelClassName}`}
          style={{ left: 0, top: 0 }}
        >
          {children}
        </div>
      )}
    </div>
  );
};
