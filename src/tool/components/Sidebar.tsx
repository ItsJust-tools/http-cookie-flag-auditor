'use client';

import React from 'react';
import type { ToolState } from '../types';

interface SidebarProps {
  state: ToolState;
  onChange: (next: ToolState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ state }) => {
  return (
    <div className="space-y-6 overflow-y-auto h-full p-4 text-sm" data-testid="auditor-sidebar">
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">What is audited</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <li>Missing Secure (critical when paired with SameSite=None)</li>
          <li>Missing HttpOnly</li>
          <li>Missing or invalid SameSite</li>
          <li>Duplicate cookie names across lines</li>
          <li>Cookie size near or past the 4096-byte browser limit</li>
          <li>Invalid Max-Age / Expires, both set at once</li>
          <li>Session-named cookies without any expiry</li>
          <li>Total Set-Cookie header byte size</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Saved audits</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300" data-testid="sidebar-history-count">
          {state.history.length} entr{state.history.length === 1 ? 'y' : 'ies'} in history
        </p>
        <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-300">
          {state.history.map((entry, i) => (
            <li key={i} className="truncate" title={entry.text}>
              {entry.text}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Privacy</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Everything runs client-side. No header text ever leaves your browser.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Share</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Use the toolbar share button to create a URL containing the current audit; open it to
          restore these results.
        </p>
      </div>
    </div>
  );
};
