import React, { useId, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import type { StartMapIntegrityIssue } from '../../shared/startMapIntegrity';

interface StartMapWarningBannerProps {
  issue: StartMapIntegrityIssue;
}

function primaryMessage(issue: StartMapIntegrityIssue): string {
  switch (issue.kind) {
    case 'no-start-with-maps':
      return 'Player start map is not set in System data. Starting a new game in RPG Maker XP / Essentials may not work until you choose a valid starting map.';
    case 'start-not-in-infos':
      return `Player start map is set to Map${String(issue.startMapId).padStart(3, '0')}, but that map is not listed in MapInfos. New games may fail until System is corrected in RPG Maker XP.`;
    case 'start-map-file-missing':
      return `Player start map points to Map${String(issue.startMapId).padStart(3, '0')}, but Data/Map${String(issue.startMapId).padStart(3, '0')}.rxdata is missing on disk. New games may fail until the map file exists or System is updated.`;
    case 'start-but-empty-infos':
      return `Player start map is set to Map${String(issue.startMapId).padStart(3, '0')}, but this project has no maps in MapInfos. New games may fail until maps exist and System matches them.`;
    default:
      return '';
  }
}

const DetailsBody: React.FC = () => (
  <div className="mt-2 space-y-2 border-t border-amber-200/90 pt-2 text-[12px] leading-snug text-amber-950/85">
    <p>
      RPG Maker XP stores the starting location in <span className="font-mono text-[11px]">System.rxdata</span>{' '}
      (<span className="font-mono text-[11px]">start_map_id</span> plus coordinates). Pokemon Essentials relies on the same data unless your
      scripts replace it entirely.
    </p>
    <p>
      Fix this in RPG Maker XP by opening your project, choosing <strong>Tools → Database → System</strong>, and setting the starting map and
      player position—or restore consistency between MapInfos and map files first if this project was edited outside RMXP.
    </p>
  </div>
);

/**
 * Non-blocking alert shown when System's player start map does not match loaded MapInfos / disk (see shared/startMapIntegrity.ts).
 */
const StartMapWarningBanner: React.FC<StartMapWarningBannerProps> = ({ issue }) => {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <div
      role="region"
      aria-label="Player start map warning"
      className="shrink-0 rounded-xl border border-amber-300/90 bg-amber-50/95 px-3 py-2.5 shadow-sm ring-1 ring-amber-400/25"
    >
      <div className="flex gap-2">
        <span className="mt-0.5 shrink-0 text-amber-700" aria-hidden>
          <AlertTriangle className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-amber-950">Player start map may be invalid</p>
          <p className="mt-1 text-[12px] leading-snug text-amber-950/90">{primaryMessage(issue)}</p>
          <button
            type="button"
            id={`${detailsId}-toggle`}
            aria-expanded={open}
            aria-controls={`${detailsId}-panel`}
            className="mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-amber-900/95 underline-offset-2 hover:bg-amber-100/90 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/60 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            Learn more
          </button>
          {open ? (
            <div id={`${detailsId}-panel`} role="region" className="outline-none">
              <DetailsBody />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default StartMapWarningBanner;
