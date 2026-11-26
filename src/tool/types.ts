export type Severity = 'critical' | 'warning' | 'info';

export interface ParsedCookie {
  /** Cookie name. */
  name: string;
  /** Cookie value (may be empty string). */
  value: string;
  /** Lowercased attribute names -> raw attribute value ('' when flag-only). */
  attributes: Record<string, string>;
  /** Raw Set-Cookie line as provided. */
  raw: string;
  /** Byte length of the "name=value" pair. */
  valueLength: number;
  /** Scope summary, e.g. ".example.com /". */
  scope: string;
  /** Line number (1-based) in the pasted input. */
  line: number;
}

export interface Finding {
  severity: Severity;
  /** Short title, e.g. "Missing Secure". */
  title: string;
  /** Cookie this finding applies to ('' for header-wide findings). */
  cookie: string;
  /** 1-based line index; 0 for header-wide findings. */
  line: number;
  /** Human explanation. */
  message: string;
  /** Copyable fix recommendation. */
  fix: string;
}

export interface ToolState {
  /** Raw text the user pasted (Set-Cookie lines or full response header block). */
  input: string;
  /** Parsed cookies, derived. */
  cookies: ParsedCookie[];
  /** Audit findings, derived. */
  findings: Finding[];
  /** Total header bytes across lines. */
  totalHeaderBytes: number;
  /** Saved audit labels, newest first. */
  history: HistoryEntry[];
}

export interface HistoryEntry {
  text: string;
  createdAt: string;
}

export const DEFAULT_COOKIE = 'session';

export const DEFAULT_STATE: ToolState = {
  input: `${DEFAULT_COOKIE}=abc123; Path=/; HttpOnly; SameSite=Lax`,
  cookies: [],
  findings: [],
  totalHeaderBytes: 0,
  history: [],
};

export const MAX_HISTORY = 20;

/** Browser per-cookie size budget in bytes. */
export const MAX_COOKIE_BYTES = 4096;

/** Warn when a cookie is within this many bytes of the limit. */
export const COOKIE_WARN_MARGIN = 1024;

const ATTR_NAMES = [
  'secure',
  'httponly',
  'samesite',
  'path',
  'domain',
  'max-age',
  'expires',
  'partitioned',
];

function attrKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, '-');
}

/** Byte length of a string (UTF-8). */
export function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

/**
 * Parse a single Set-Cookie line into name, value and attribute map.
 * Returns null when the line has no name=value pair.
 */
export function parseSetCookieLine(raw: string): ParsedCookie | null {
  const text = raw.trim();
  if (!text) return null;
  const idx = text.indexOf(';');
  const pair = idx === -1 ? text : text.slice(0, idx);
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  if (!name) return null;
  const value = pair.slice(eq + 1).trim();
  const attributes: Record<string, string> = {};
  if (idx !== -1) {
    for (const part of text.slice(idx + 1).split(';')) {
      if (!part.trim()) continue;
      const aeq = part.indexOf('=');
      const key = attrKey(aeq === -1 ? part : part.slice(0, aeq));
      if (!ATTR_NAMES.includes(key)) continue;
      attributes[key] = aeq === -1 ? '' : part.slice(aeq + 1).trim();
    }
  }
  const domain = attributes['domain'] ? scopeDomain(attributes['domain']) : 'host-only';
  const path = attributes['path'] || '/';
  const valueLength = byteLength(`${name}=${value}`);
  return {
    name,
    value,
    attributes,
    raw: text,
    valueLength,
    scope: `${domain} ${path}`,
    line: 0,
  };
}

function scopeDomain(domain: string): string {
  const d = domain.trim().replace(/^\./, '');
  return d ? `.${d}` : 'host-only';
}

/** Extract Set-Cookie lines from a full raw response header block. */
export function extractSetCookieLines(input: string): string[] {
  const lines: string[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^set-cookie\s*:\s*/i.test(line)) {
      lines.push(line.replace(/^set-cookie\s*:\s*/i, ''));
    } else if (/^[A-Za-z-]+\s*:/.test(line)) {
      // Another header: ignore.
    } else if (/[=;]/.test(line) && !/:/.test(line)) {
      // Bare Set-Cookie value.
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Parse arbitrary pasted input (Set-Cookie lines or a full header block)
 * into the cookie list plus total header byte count.
 */
export function parseCookies(input: string): { cookies: ParsedCookie[]; totalHeaderBytes: number } {
  const lines = extractSetCookieLines(input);
  const cookies: ParsedCookie[] = lines
    .map((line) => parseSetCookieLine(line))
    .filter((c): c is ParsedCookie => c !== null)
    .map((cookie, index) => ({ ...cookie, line: index + 1 }));
  const totalHeaderBytes = lines.reduce((sum, line) => sum + byteLength(line), 0);
  return { cookies, totalHeaderBytes };
}

/**
 * Audit parsed cookies and produce findings with severity and fixes.
 * Duplicate detection uses the exact duplicate occurrences (not the first).
 */
export function auditCookies(cookies: ParsedCookie[], input = ''): Finding[] {
  const findings: Finding[] = [];
  const byName = new Map<string, number>();
  for (const cookie of cookies) {
    byName.set(cookie.name, (byName.get(cookie.name) ?? 0) + 1);
  }
  const a = (c: ParsedCookie, key: string) => key in c.attributes;

  for (const cookie of cookies) {
    const { name, attributes } = cookie;
    const base = { cookie: name, line: cookie.line };

    if (!a(cookie, 'secure')) {
      findings.push({
        ...base,
        severity: 'critical',
        title: 'Missing Secure',
        message: `${name} can be sent over plain HTTP and exposed on unencrypted connections.`,
        fix: `Add "; Secure" to the ${name} Set-Cookie header.`,
      });
    }
    if (!a(cookie, 'httponly')) {
      findings.push({
        ...base,
        severity: 'warning',
        title: 'Missing HttpOnly',
        message: `${name} is readable from JavaScript and can be stolen by XSS payloads.`,
        fix: `Add "; HttpOnly" to the ${name} Set-Cookie header.`,
      });
    }
    const sameSite = attributes['samesite'];
    if (!sameSite) {
      findings.push({
        ...base,
        severity: 'warning',
        title: 'Missing SameSite',
        message: `${name} has no SameSite attribute; modern browsers default to Lax, older ones may send it cross-site.`,
        fix: `Add "; SameSite=Lax" (or Strict/None if appropriate) to the ${name} Set-Cookie header.`,
      });
    } else if (sameSite.toLowerCase() === 'none') {
      if (!a(cookie, 'secure')) {
        findings.push({
          ...base,
          severity: 'critical',
          title: 'SameSite=None without Secure',
          message: `${name} uses SameSite=None but is not marked Secure; browsers will reject it.`,
          fix: `Add "; Secure" to the ${name} Set-Cookie header, or use SameSite=Lax.`,
        });
      }
    } else if (!['lax', 'strict'].includes(sameSite.toLowerCase())) {
      findings.push({
        ...base,
        severity: 'warning',
        title: 'Invalid SameSite value',
        message: `${name} sets SameSite=${sameSite}, which is not a recognized value (Lax, Strict, None).`,
        fix: `Use SameSite=Lax, SameSite=Strict or SameSite=None on the ${name} Set-Cookie header.`,
      });
    }

    if (attributes['max-age']) {
      const n = Number(attributes['max-age']);
      if (!Number.isFinite(n)) {
        findings.push({
          ...base,
          severity: 'warning',
          title: 'Invalid Max-Age',
          message: `${name} sets Max-Age=${attributes['max-age']}, which is not a valid integer.`,
          fix: `Use an integer number of seconds for Max-Age on the ${name} Set-Cookie header.`,
        });
      }
    }
    if (attributes['expires'] && Number.isNaN(Date.parse(attributes['expires']))) {
      findings.push({
        ...base,
        severity: 'warning',
        title: 'Invalid Expires date',
        message: `${name} sets Expires="${attributes['expires']}", which is not a valid HTTP date.`,
        fix: `Use an RFC 1123 date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT") for Expires on the ${name} Set-Cookie header.`,
      });
    }

    const bytes = cookie.valueLength;
    if (bytes > MAX_COOKIE_BYTES) {
      findings.push({
        ...base,
        severity: 'critical',
        title: 'Oversized cookie',
        message: `${name} is ${bytes} bytes, over the ${MAX_COOKIE_BYTES}-byte per-cookie browser limit; it will be dropped.`,
        fix: `Shrink the ${name} cookie below ${MAX_COOKIE_BYTES} bytes (store an id server-side or split into multiple cookies).`,
      });
    } else if (bytes >= MAX_COOKIE_BYTES - COOKIE_WARN_MARGIN) {
      findings.push({
        ...base,
        severity: 'info',
        title: 'Cookie near size limit',
        message: `${name} is ${bytes} bytes, close to the ${MAX_COOKIE_BYTES}-byte per-cookie limit (within ${COOKIE_WARN_MARGIN} bytes).`,
        fix: `Keep the ${name} cookie well below ${MAX_COOKIE_BYTES} bytes; move bulk data server-side.`,
      });
    }

    const hasExpires = a(cookie, 'expires');
    const hasMaxAge = a(cookie, 'max-age');
    if (hasExpires && hasMaxAge) {
      findings.push({
        ...base,
        severity: 'info',
        title: 'Both Expires and Max-Age',
        message: `${name} sets both Expires and Max-Age; Max-Age wins in modern browsers.`,
        fix: `Prefer Max-Age alone on the ${name} Set-Cookie header, or align both values.`,
      });
    }

    const isSession = !hasExpires && !hasMaxAge;
    if (isSession && /^session|-session$|^sid$|^auth/i.test(name)) {
      findings.push({
        ...base,
        severity: 'info',
        title: 'Session cookie without expiry',
        message: `${name} looks like a session cookie and has no Expires or Max-Age; it will vanish when the browser closes.`,
        fix: `Add "; Max-Age=<seconds>" or an Expires date to the ${name} Set-Cookie header for a persistent login.`,
      });
    }
  }

  for (const cookie of cookies) {
    if ((byName.get(cookie.name) ?? 0) > 1) {
      const first = cookies.find((c) => c.name === cookie.name);
      if (!first || first !== cookie) {
        findings.push({
          cookie: cookie.name,
          line: cookie.line,
          severity: 'warning',
          title: 'Duplicate cookie name',
          message: `Cookie "${cookie.name}" is set more than once (line ${cookie.line} duplicates line ${first?.line}); later attributes may be ignored and scoping can conflict.`,
          fix: `Remove the duplicate "${cookie.name}" Set-Cookie header on line ${cookie.line}, or use distinct names/paths.`,
        });
      }
    }
  }

  findings.push({
    cookie: '',
    line: 0,
    severity: 'info',
    title: 'Total Set-Cookie header size',
    message: `The Set-Cookie headers total ${input ? byteLength(input) : cookies.reduce((sum, c) => sum + c.valueLength, 0)} bytes across ${cookies.length} cookie(s).`,
    fix: 'Keep the total Set-Cookie payload small; headers above ~8 KB risk buffering limits in proxies.',
  });

  return findings;
}

/** Compact summary used by the status bar and copy actions. */
export function formatHistoryText(state: ToolState): string {
  const critical = state.findings.filter((f) => f.severity === 'critical').length;
  const warning = state.findings.filter((f) => f.severity === 'warning').length;
  return `${state.cookies.length} cookie(s): ${critical} critical, ${warning} warning(s), ${state.totalHeaderBytes} header bytes`;
}
