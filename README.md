# HTTP Cookie Flag Auditor

Audit Set-Cookie headers client-side for missing Secure, HttpOnly, SameSite and other cookie attribute mistakes with severity levels and fix recommendations.

**Live:** [http-cookie-flag-auditor.itsjust.tools](https://http-cookie-flag-auditor.itsjust.tools)

## Features

- Parse multiple pasted `Set-Cookie` lines or a full raw HTTP response header block
- Flag missing `Secure`, `HttpOnly` and `SameSite` attributes with severity levels
- Detect `SameSite=None` without `Secure` (critical), duplicate cookie names and invalid attribute combinations
- Show cookie name, value length, domain/path scoping and `Max-Age` vs `Expires` analysis
- Warn on oversized cookies near the 4096-byte per-cookie browser limit and total header size
- Live per-cookie verdict cards with color-coded severity and copyable fix recommendations
- Serialize the full audit state to the URL for shareable reports
- 100% client-side — no data ever leaves your browser

## Development

```bash
npm install
npm run build -w @itsjust/core   # build shared core first
npm run dev
npm test
```

## Deployment

```bash
docker build -t itsjust-http-cookie-flag-auditor .
```

## License

MIT
