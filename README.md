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
GOOGLE_CLIENT_SECRET=your_client_secret
```

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
