import { useState, useCallback, useRef, useEffect } from "react";
import { radiusRpc } from "../lib/rpc";

const DEFAULT_PERSONAL_AVATAR = "https://github.com/shadcn.png";

// Known email wrapper domains that map to a different brand domain
const DOMAIN_ALIASES: Record<string, string> = {
  "redditmail.com": "reddit.com",
  "pinterestmail.com": "pinterest.com",
  "quoramail.com": "quora.com",
  "facebookmail.com": "facebook.com",
  "instagram.com": "instagram.com",
  "twitter.com": "twitter.com",
  "x.com": "x.com",
  "substack.com": "substack.com",
  "ghost.io": "ghost.io",
  "bounces.google.com": "google.com",
  "amazonses.com": "amazon.com",
};

// Personal email providers — always use the default personal avatar
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "aol.com",
  "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me",
  "zoho.com", "yandex.com", "mail.com", "gmx.com", "gmx.de",
  "fastmail.com", "tutanota.com", "hey.com",
]);

function resolveDomainAlias(domain: string): string {
  return DOMAIN_ALIASES[domain] ?? domain;
}

function getBaseDomain(domain: string): string {
  const aliased = resolveDomainAlias(domain);
  if (aliased !== domain) return aliased;
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

export function isPersonalDomain(email: string): boolean {
  const domain = extractDomain(email);
  if (!domain) return false;
  return PERSONAL_DOMAINS.has(domain);
}

// Module-level cache — survives component re-mounts, shared across all instances
const globalCache = new Map<string, string | null>();
const pendingDomains = new Set<string>();
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
    if (!domain) return null;

    // Personal emails always show the default avatar
    if (PERSONAL_DOMAINS.has(domain)) {
      return DEFAULT_PERSONAL_AVATAR;
    }

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

    preloadAllAvatars().then(() => {
      requestDomains(domains).then(() => {
        forceUpdate(c => c + 1);
      });
    });
  }, [emails]);

  return { getAvatarUrl };
}
