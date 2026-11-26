import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import {
  DEFAULT_STATE,
  MAX_HISTORY,
  auditCookies,
  parseCookies,
  type HistoryEntry,
  type ParsedCookie,
  type ToolState,
} from './types';

/** Serialize tool state into a compact JSON string for share/import. */
export function serializeState(state: ToolState): string {
  return JSON.stringify({
    input: state.input,
    cookies: state.cookies,
    findings: state.findings,
    totalHeaderBytes: state.totalHeaderBytes,
    history: state.history,
  });
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function validHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is HistoryEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as HistoryEntry).text === 'string' &&
        typeof (entry as HistoryEntry).createdAt === 'string'
    )
    .slice(0, MAX_HISTORY);
}

/**
 * Recover cookie state from an arbitrary payload. Derived values are always
 * recomputed from `input` so shared URLs stay consistent; the stored
 * cookies/findings/totalHeaderBytes are validated as best effort.
 */
export function deserializeState(data: unknown): DeserializeResult<ToolState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      success: false,
      error: 'Invalid data format: expected cookie auditor state object',
    };
  }
  const v = data as Record<string, unknown>;
  const input = stringOr(v.input, DEFAULT_STATE.input);
  const { cookies, totalHeaderBytes } = parseCookies(input);
  const state: ToolState = {
    input,
    cookies,
    findings: auditCookies(cookies, input),
    totalHeaderBytes,
    history: validHistory(v.history),
  };
  return { success: true, data: state };
}

/** Append a history entry to state, capped at MAX_HISTORY, newest first. */
export function withHistory(state: ToolState, text: string, now = new Date()): ToolState {
  const entry: HistoryEntry = { text, createdAt: now.toISOString() };
  return { ...state, history: [entry, ...state.history].slice(0, MAX_HISTORY) };
}

/** True when a serialized string round-trips back to the same state. */
export function roundTrips(state: ToolState): boolean {
  try {
    const restored = deserializeState(JSON.parse(serializeState(state)));
    return restored.success && JSON.stringify(restored.data) === JSON.stringify(state);
  } catch {
    return false;
  }
}

/** Recompute a full state from an input string. */
export function stateFromInput(input: string, previous?: ToolState): ToolState {
  const { cookies, totalHeaderBytes } = parseCookies(input);
  return {
    input,
    cookies,
    findings: auditCookies(cookies, input),
    totalHeaderBytes,
    history: previous?.history ?? [],
  };
}

export type { ParsedCookie };

export const cookieAuditorTool: Tool<ToolState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: { ...DEFAULT_STATE, cookies: [], findings: [], totalHeaderBytes: 0 },
  serialize: serializeState,
  deserialize: deserializeState,
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};
