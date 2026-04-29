import DOMPurify from "dompurify";
import type { Message } from "../hooks/useInbox";

interface ReaderViewProps {
  message: Message | null;
  onBack: () => void;
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

function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^"?([^"<]+)"?\s*(?:<([^>]+)>)?$/);
  if (match) {
    return { name: match[1].trim(), email: match[2]?.trim() || match[1].trim() };
  }
  return { name: from, email: from };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ReaderView({ message, onBack }: ReaderViewProps) {
  if (!message) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-radius-bg-primary">
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
        <p className="text-[12px] text-radius-text-muted">Select an email to read</p>
      </div>
    );
  }

  const sanitizedHtml = message.bodyHtml
    ? DOMPurify.sanitize(message.bodyHtml, {
        ALLOWED_TAGS: [
          "p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li",
          "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
          "img", "table", "thead", "tbody", "tr", "td", "th", "div", "span",
          "hr", "sup", "sub", "del", "ins", "mark",
        ],
        ALLOWED_ATTR: [
          "href", "src", "alt", "title", "class", "style", "width", "height",
          "colspan", "rowspan", "target", "rel",
        ],
      })
    : null;

  const sender = parseSender(message.from);

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary overflow-auto">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-radius-bg-primary border-b border-radius-border-subtle">
        <div className="max-w-[680px] mx-auto px-6 h-[42px] flex items-center">
          <button
            onClick={onBack}
            className="electrobun-webkit-app-region-no-drag inline-flex items-center gap-1.5 text-[12px] font-medium text-radius-text-secondary hover:text-radius-text-primary transition-colors duration-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-radius-accent focus-visible:ring-offset-2 focus-visible:ring-offset-radius-bg-primary rounded"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Inbox
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        <article className="max-w-[680px] mx-auto px-6 pt-10 pb-24">
          {/* Subject — tight display heading */}
          <h1 className="font-display text-[26px] font-semibold text-radius-text-primary leading-[1.1] -tracking-[0.5px] mb-8">
            {message.subject}
          </h1>

          {/* Sender meta */}
          <div className="flex items-center gap-3 mb-10 pb-8 border-b border-radius-border-subtle">
            <div className="w-9 h-9 rounded-2xl bg-radius-accent/8 flex items-center justify-center text-[11px] font-semibold text-radius-accent shrink-0">
              {getInitials(sender.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-radius-text-primary truncate">
                {sender.name}
              </p>
              <p className="text-[12px] text-radius-text-muted truncate">
                {sender.email}
              </p>
            </div>
            <time className="text-[12px] text-radius-text-muted shrink-0 font-mono tabular-nums">
              {formatFullDate(message.internalDate)}
            </time>
          </div>

          {/* Body — generous reading typography */}
          {sanitizedHtml ? (
            <div
              className="email-body font-serif text-[17px] leading-[1.75] text-radius-text-primary"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <div className="font-serif text-[17px] leading-[1.75] text-radius-text-primary whitespace-pre-wrap">
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
          color: var(--radius-text-secondary, #5C5C5C);
          font-style: italic;
        }
        .email-body ul, .email-body ol { margin: 1em 0; padding-left: 1.5em; }
        .email-body li { margin-bottom: 0.35em; }
        .email-body h1, .email-body h2, .email-body h3,
        .email-body h4, .email-body h5, .email-body h6 {
          font-family: 'Instrument Sans', system-ui, sans-serif;
          font-weight: 600;
          color: var(--radius-text-primary, #1A1A1A);
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
          font-family: 'Instrument Sans', system-ui, sans-serif;
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
