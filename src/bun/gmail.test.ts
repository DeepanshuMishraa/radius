import { describe, expect, test } from "bun:test";
import { buildRawEmail } from "./gmail";

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

describe("buildRawEmail", () => {
  test("builds multipart MIME with attachments", () => {
    const raw = buildRawEmail({
      from: "sender@example.com",
      to: ["person@example.com"],
      subject: "Quarterly update",
      bodyText: "Hello world",
      attachments: [
        {
          filename: "report.pdf",
          mimeType: "application/pdf",
          dataBase64: Buffer.from("pdf-data").toString("base64"),
        },
      ],
    });

    const decoded = decodeBase64Url(raw);
    expect(decoded).toContain("Content-Type: multipart/mixed;");
    expect(decoded).toContain("Content-Type: multipart/alternative;");
    expect(decoded).toContain('Content-Disposition: attachment; filename="report.pdf"');
    expect(decoded).toContain(Buffer.from("pdf-data").toString("base64"));
  });

  test("neutralizes header injection attempts", () => {
    const raw = buildRawEmail({
      from: "sender@example.com",
      to: ["person@example.com"],
      subject: "hello\r\nBcc: attacker@example.com",
      bodyText: "Hi there",
    });

    const decoded = decodeBase64Url(raw);
    expect(decoded).toContain("Subject: hello Bcc: attacker@example.com");
    expect(decoded).not.toContain("\r\nBcc: attacker@example.com\r\n");
  });
});
