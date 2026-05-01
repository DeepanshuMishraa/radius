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

## Release OAuth config

- The Google OAuth Client ID is hardcoded in `scripts/generate-oauth-config.ts`.
- The build step generates `build/oauth-config.json` and Electrobun copies that file into the packaged app resources.
- Finder-launched apps do not inherit your shell environment, so the packaged app reads that bundled JSON.
- User tokens live in the system keychain (macOS Keychain, Windows Credential Manager, or Linux Secret Service).

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
