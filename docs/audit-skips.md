# Skipped Audit Findings

This document records audit findings that were intentionally skipped during review, with the reasoning and what would be required to address them in the future.

---

## 1. Public suffix library for `getBaseDomain`

**File:** `src/bun/rpc-handlers.ts`, `src/mainview/hooks/useAvatarCache.ts`  
**Finding:** The `getBaseDomain` function uses a tiny hardcoded second-level domain list (`co`, `com`, `org`, `net`) which misses many public suffix edge cases (e.g., `.gov.uk`, `.com.br`, `.net.au`, `.co.jp`). This means domains like `police.gov.uk` or `example.com.br` may extract the wrong base domain, causing missed logo lookups or wrong cache keys.

**Why skipped:** Requires adding a new runtime dependency (e.g., [`tldts`](https://github.com/remusao/tldts) or [`psl`](https://github.com/lupomontero/psl)). The current heuristic covers the overwhelming majority of email sender domains in practice. Edge cases like `.gov.uk` are extremely rare in typical email inboxes.

**What would be needed:**
1. Add `tldts` (or equivalent) as a dependency.
2. Replace the `getBaseDomain` heuristic with `tldts.getDomain(domain)`.
3. Ensure `resolveDomainAlias` is still applied *before* the public-suffix lookup so aliases like `redditmail.com` → `reddit.com` continue to work.
4. Verify performance: public-suffix parsing is fast but involves loading a ~200KB suffix list; consider caching the parsed result.

---

## 2. Staleness window for confirmed "no logo" entries

**File:** `src/bun/rpc-handlers.ts`  
**Finding:** When a domain has no logo on either Hunter.io or Unavatar, the backend stores `null` in the `sender_avatars` table. On the next request, that `null` is treated as "missing" and the domain is re-fetched. For a large inbox with many senders that genuinely have no logo, this causes a refetch storm on every app open.

**Why skipped:** Requires changing the return shape of `getSenderAvatarsBatch` from `Record<string, string | null>` to something like `Record<string, { url: string | null; fetchedAt: number | null }>`, updating the DB query, the `sender_avatars` table schema, and every caller. This is a non-trivial schema change across both frontend and backend.

**What would be needed:**
1. Add a `fetched_at INTEGER` column to `sender_avatars` (migration for existing installs).
2. Update `getSenderAvatarsBatch` to return `{ url, fetchedAt }` objects.
3. Update `handleGetSenderAvatars` to skip re-fetching when `url == null && fetchedAt > now - STALE_WINDOW`.
4. Define `STALE_WINDOW` (suggested: 7 days in milliseconds).
5. Update `getAllSenderAvatars` and any frontend callers that depend on the current flat `Record<string, string | null>` shape.
6. Consider adding a manual "refresh avatars" action for users who want to force a re-check.
