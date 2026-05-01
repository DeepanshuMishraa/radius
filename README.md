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

## Setup

Create a `.env` file in the project root:

```env
GOOGLE_CLIENT_ID=your_client_id
```

`GOOGLE_CLIENT_ID` is bundled into release builds through a generated `build/oauth-config.json`.

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

- Keep your build-time values in the project root `.env`, or export them in CI.
- The build step generates `build/oauth-config.json` and Electrobun copies that file into the packaged app resources.
- Finder-launched apps do not inherit your shell environment, so the packaged app reads that bundled JSON instead of `.env`.
- Only the public `GOOGLE_CLIENT_ID` is bundled. User tokens still live in macOS Keychain.

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
