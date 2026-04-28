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

export function ReaderView({ message, onBack }: ReaderViewProps) {
  if (!message) {
    return (
      <div className="flex items-center justify-center h-full bg-radius-bg-primary">
        <p className="text-sm text-radius-text-muted">
          Select an email to read
        </p>
      </div>
    );
  }

  // Sanitize HTML body
  const sanitizedHtml = message.bodyHtml
    ? DOMPurify.sanitize(message.bodyHtml, {
        ALLOWED_TAGS: [
          "p",
          "br",
          "strong",
          "em",
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
        ],
      })
    : null;

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary overflow-auto">
      {/* Back button */}
      <div className="sticky top-0 bg-radius-bg-primary/95 backdrop-blur-sm z-10 px-6 py-3 border-b border-radius-border-subtle">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-radius-text-secondary hover:text-radius-text-primary transition-colors duration-80"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Inbox
        </button>
      </div>

      {/* Email content */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-[680px] mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-radius-text-primary mb-3 leading-snug">
              {message.subject}
            </h1>

            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-radius-bg-tertiary flex items-center justify-center text-xs font-medium text-radius-text-secondary">
                {message.from.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-radius-text-primary truncate">
                  {message.from.split("<")[0].trim() || message.from}
                </p>
                <p className="text-xs text-radius-text-muted">
                  {formatFullDate(message.internalDate)}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="font-serif text-[15px] leading-[1.7] text-radius-text-primary">
            {sanitizedHtml ? (
              <div
                className="prose prose-stone max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            ) : (
              <p className="whitespace-pre-wrap">{message.bodyText || message.snippet}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
