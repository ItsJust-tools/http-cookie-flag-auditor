import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATE,
  MAX_COOKIE_BYTES,
  byteLength,
  parseSetCookieLine,
  parseCookies,
  extractSetCookieLines,
  auditCookies,
  type ParsedCookie,
} from '@/tool/types';
import {
  cookieAuditorTool,
  serializeState,
  deserializeState,
  withHistory,
  roundTrips,
  stateFromInput,
} from '@/tool/tool-definition';

const cookie = (name: string, value = 'v', attrs = ''): ParsedCookie => {
  const parsed = parseSetCookieLine(`${name}=${value}; ${attrs}`);
  expect(parsed).not.toBeNull();
  return parsed as ParsedCookie;
};

describe('parseSetCookieLine', () => {
  it('parses a line with all attributes into name, value and attribute map', () => {
    const parsed = parseSetCookieLine(
      'sessionid=abc123; Path=/; Domain=.example.com; Secure; HttpOnly; SameSite=Strict; Max-Age=3600'
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('sessionid');
    expect(parsed!.value).toBe('abc123');
    expect(parsed!.attributes).toMatchObject({
      path: '/',
      domain: '.example.com',
      secure: '',
      httponly: '',
      samesite: 'Strict',
      'max-age': '3600',
    });
    expect(parsed!.scope).toBe('.example.com /');
  });

  it('returns null for lines without a name=value pair', () => {
    expect(parseSetCookieLine('')).toBeNull();
    expect(parseSetCookieLine('novalue')).toBeNull();
    expect(parseSetCookieLine('=novalue')).toBeNull();
    expect(parseSetCookieLine('; Secure')).toBeNull();
  });

  it('measures value length in bytes for name=value', () => {
    const parsed = cookie('sid', 'abcdef');
    expect(parsed.valueLength).toBe(byteLength('sid=abcdef'));
  });

  it('handles empty values and unknown attributes', () => {
    const parsed = parseSetCookieLine('empty=; Foo=bar; HttpOnly');
    expect(parsed).not.toBeNull();
    expect(parsed!.value).toBe('');
    expect('foo' in parsed!.attributes).toBe(false);
    expect(parsed!.attributes['httponly']).toBe('');
  });

  it('defaults scope path to / when no Path attribute', () => {
    const parsed = cookie('a', 'b', 'Secure');
    expect(parsed.scope).toContain('/');
  });
});

describe('extractSetCookieLines', () => {
  it('extracts Set-Cookie headers from a full response header block', () => {
    const block = [
      'HTTP/1.1 200 OK',
      'Content-Type: text/html',
      'Set-Cookie: a=1; Path=/',
      'x-request-id: 42',
      'Set-Cookie: b=2; HttpOnly',
    ].join('\n');
    expect(extractSetCookieLines(block)).toEqual(['a=1; Path=/', 'b=2; HttpOnly']);
  });

  it('treats bare cookie lines as Set-Cookie values', () => {
    expect(extractSetCookieLines('a=1; Secure')).toEqual(['a=1; Secure']);
  });

  it('ignores blank lines and non-cookie headers', () => {
    expect(extractSetCookieLines('Content-Length: 5\nServer: nginx')).toEqual([]);
    expect(extractSetCookieLines('\n\n')).toEqual([]);
  });
});

describe('parseCookies', () => {
  it('number lines 1-based and count total header bytes', () => {
    const { cookies, totalHeaderBytes } = parseCookies('a=1; Secure\nb=2; HttpOnly');
    expect(cookies.map((c) => c.line)).toEqual([1, 2]);
    expect(totalHeaderBytes).toBe(byteLength('a=1; Secure') + byteLength('b=2; HttpOnly'));
  });

  it('drops unparseable lines', () => {
    const { cookies } = parseCookies('garbage\na=1');
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe('a');
  });
});

describe('auditCookies', () => {
  it('flags missing Secure on SameSite=None as critical and missing SameSite alone as warning', () => {
    const findings = auditCookies([cookie('t', '1', 'SameSite=None')]);
    const noneWithoutSecure = findings.find((f) => f.title === 'SameSite=None without Secure');
    expect(noneWithoutSecure?.severity).toBe('critical');
    const missingSameSite = auditCookies([cookie('t', '1', 'Secure')]).find(
      (f) => f.title === 'Missing SameSite'
    );
    expect(missingSameSite?.severity).toBe('warning');
  });

  it('detects duplicate cookie names across lines', () => {
    const first = { ...cookie('dup', 'a'), line: 1 };
    const second = { ...cookie('dup', 'b'), line: 2 };
    const findings = auditCookies([first, second]);
    const dupes = findings.filter((f) => f.title === 'Duplicate cookie name');
    expect(dupes).toHaveLength(1);
    expect(dupes[0]?.message).toContain('line 2');
  });

  it('flags value length over 4096 bytes as oversized', () => {
    const big = cookie('big', 'x'.repeat(4096));
    const findings = auditCookies([big]);
    const oversize = findings.find((f) => f.title === 'Oversized cookie');
    expect(oversize?.severity).toBe('critical');
    expect(oversize?.message).toContain(String(4096 + 'big='.length));
  });

  it('warns (info) when a cookie is near the size limit', () => {
    const near = cookie('near', 'x'.repeat(MAX_COOKIE_BYTES - 500));
    const findings = auditCookies([near]);
    expect(findings.some((f) => f.title === 'Cookie near size limit')).toBe(true);
  });

  it('flags invalid SameSite values', () => {
    const findings = auditCookies([cookie('t', '1', 'SameSite=foo; Secure')]);
    expect(findings.some((f) => f.title === 'Invalid SameSite value')).toBe(true);
  });

  it('flags invalid Max-Age and invalid Expires', () => {
    const findings = auditCookies([cookie('t', '1', 'Max-Age=abc; Expires=not-a-date')]);
    expect(findings.some((f) => f.title === 'Invalid Max-Age')).toBe(true);
    expect(findings.some((f) => f.title === 'Invalid Expires date')).toBe(true);
  });

  it('notes when both Expires and Max-Age are set', () => {
    const findings = auditCookies([
      cookie('t', '1', 'Max-Age=10; Expires=Wed, 21 Oct 2026 07:28:00 GMT'),
    ]);
    expect(findings.some((f) => f.title === 'Both Expires and Max-Age')).toBe(true);
  });

  it('does not misfire checks on a fully-flagged modern cookie', () => {
    const good = cookie('ok', '1', 'Secure; HttpOnly; SameSite=Strict; Max-Age=60');
    const findings = auditCookies([good]);
    expect(findings.filter((f) => f.cookie === 'ok' && f.severity === 'critical')).toHaveLength(0);
    expect(findings.filter((f) => f.cookie === 'ok' && f.title.startsWith('Missing'))).toHaveLength(
      0
    );
  });

  it('includes a header-wide total size finding', () => {
    const findings = auditCookies([cookie('a', '1')], 'a=1');
    const total = findings.find(
      (f) => f.cookie === '' && f.title === 'Total Set-Cookie header size'
    );
    expect(total).toBeDefined();
  });

  it('includes fix recommendations on every finding', () => {
    const findings = auditCookies([cookie('t', '1', 'SameSite=None')]);
    for (const f of findings) expect(f.fix.length).toBeGreaterThan(0);
  });
});

describe('serialize / deserialize round-trip', () => {
  it('round-trips the parsed cookie list and findings', () => {
    const input = 'a=1; Path=/\nb=2; Secure; HttpOnly; SameSite=Lax';
    const state = stateFromInput(input);
    const restored = deserializeState(JSON.parse(serializeState(state)));
    expect(restored.success).toBe(true);
    if (!restored.success) throw new Error('unreachable');
    expect(restored.data.input).toBe(state.input);
    expect(restored.data.cookies).toEqual(state.cookies);
    expect(restored.data.totalHeaderBytes).toBe(state.totalHeaderBytes);
    expect(restored.data.findings).toEqual(state.findings);
  });

  it('roundTrips helper validates states', () => {
    expect(roundTrips(stateFromInput('a=1; Secure'))).toBe(true);
  });

  it('rejects non-object payloads', () => {
    expect(deserializeState('nope').success).toBe(false);
    expect(deserializeState(null).success).toBe(false);
    expect(deserializeState([1, 2]).success).toBe(false);
  });

  it('recomputes derived data from input when deserializing', () => {
    const restored = deserializeState({ input: 'a=1', cookies: [], findings: [] });
    expect(restored.success).toBe(true);
    if (restored.success) expect(restored.data.cookies[0]?.name).toBe('a');
  });

  it('defaults to the template input when missing', () => {
    const restored = deserializeState({ input: '' });
    void restored;
  });

  it('caps history at MAX_HISTORY with withHistory', () => {
    let state = stateFromInput('a=1');
    for (let i = 0; i < 25; i += 1) state = withHistory(state, `audit ${i}`);
    expect(state.history.length).toBe(20);
    expect(state.history[0]?.text).toBe('audit 24');
  });
});

describe('cookieAuditorTool', () => {
  it('exposes the configured id, name and exporter formats', () => {
    expect(cookieAuditorTool.id).toBe('http-cookie-flag-auditor');
    expect(cookieAuditorTool.name).toBe('HTTP Cookie Flag Auditor');
    expect(cookieAuditorTool.exporters ?? []).toHaveLength(4);
  });

  it('has an initialState with empty derived data', () => {
    expect(cookieAuditorTool.initialState.cookies).toHaveLength(0);
    expect(cookieAuditorTool.initialState.findings).toHaveLength(0);
  });
});

describe('stateFromInput', () => {
  it('derives cookies and findings in one step', () => {
    const state = stateFromInput('session=abc');
    expect(state.cookies[0]?.name).toBe('session');
    expect(state.findings.some((f) => f.title === 'Missing Secure')).toBe(true);
  });

  it('preserves prior history when recomputing', () => {
    const prev = withHistory(
      { ...DEFAULT_STATE, cookies: [], findings: [], totalHeaderBytes: 0 },
      'kept'
    );
    const next = stateFromInput('a=1', prev);
    expect(next.history).toHaveLength(1);
  });
});
