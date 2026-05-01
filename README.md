# Radius

A minimal, fast desktop email client for Gmail. Built with [Electrobun](https://electrobun.dev) (Bun + native web views).

## What it does

- Connects to Gmail via OAuth (read-only — never sends, deletes, or modifies emails)
- Syncs your inbox locally for instant access
- Incremental catch-up on every launch — fetches new emails automatically
- Clean reader view with smooth sidebar transitions

## Requirements

- macOS
- [Bun](https://bun.sh)
- A Google Cloud project with the Gmail API enabled

## Running

```bash
# Install dependencies
bun install

# Dev with HMR (recommended)
bun run dev:hmr

# Dev without HMR
bun run dev

# Production build
bun run build:canary
```

## Security

- The Google OAuth Client ID and Client Secret are hardcoded in `src/bun/auth.ts`.
- User tokens live in the system keychain (macOS Keychain, Windows Credential Manager, or Linux Secret Service).
- PKCE is used for the OAuth authorization flow.

### Why the Client Secret is shipped

Google's Desktop app OAuth client type issues a `client_secret`, but for installed desktop applications this is effectively a pseudo-secret. The OAuth 2.0 spec for public native clients (RFC 8252) expects that installed apps cannot keep secrets confidential. Google's Desktop client type is designed with this reality in mind — the secret is meant to be embedded in the binary. PKCE (the `code_verifier`) is what actually secures the flow, not the client secret.

This is the same approach used by well-known open-source desktop apps (e.g., Thunderbird's Gmail integration). For a desktop OSS app, shipping the secret and acknowledging it in the README is the honest and standard approach.

## Project structure

```
src/
  bun/          # Main process — auth, sync, database, RPC
  mainview/     # Renderer — React UI
```

## Tech stack

- Electrobun (Bun runtime + native web views)
- React + Tailwind CSS
- SQLite (local email storage)
- Gmail API
