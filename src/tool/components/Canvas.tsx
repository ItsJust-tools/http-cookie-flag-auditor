'use client';

import React from 'react';
import type { Finding, ParsedCookie, Severity, ToolState } from '../types';
import { MAX_COOKIE_BYTES } from '../types';

interface CanvasProps {
  state: ToolState;
  onChange?: (state: ToolState) => void;
  onSaveHistory?: (text: string) => void;
}

const SEVERITY_STYLES: Record<Severity, string> = {
  critical:
    'border-red-400 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300',
  warning:
    'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  info: 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

const textareaClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

function CopyButton({ value, testid }: { value: string; testid?: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [value]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid={testid}
      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
      aria-label="Copy fix recommendation"
    >
      {copied ? 'Copied!' : 'Copy fix'}
    </button>
  );
}

function CookieCard({ cookie, findings }: { cookie: ParsedCookie; findings: Finding[] }) {
  const mine = findings
    .filter((f) => f.cookie === cookie.name && f.line === cookie.line)
    .sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
  const worst = mine[0]?.severity ?? 'info';
  const border =
    worst === 'critical'
      ? 'border-red-400 dark:border-red-700'
      : worst === 'warning'
        ? 'border-amber-400 dark:border-amber-700'
        : 'border-green-400 dark:border-green-700';
  const pct = Math.min(100, Math.round((cookie.valueLength / MAX_COOKIE_BYTES) * 100));
  return (
    <div
      data-testid="cookie-card"
      className={`rounded-lg border-2 bg-white p-4 shadow-sm dark:bg-gray-900 ${border}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
          {cookie.name}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="cookie-size">
          {cookie.valueLength} B
        </span>
      </div>
      <div className="mt-1 text-xs text-gray-600 dark:text-gray-300" data-testid="cookie-scope">
        {cookie.scope}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
        <div
          className={
            pct > 90
              ? 'h-full bg-red-500'
              : pct > 60
                ? 'h-full bg-amber-500'
                : 'h-full bg-green-500'
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      <dl className="mt-2 flex flex-wrap gap-1 text-[11px]">
        {['secure', 'httponly', 'samesite'].map((flag) => {
          const present = flag in cookie.attributes;
          return (
            <span
              key={flag}
              className={
                present
                  ? 'rounded bg-green-100 px-1.5 py-0.5 font-mono text-green-800 dark:bg-green-900/60 dark:text-green-300'
                  : 'rounded bg-red-100 px-1.5 py-0.5 font-mono text-red-700 dark:bg-red-900/60 dark:text-red-300'
              }
            >
              {present
                ? `✓ ${flag === 'httponly' ? 'HttpOnly' : flag === 'samesite' ? `SameSite=${cookie.attributes['samesite'] || '?'}` : 'Secure'}`
                : `✗ ${flag === 'httponly' ? 'HttpOnly' : flag === 'samesite' ? 'SameSite' : 'Secure'}`}
            </span>
          );
        })}
      </dl>
      {mine.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {mine.map((f, i) => (
            <li
              key={i}
              data-testid="cookie-finding"
              className={`rounded border p-2 text-xs ${SEVERITY_STYLES[f.severity]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <strong>
                  {SEVERITY_LABEL[f.severity]}: {f.title}
                </strong>
                <CopyButton value={f.fix} />
              </div>
              <p className="mt-1">{f.message}</p>
              <p className="mt-1 font-mono">{f.fix}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded border border-green-300 bg-green-50 p-2 text-xs text-green-800 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300">
          No issues found.
        </p>
      )}
    </div>
  );
}

export const Canvas: React.FC<CanvasProps> = ({ state, onChange, onSaveHistory }) => {
  const updateInput = (input: string) => {
    if (!onChange) return;
    // Recompute via the tool state pipeline through a custom event the host handles.
    onChange({ ...state, input });
  };

  const summaryCounts = {
    critical: state.findings.filter((f) => f.severity === 'critical').length,
    warning: state.findings.filter((f) => f.severity === 'warning').length,
    info: state.findings.filter((f) => f.severity === 'info').length,
  };

  return (
    <div className="space-y-4 p-4" data-testid="auditor-canvas">
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          Set-Cookie lines or raw response headers
          <textarea
            value={state.input}
            onChange={(e) => updateInput(e.target.value)}
            rows={6}
            spellCheck={false}
            data-testid="input-set-cookie"
            className={textareaClass}
            placeholder={'Set-Cookie: session=abc; Path=/; HttpOnly'}
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
          <span data-testid="cookie-count">{state.cookies.length} cookie(s)</span>
          <span data-testid="finding-counts">
            {summaryCounts.critical} critical · {summaryCounts.warning} warning ·{' '}
            {summaryCounts.info} info
          </span>
          <span data-testid="header-bytes">{state.totalHeaderBytes} header bytes</span>
          <button
            type="button"
            data-testid="btn-save-audit"
            className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            onClick={() =>
              onSaveHistory?.(
                `${state.cookies.length} cookies — ${summaryCounts.critical} critical, ${summaryCounts.warning} warnings`
              )
            }
          >
            Save audit
          </button>
        </div>
      </div>

      {state.cookies.length === 0 ? (
        <p className="rounded border border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          Paste one or more <code>Set-Cookie</code> headers (or a full response header block) to
          audit them.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {state.cookies.map((cookie) => (
            <CookieCard
              key={`${cookie.name}:${cookie.line}`}
              cookie={cookie}
              findings={state.findings}
            />
          ))}
        </div>
      )}
    </div>
  );
};
