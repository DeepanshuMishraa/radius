import DOMPurify from "dompurify";
import type { Message } from "../hooks/useInbox";
import { ListIcon } from "@phosphor-icons/react";

interface ReaderViewProps {
  message: Message | null;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseAddress(addr: string | null | undefined): {
  name: string;
  email: string;
} {
  if (!addr) return { name: "", email: "" };
  const match = addr.match(/^"?([^"<]+)"?\s*(?:<([^>]+)>)?$/);
  if (match) {
    return {
      name: match[1].trim(),
      email: match[2]?.trim() || match[1].trim(),
    };
  }
  return { name: addr, email: addr };
}

function InboxWidget({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="
        electrobun-webkit-app-region-no-drag
        fixed top-[42px] left-4 z-30
        p-2
        rounded-lg
        text-radius-text-muted
        hover:text-radius-text-secondary
        transition-colors duration-150 ease-out
        active:scale-[0.98]
      "
      title="Open inbox"
    >
      <ListIcon size={20} />
    </button>
  );
}

export function ReaderView({
  message,
  sidebarOpen,
  onOpenSidebar,
}: ReaderViewProps) {
  if (!message) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-radius-bg-primary relative pt-9">
        <InboxWidget visible={!sidebarOpen} onClick={onOpenSidebar} />
        <div className="w-10 h-10 rounded-2xl border border-radius-border-subtle flex items-center justify-center mb-4">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-radius-text-muted"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <p className="text-[12px] text-radius-text-muted font-[family-name:var(--font-family-serif)]">
          Select an email to read
        </p>
      </div>
    );
  }

  const sanitizedHtml = message.bodyHtml
    ? DOMPurify.sanitize(message.bodyHtml, {
        ALLOWED_TAGS: [
          "p",
          "br",
          "strong",
          "b",
          "em",
          "i",
          "u",
          "a",
          "ul",
          "ol",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "blockquote",
          "pre",
          "code",
          "img",
          "table",
          "thead",
          "tbody",
          "tr",
          "td",
          "th",
          "div",
          "span",
          "hr",
          "sup",
          "sub",
          "del",
          "ins",
          "mark",
        ],
        ALLOWED_ATTR: [
          "href",
          "src",
          "alt",
          "title",
          "class",
          "style",
          "width",
          "height",
          "colspan",
          "rowspan",
          "target",
          "rel",
        ],
      })
    : null;

  const sender = parseAddress(message.from);
  const recipient = parseAddress(message.to);

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary overflow-auto relative pt-9">
      {/* Minimal inbox widget — appears when sidebar is hidden */}
      <InboxWidget visible={!sidebarOpen} onClick={onOpenSidebar} />

      {/* Content */}
      <div className="flex-1 email-enter" key={message.id}>
        <article className="max-w-[720px] mx-auto px-6 pt-8 pb-24">
          {/* Subject — large display heading in Lora */}
          <h1 className="font-[family-name:var(--font-family-serif)] text-[32px] font-semibold text-radius-text-primary leading-[1.1] tracking-[-0.02em] mb-10">
            {message.subject}
          </h1>

          {/* Metadata: From / To — all Lora */}
          <div className="mb-10 pb-8 border-b border-radius-border-subtle space-y-2">
            <div className="flex items-baseline gap-6">
              <span className="text-[13px] text-radius-text-muted w-8 shrink-0 font-[family-name:var(--font-family-serif)]">
                From
              </span>
              <span className="text-[14px] text-radius-text-primary font-[family-name:var(--font-family-serif)]">
                {sender.name}
              </span>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-[13px] text-radius-text-muted w-8 shrink-0 font-[family-name:var(--font-family-serif)]">
                To
              </span>
              <span className="text-[14px] text-radius-text-primary font-[family-name:var(--font-family-serif)]">
                {recipient.name}
              </span>
            </div>
            <div className="flex items-baseline gap-6 pt-1">
              <span className="text-[13px] text-radius-text-muted w-8 shrink-0 font-[family-name:var(--font-family-serif)]"></span>
              <time className="text-[12px] text-radius-text-muted font-[family-name:var(--font-family-serif)]">
                {formatFullDate(message.internalDate)}
              </time>
            </div>
          </div>

          {/* Body — Lora serif */}
          {sanitizedHtml ? (
            <div
              className="email-body font-[family-name:var(--font-family-serif)] text-[17px] leading-[1.75] text-radius-text-primary"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <div className="font-[family-name:var(--font-family-serif)] text-[17px] leading-[1.75] text-radius-text-primary whitespace-pre-wrap">
              {message.bodyText || message.snippet}
            </div>
          )}
        </article>
      </div>

      <style>{`
        .email-body p { margin-bottom: 1em; }
        .email-body p:last-child { margin-bottom: 0; }
        .email-body a {
          color: var(--radius-accent, #C4785A);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .email-body a:hover { color: var(--radius-accent-hover, #B56A4D); }
        .email-body blockquote {
          border-left: 2px solid var(--radius-border, #D5D0C9);
          margin: 1.25em 0;
          padding: 0.25em 0 0.25em 1em;
          color: var(--radius-text-secondary, #5C5A57);
          font-style: italic;
        }
        .email-body ul, .email-body ol { margin: 1em 0; padding-left: 1.5em; }
        .email-body li { margin-bottom: 0.35em; }
        .email-body h1, .email-body h2, .email-body h3,
        .email-body h4, .email-body h5, .email-body h6 {
          font-family: var(--font-family-sans), system-ui, sans-serif;
          font-weight: 600;
          color: var(--radius-text-primary, #292827);
          margin: 1.5em 0 0.75em;
          line-height: 1.2;
        }
        .email-body h1 { font-size: 1.4em; }
        .email-body h2 { font-size: 1.25em; }
        .email-body h3 { font-size: 1.1em; }
        .email-body img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 1em 0;
        }
        .email-body pre {
          background: var(--radius-bg-secondary, #F7F6F3);
          padding: 1em;
          border-radius: 8px;
          overflow-x: auto;
          font-size: 0.85em;
          line-height: 1.5;
          margin: 1em 0;
        }
        .email-body code {
          background: var(--radius-bg-secondary, #F7F6F3);
          padding: 0.15em 0.4em;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .email-body pre code { background: none; padding: 0; }
        .email-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
          font-size: 0.95em;
        }
        .email-body th, .email-body td {
          padding: 0.5em 0.75em;
          border: 1px solid var(--radius-border-subtle, #E5E0D9);
          text-align: left;
        }
        .email-body th {
          background: var(--radius-bg-secondary, #F7F6F3);
          font-weight: 600;
          font-family: var(--font-family-sans), system-ui, sans-serif;
        }
        .email-body hr {
          border: none;
          border-top: 1px solid var(--radius-border-subtle, #E5E0D9);
          margin: 1.5em 0;
        }
      `}</style>
    </div>
  );
}
