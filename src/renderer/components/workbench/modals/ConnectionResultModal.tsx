import React from 'react';
import { createPortal } from 'react-dom';

export interface ConnectionResultModalProps {
  result: { success: boolean; message: string } | null;
  onClose: () => void;
}

export const ConnectionResultModal: React.FC<ConnectionResultModalProps> = ({ result, onClose }) => {
  if (!result) return null;

  const shell = (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div
          role="dialog"
          aria-modal="true"
          className="flex max-h-[min(80vh,calc(100vh-4rem))] w-full max-w-2xl flex-col rounded-lg bg-white p-6 shadow-xl"
        >
        <div className="mb-4 flex items-center justify-between">
          <h3 className={`text-lg font-bold ${result.success ? 'text-green-600' : 'text-red-600'}`}>
            {result.success ? 'Success' : 'Connection error'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="flex-1 cursor-text select-text overflow-y-auto whitespace-pre-wrap break-all rounded border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed">
          {result.message}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded bg-gray-800 py-2 text-white transition hover:bg-black"
        >
          Close
        </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(shell, document.body) : null;
};
