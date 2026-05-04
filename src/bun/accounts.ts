import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const DB_DIR = join(homedir(), "Library", "Application Support", "Radius");
const ACCOUNTS_FILE = join(DB_DIR, "accounts.json");

export interface Account {
  email: string;
  name: string;
  addedAt: number;
}

interface AccountsData {
  activeAccount: string | null;
  accounts: Account[];
}

async function readAccounts(): Promise<AccountsData> {
  try {
    const raw = await readFile(ACCOUNTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AccountsData;
    return {
      activeAccount: parsed.activeAccount ?? null,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    };
  } catch {
    return { activeAccount: null, accounts: [] };
  }
}

async function writeAccounts(data: AccountsData): Promise<void> {
  await writeFile(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
}

export async function getAccounts(): Promise<Account[]> {
  const data = await readAccounts();
  return data.accounts;
}

export async function getActiveAccount(): Promise<string | null> {
  const data = await readAccounts();
  return data.activeAccount;
}

export async function setActiveAccount(email: string | null): Promise<void> {
  const data = await readAccounts();
  data.activeAccount = email;
  await writeAccounts(data);
}

export async function addAccount(account: Account): Promise<void> {
  const data = await readAccounts();
  const existing = data.accounts.find((a) => a.email === account.email);
  if (!existing) {
    data.accounts.push(account);
    await writeAccounts(data);
  }
}

export async function removeAccount(email: string): Promise<void> {
  const data = await readAccounts();
  data.accounts = data.accounts.filter((a) => a.email !== email);
  if (data.activeAccount === email) {
    data.activeAccount = data.accounts[0]?.email ?? null;
  }
  await writeAccounts(data);
}
