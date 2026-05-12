import React from 'react';

export const WorkbenchHelpPanel: React.FC = () => (
  <>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Quick tips</h3>
    <ul className="mt-2 list-disc space-y-2 pl-4 text-[13px] leading-relaxed text-zinc-600 marker:text-zinc-300">
      <li>Select your Pokémon Essentials project folder.</li>
      <li>Use chat to create maps, events, or scripts.</li>
      <li>Changes write to your project on disk.</li>
      <li>Open RPG Maker XP for full editing when needed.</li>
    </ul>
  </>
);
