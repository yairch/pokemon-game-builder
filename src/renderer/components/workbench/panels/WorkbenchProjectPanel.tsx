import React from 'react';
import { FolderOpen, PlusCircle } from 'lucide-react';

export interface WorkbenchProjectPanelProps {
  currentPath: string | null;
  newProjectPath: string | null;
  isInitializing: boolean;
  onSelectExisting: () => void;
  onSelectNewDestination: () => void;
  onInit: () => void;
}

export const WorkbenchProjectPanel: React.FC<WorkbenchProjectPanelProps> = ({
  currentPath,
  newProjectPath,
  isInitializing,
  onSelectExisting,
  onSelectNewDestination,
  onInit,
}) => (
  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
    <div className="space-y-3">
      <h3 className="text-sm font-medium uppercase tracking-wide text-gray-700">Open existing</h3>
      <button
        type="button"
        onClick={onSelectExisting}
        className="flex w-full items-center justify-center rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
      >
        <FolderOpen size={18} className="mr-2" />
        {currentPath ? 'Change project' : 'Select project'}
      </button>
      <div className="truncate rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-500">
        {currentPath || 'No project selected'}
      </div>
    </div>
    <div className="space-y-3 border-gray-100 sm:border-l sm:pl-6">
      <h3 className="text-sm font-medium uppercase tracking-wide text-gray-700">Create new</h3>
      <div className="flex flex-col space-y-2">
        <button
          type="button"
          onClick={onSelectNewDestination}
          className="flex w-full items-center justify-center rounded bg-gray-100 px-4 py-2 text-gray-700 transition hover:bg-gray-200"
        >
          <PlusCircle size={18} className="mr-2" />
          {newProjectPath ? 'Change destination' : 'Select destination'}
        </button>
        <div className="min-h-[32px] truncate rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-500">
          {newProjectPath || 'No destination'}
        </div>
        <button
          type="button"
          onClick={onInit}
          disabled={!newProjectPath || isInitializing}
          className={`flex w-full items-center justify-center rounded px-4 py-2 text-white transition ${
            !newProjectPath || isInitializing ? 'cursor-not-allowed bg-gray-300' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isInitializing ? 'Initializing…' : 'Init new project'}
        </button>
      </div>
    </div>
  </div>
);
