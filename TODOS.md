# Radius Todos

## v1 — Full App (Backend + UI)

### Design & Planning
- [x] Product design doc: `DESIGN.md` (architecture, schema, IPC, error handling)
- [x] Engineering review: `ENG_REVIEW.md` (architecture review, failure modes, decisions)
- [x] Design system: `productDesign.md` (colors, typography, spacing, components)

### Backend — Sync Engine
- [ ] OAuth PKCE spike: verify BrowserWindow can capture redirect to localhost
- [ ] Implement `src/bun/auth.ts`: PKCE flow, token storage in macOS Keychain via `security` CLI
- [ ] Implement `src/bun/db.ts`: SQLite schema (messages + sync_state), WAL mode, queries
- [ ] Implement `src/bun/gmail.ts`: messages.list, messages.get, history.list, base64 decode
- [ ] Implement `src/bun/sync.ts`: full sync (non-resumable), incremental sync, error handling
- [ ] Implement `src/bun/types.ts`: Shared RPC types for `defineRPC`
- [ ] Wire RPC handlers in BrowserWindow creation (Bun side)
- [ ] Wire RPC client in renderer (Electroview side)

### Frontend — UI
- [ ] Install dependencies: `bun add dompurify @tanstack/react-virtual` + fonts
- [ ] Configure Tailwind v4 theme with Radius design tokens (colors, fonts, spacing)
- [ ] Implement `<Onboarding />`: single-screen OAuth, "read-only" disclosure, calm layout
- [ ] Implement `<SyncProgress />`: progress bar, "this only happens once" messaging
- [ ] Implement `<InboxList />`: virtualized list (TanStack Virtual), single-line rows
- [ ] Implement `<EmailRow />`: sender + subject + date, unread state, selection state
- [ ] Implement `<ReaderView />`: 680px centered column, Newsreader serif, sanitized HTML
- [ ] Implement `<NewMailIndicator />`: subtle notification for new mail
- [ ] App shell: routing between onboarding → sync → inbox → reader

### Integration & Polish
- [ ] Manual integration test: open app → auth → sync → browse inbox → read email
- [ ] Verify app opens to cached inbox instantly (<100ms cold start after first sync)
- [ ] Verify incremental sync catches new emails within 60s
- [ ] Performance check: 1,000+ emails scroll at 60fps
- [ ] Accessibility check: focus states, keyboard navigation, screen reader labels

## v2 — Features & Polish
- [ ] Compose + send (expands from read-only)
- [ ] Multi-account support
- [ ] Full-text search (SQLite FTS5)
- [ ] Dark mode toggle (warm dark palette per productDesign.md)
- [ ] Thread/conversation grouping
- [ ] Resumable sync (checkpoint page tokens in sync_state)
- [ ] Gmail batch endpoint optimization
- [ ] Add tests: auth + sync + db pipeline (bun test)
- [ ] Add tests: UI components (React Testing Library or similar)

## v3+ — Platform & Scale
- [ ] IMAP support (beyond Gmail)
- [ ] Non-macOS platforms (Linux via secret-tool, Windows via Credential Manager)
- [ ] CI/CD: GitHub Actions for build + release
- [ ] Auto-updater via Electrobun's built-in update mechanism

## Known Risks
- **OAuth redirect capture:** Unverified in Electrobun BrowserWindow. Highest-risk unknown.
- **`bun:sqlite` blocking:** Synchronous API may cause UI freezes during full sync. Mitigation: `Bun.sleep(0)` between batches.
- **DOMPurify in Bun:** Unverified in Bun runtime. Fallback: `isomorphic-dompurify`.
- **Zero tests in v1:** Manual verification only. Add automated tests in v2.
- **Font loading:** Satoshi may need self-hosting. Verify CDN availability before shipping.
