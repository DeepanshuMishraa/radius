import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface OAuthConfig {
  clientId: string;
}

const REDIRECT_URI = "http://localhost:3333/oauth/callback";
const SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const BUNDLED_OAUTH_CONFIG_PATH = resolve(
  dirname(process.execPath),
  "..",
  "Resources",
  "oauth-config.json"
);
const DEV_OAUTH_CONFIG_PATH = resolve(process.cwd(), "build", "oauth-config.json");

let cachedOAuthConfig: OAuthConfig | null = null;

function getEnvOAuthConfig(): OAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return null;
  }
  return { clientId };
}

function readOAuthConfigFile(filePath: string): OAuthConfig | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as { clientId?: unknown };

  if (typeof parsed.clientId !== "string" || parsed.clientId.trim() === "") {
    throw new Error(`OAuth config file is missing clientId: ${filePath}`);
  }

  return { clientId: parsed.clientId.trim() };
}

function getOAuthConfig(): OAuthConfig {
  if (cachedOAuthConfig) {
    return cachedOAuthConfig;
  }

  const envConfig = getEnvOAuthConfig();
  if (envConfig) {
    cachedOAuthConfig = envConfig;
    return cachedOAuthConfig;
  }

  const bundledConfig =
    readOAuthConfigFile(BUNDLED_OAUTH_CONFIG_PATH) ??
    readOAuthConfigFile(DEV_OAUTH_CONFIG_PATH);
  if (bundledConfig) {
    cachedOAuthConfig = bundledConfig;
    return cachedOAuthConfig;
  }

  throw new Error(
    "Missing Google OAuth client ID. Set GOOGLE_CLIENT_ID in .env for dev, or create build/oauth-config.json with {\"clientId\":\"...\"} before packaging."
  );
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

let currentAccessToken: string | null = null;
let tokenExpiresAt = 0;

export function setTokens(tokens: TokenData): void {
  currentAccessToken = tokens.access_token;
  tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
}

export async function getValidAccessToken(): Promise<string> {
  if (currentAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return currentAccessToken;
  }

  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token found — please authenticate first");
  }

  const refreshed = await refreshAccessToken(refreshToken);
  currentAccessToken = refreshed.access_token;
  tokenExpiresAt = Date.now() + refreshed.expires_in * 1000;
  return currentAccessToken;
}

function base64URLEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(String.fromCharCode(...array));
}

async function sha256(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(String.fromCharCode(...new Uint8Array(hash)));
}

export function buildAuthURL(codeChallenge: string): string {
  const { clientId } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenData> {
  const { clientId } = getOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return (await res.json()) as TokenData;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const { clientId } = getOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return data;
}

// Keychain storage via macOS security CLI
export function storeRefreshToken(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("security", [
      "add-generic-password",
      "-a",
      "radius",
      "-s",
      "gmail-refresh-token",
      "-w",
      token,
      "-U",
    ]);

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`security add-generic-password exited ${code}`));
    });

    child.on("error", (err) => reject(err));
  });
}

export function getRefreshToken(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn("security", [
      "find-generic-password",
      "-a",
      "radius",
      "-s",
      "gmail-refresh-token",
      "-w",
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else if (stderr.includes("The specified item could not be found")) {
        resolve(null);
      } else {
        reject(new Error(`security find-generic-password: ${stderr}`));
      }
    });

    child.on("error", (err) => reject(err));
  });
}

export { generateCodeVerifier, sha256 };
