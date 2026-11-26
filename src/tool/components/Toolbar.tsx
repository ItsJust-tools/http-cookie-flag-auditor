'use client';

import React from 'react';
import type { ToolState } from '../types';

interface ToolbarProps {
  state: ToolState;
  onChange: (next: ToolState) => void;
  onClear: () => void;
  onCopy?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ state, onChange, onClear, onCopy }) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2" role="group" aria-label="Cookie auditor controls">
        <button
          type="button"
          onClick={() => onChange({ ...state, input: '' })}
          data-testid="btn-clear-input"
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Clear input
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...state,
              input:
                'Set-Cookie: session=abc123; Path=/\nSet-Cookie: csrf=xyz; Path=/; Secure; HttpOnly; SameSite=Lax',
            })
          }
          data-testid="btn-sample"
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Load sample
        </button>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            data-testid="btn-copy-report"
            className="rounded-md bg-amber-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            Copy report
          </button>
        ) : null}
        {state.history.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange({ ...state, history: [] })}
            data-testid="btn-clear-history"
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Clear history
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClear}
        data-testid="btn-clear"
        className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300"
      >
        Reset all
      </button>
    </div>
  );
};
