import type { ToolState } from './types';

export function isState(value: unknown): value is ToolState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ToolState>;
  return typeof v.input === 'string' && Array.isArray(v.cookies) && Array.isArray(v.findings);
}
