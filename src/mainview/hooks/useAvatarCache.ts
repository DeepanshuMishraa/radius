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
// Keys can be either domain (company logos) or lowercase email (Gravatar)
const globalCache = new Map<string, string | null>();
const pendingDomains = new Set<string>();
const pendingEmails = new Set<string>();
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let batchResolvers: Array<() => void> = [];
let preloadPromise: Promise<void> | null = null;

function preloadAllAvatars(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = radiusRpc.request
    .getAllSenderAvatars({})
    .then((result) => {
      for (const [key, url] of Object.entries(result.avatars)) {
        if (!globalCache.has(key)) {
          globalCache.set(key, url);
        }
      }
    })
    .catch((err: unknown) => {
      console.error("Failed to preload sender avatars:", err);
    });
  return preloadPromise;
}

// Eagerly preload all stored avatars as soon as the module loads
preloadAllAvatars();

function flushBatch() {
  const domains = [...pendingDomains];
  const emails = [...pendingEmails];
  pendingDomains.clear();
  pendingEmails.clear();
  const resolvers = [...batchResolvers];
  batchResolvers = [];
  batchTimeout = null;

  if (domains.length === 0 && emails.length === 0) {
    resolvers.forEach(r => r());
    return;
  }

  radiusRpc.request
    .getSenderAvatars({ domains, emails })
    .then((result) => {
      for (const [key, url] of Object.entries(result.avatars)) {
        globalCache.set(key, url);
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
      for (const email of emails) {
        if (!globalCache.has(email)) {
          globalCache.set(email, null);
        }
      }
    })
    .finally(() => {
      resolvers.forEach(r => r());
    });
}

function requestBatch(domains: string[], emails: string[]): Promise<void> {
  let added = false;
  for (const domain of domains) {
    if (!globalCache.has(domain) && !pendingDomains.has(domain) && !PERSONAL_DOMAINS.has(domain)) {
      pendingDomains.add(domain);
      added = true;
    }
  }
  for (const email of emails) {
    if (!globalCache.has(email) && !pendingEmails.has(email)) {
      pendingEmails.add(email);
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
    const normalized = email.trim().toLowerCase();
    // Check email-specific cache first (Gravatar for personal domains)
    const emailCached = globalCache.get(normalized);
    if (emailCached !== undefined) return emailCached;

    const domain = extractDomain(email);
    if (!domain) return null;
    return globalCache.get(domain) ?? null;
  }, []);

  useEffect(() => {
    const domains: string[] = [];
    const personalEmails: string[] = [];

    for (const email of emails) {
      const domain = extractDomain(email);
      if (!domain) continue;
      const normalized = email.trim().toLowerCase();
      if (PERSONAL_DOMAINS.has(domain)) {
        if (!globalCache.has(normalized)) {
          personalEmails.push(normalized);
        }
      } else {
        if (!globalCache.has(domain)) {
          domains.push(domain);
        }
      }
    }

    // Check if we actually have new items to fetch
    const key = [...domains, ...personalEmails].sort().join(",");
    if (key === prevEmailsRef.current || (domains.length === 0 && personalEmails.length === 0)) return;
    prevEmailsRef.current = key;

    preloadAllAvatars().then(() => {
      requestBatch(domains, personalEmails).then(() => {
        forceUpdate(c => c + 1);
      });
    });
  }, [emails]);

  return { getAvatarUrl };
}
