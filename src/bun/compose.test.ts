import { describe, expect, test } from "bun:test";
import type { ComposeSession } from "../shared/types";
import { __internal } from "./compose";

function makeSession(overrides: Partial<ComposeSession> = {}): ComposeSession {
  return {
    id: "session-1",
    from: "sender@example.com",
    to: ["person@example.com"],
    cc: [],
    bcc: [],
    subject: "Hello",
    bodyText: "Body",
    attachments: [],
    mode: "compose",
    fixedRecipients: false,
    threadId: null,
    replyToMessageId: null,
    replyReferences: [],
    originalMessageId: null,
    gmailDraftId: null,
    gmailMessageId: null,
    status: "editing",
    dirty: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSavedAt: null,
    ...overrides,
  };
}

describe("compose helpers", () => {
  test("rejects invalid recipients", () => {
    const result = __internal.validateSessionForRemote(
      makeSession({ to: ["bad-address"] }),
    );
    expect(result).toBe("Invalid recipient: bad-address");
  });

  test("rejects oversized attachments", () => {
    const result = __internal.validateSessionForRemote(
      makeSession({
        attachments: [
          {
            id: "att-1",
            type: "file",
            name: "large.zip",
            size: 11 * 1024 * 1024,
            mimeType: "application/zip",
            dataBase64: "ZGF0YQ==",
          },
        ],
      }),
    );
    expect(result).toContain("too large");
  });

  test("appends link attachments into body text", () => {
    const result = __internal.appendLinksToBody("Notes", [
      {
        id: "link-1",
        type: "link",
        name: "example.com",
        url: "https://example.com",
      },
    ]);

    expect(result).toContain("Notes");
    expect(result).toContain("https://example.com");
  });
});
