import { describe, expect, test } from "bun:test";
import { makeMessageId, parseMessageId } from "./imap-provider";
import { decodeRfc2047, formatAddress, formatAddresses, detectFolderKind } from "./imap";
import type { ImapFolder } from "./imap";

describe("makeMessageId / parseMessageId", () => {
  test("round-trips email, folder kind, and uid", () => {
    const id = makeMessageId("user@org.com", "inbox", 42);
    expect(id).toBe("imap:user@org.com:inbox:42");
    const parsed = parseMessageId(id);
    expect(parsed).toEqual({ email: "user@org.com", folderKind: "inbox", uid: 42 });
  });

  test("handles old format without folder kind", () => {
    const parsed = parseMessageId("imap:user@org.com:42");
    expect(parsed).toEqual({ email: "user@org.com", folderKind: "inbox", uid: 42 });
  });

  test("parseMessageId returns null for invalid format", () => {
    expect(parseMessageId("invalid")).toBeNull();
    expect(parseMessageId("imap:no-uid")).toBeNull();
    expect(parseMessageId("imap:a:b:c:d:e")).toBeNull();
    expect(parseMessageId("imap::inbox:42")).toBeNull();
    expect(parseMessageId("imap:user@org.com:inbox:not-a-number")).toBeNull();
  });
});

describe("decodeRfc2047", () => {
  test("decodes base64 encoded subject", () => {
    const encoded = "=?utf-8?B?SGVsbG8gV29ybGQ=?=";
    expect(decodeRfc2047(encoded)).toBe("Hello World");
  });

  test("decodes Q-encoded subject", () => {
    const encoded = "=?utf-8?Q?H=C3=A9llo?=";
    expect(decodeRfc2047(encoded)).toBe("Héllo");
  });

  test("passes through plain text", () => {
    expect(decodeRfc2047("Hello World")).toBe("Hello World");
  });
});

describe("formatAddress", () => {
  test("formats with name", () => {
    expect(formatAddress({ name: "John", address: "john@test.com" })).toBe("John <john@test.com>");
  });

  test("formats without name", () => {
    expect(formatAddress({ address: "john@test.com" })).toBe("john@test.com");
  });
});

describe("formatAddresses", () => {
  test("joins multiple addresses", () => {
    const result = formatAddresses([
      { name: "Alice", address: "alice@test.com" },
      { name: "Bob", address: "bob@test.com" },
    ]);
    expect(result).toBe("Alice <alice@test.com>, Bob <bob@test.com>");
  });
});

describe("detectFolderKind", () => {
  function makeFolder(overrides: Partial<ImapFolder>): ImapFolder {
    return {
      path: "INBOX",
      delimiter: "/",
      flags: [],
      specialUse: null,
      listed: true,
      subscribed: true,
      name: "INBOX",
      ...overrides,
    };
  }

  test("detects inbox by special use", () => {
    expect(detectFolderKind(makeFolder({ specialUse: "\\Inbox", name: "INBOX" }))).toBe("inbox");
  });

  test("detects inbox by name", () => {
    expect(detectFolderKind(makeFolder({ name: "INBOX" }))).toBe("inbox");
  });

  test("detects sent by name", () => {
    expect(detectFolderKind(makeFolder({ name: "Sent" }))).toBe("sent");
    expect(detectFolderKind(makeFolder({ name: "Sent Items" }))).toBe("sent");
  });

  test("detects drafts by name", () => {
    expect(detectFolderKind(makeFolder({ name: "Drafts" }))).toBe("drafts");
  });

  test("detects trash by name", () => {
    expect(detectFolderKind(makeFolder({ name: "Trash" }))).toBe("trash");
    expect(detectFolderKind(makeFolder({ name: "Deleted Items" }))).toBe("trash");
  });

  test("detects spam by name", () => {
    expect(detectFolderKind(makeFolder({ name: "Spam" }))).toBe("spam");
    expect(detectFolderKind(makeFolder({ name: "Junk" }))).toBe("spam");
  });

  test("falls back to custom for unknown folders", () => {
    expect(detectFolderKind(makeFolder({ name: "Custom Folder" }))).toBe("custom");
  });
});
