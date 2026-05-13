import { useState, useCallback, useRef, useEffect } from "react";
import { radiusRpc } from "../lib/rpc";

// Personal email providers where Clearbit won't have a meaningful logo
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "aol.com",
  "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me",
  "zoho.com", "yandex.com", "mail.com", "gmx.com", "gmx.de",
  "fastmail.com", "tutanota.com", "hey.com",
]);

function getBaseDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  if (['co', 'com', 'org', 'net'].includes(parts[parts.length - 2])) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function extractDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0) return null;
  return getBaseDomain(email.slice(at + 1).toLowerCase());
}

// Module-level cache — survives component re-mounts, shared across all instances
const globalCache = new Map<string, string | null>();
const pendingDomains = new Set<string>();
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let batchResolvers: Array<() => void> = [];

function flushBatch() {
  const domains = [...pendingDomains];
  pendingDomains.clear();
  const resolvers = [...batchResolvers];
  batchResolvers = [];
  batchTimeout = null;

  if (domains.length === 0) {
    resolvers.forEach(r => r());
    return;
  }

  radiusRpc.request
    .getSenderAvatars({ domains })
    .then((result) => {
      for (const [domain, url] of Object.entries(result.avatars)) {
        globalCache.set(domain, url);
      }
    })
    .catch((err: unknown) => {
      console.error("Failed to fetch sender avatars:", err);
      // Mark as failed so we don't retry immediately
      for (const domain of domains) {
        if (!globalCache.has(domain)) {
          globalCache.set(domain, null);
        }
      }
    })
    .finally(() => {
      resolvers.forEach(r => r());
    });
}

function requestDomains(domains: string[]): Promise<void> {
  let added = false;
  for (const domain of domains) {
    if (!globalCache.has(domain) && !pendingDomains.has(domain) && !PERSONAL_DOMAINS.has(domain)) {
      pendingDomains.add(domain);
      added = true;
    }
  }

  if (!added) return Promise.resolve();

  return new Promise<void>((resolve) => {
    batchResolvers.push(resolve);
    if (batchTimeout) clearTimeout(batchTimeout);
    // Debounce 50ms to batch multiple components requesting at once
    batchTimeout = setTimeout(flushBatch, 50);
  });
}

/**
 * Hook that provides cached avatar URLs for email senders.
 * Uses a global in-memory cache backed by SQLite on the backend.
 * Returns a function that maps email -> avatar URL | null.
 */
export function useAvatarCache(emails: string[]) {
  const [, forceUpdate] = useState(0);
  const prevEmailsRef = useRef<string>("");

  const getAvatarUrl = useCallback((email: string): string | null => {
    const domain = extractDomain(email);
    if (!domain || PERSONAL_DOMAINS.has(domain)) return null;
    return globalCache.get(domain) ?? null;
  }, []);

  useEffect(() => {
    const domains: string[] = [];
    for (const email of emails) {
      const domain = extractDomain(email);
      if (domain && !PERSONAL_DOMAINS.has(domain) && !globalCache.has(domain)) {
        domains.push(domain);
      }
    }

    // Check if we actually have new domains to fetch
    const key = domains.sort().join(",");
    if (key === prevEmailsRef.current || domains.length === 0) return;
    prevEmailsRef.current = key;

    requestDomains(domains).then(() => {
      forceUpdate(c => c + 1);
    });
  }, [emails]);

  return { getAvatarUrl };
}
