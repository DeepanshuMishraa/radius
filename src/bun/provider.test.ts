import { describe, expect, test } from "bun:test";
import { registerProvider, getProvider, removeProvider, clearProviders } from "./provider";
import type { EmailProvider, FetchedMessage } from "./provider";

class MockProvider implements EmailProvider {
  readonly type = "imap" as const;
  readonly email: string;

  constructor(email: string) {
    this.email = email;
  }

  async authenticate() {}
  async listMessages() { return {}; }
  async getMessage(id: string): Promise<FetchedMessage> {
    return {
      id, threadId: id, internalDate: "1000", snippet: "",
      from: "", to: "", subject: "", bodyText: null, bodyHtml: null,
      attachments: [], isRead: true, isInbox: true, isSent: false,
      isDraft: false, isTrash: false, category: "regular",
    };
  }
  async getMessageMetadata(id: string) { return this.getMessage(id); }
  async getHistory() { return {}; }
  async markAsRead(_id: string) {}
  async trashMessage(_id: string) {}
  async deleteMessage(_id: string) {}
  async getAttachment() { return ""; }
  async extractBodies(msg: FetchedMessage) {
    return { text: msg.bodyText, html: msg.bodyHtml, attachments: msg.attachments };
  }
}

describe("provider registry", () => {
  test("registers and retrieves a provider", () => {
    const provider = new MockProvider("test@example.com");
    registerProvider("test@example.com", provider);
    expect(getProvider("test@example.com")).toBe(provider);
  });

  test("removes a provider", () => {
    const provider = new MockProvider("remove@example.com");
    registerProvider("remove@example.com", provider);
    removeProvider("remove@example.com");
    expect(getProvider("remove@example.com")).toBeUndefined();
  });

  test("clears all providers", () => {
    registerProvider("a@example.com", new MockProvider("a@example.com"));
    registerProvider("b@example.com", new MockProvider("b@example.com"));
    clearProviders();
    expect(getProvider("a@example.com")).toBeUndefined();
    expect(getProvider("b@example.com")).toBeUndefined();
  });
});
