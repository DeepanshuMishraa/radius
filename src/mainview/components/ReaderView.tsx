import DOMPurify from "dompurify";
import { memo, useCallback, useMemo } from "react";
import type { MouseEvent } from "react";
import type { Message } from "../hooks/useInbox";
import { ListIcon } from "@phosphor-icons/react";
import { radiusRpc } from "../lib/rpc";

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
      <ListIcon size={16} />
    </button>
  );
}

// Comprehensive allowlists for email HTML — tables, inline styles, images,
// alignment attributes, and common legacy email markup.
const EMAIL_ALLOWED_TAGS = [
  // Document structure
  "html", "head", "body", "meta", "title", "link", "style",
  // Typography
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del", "ins",
  "mark", "small", "big", "sub", "sup", "span", "font", "center",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "code", "cite", "dfn", "abbr", "address",
  // Lists
  "ul", "ol", "li", "dl", "dt", "dd",
  // Links
  "a",
  // Media
  "img", "figure", "figcaption", "picture", "source", "video", "audio",
  "track", "area", "map",
  // Tables
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "colgroup", "col",
  // Layout / legacy
  "div", "hr", "wbr", "noscript",
];

const EMAIL_ALLOWED_ATTR = [
  // Core
  "href", "src", "alt", "title", "class", "id", "name",
  // Inline styles
  "style",
  // Dimensions
  "width", "height",
  // Table legacy
  "border", "cellpadding", "cellspacing", "colspan", "rowspan", "scope",
  // Alignment legacy
  "align", "valign", "bgcolor", "background",
  // Text direction / lang
  "dir", "lang", "xml:lang", "xmlns",
  // Font legacy
  "face", "size", "color",
  // Media
  "controls", "autoplay", "loop", "muted", "preload", "poster",
  "srcset", "sizes", "media", "type",
  // Links
  "target", "rel", "download",
  // Lists
  "start", "type", "value",
  // Images / maps
  "usemap", "shape", "coords",
  // Meta / link
  "charset", "http-equiv", "content",
];

const EMAIL_BODY_STYLES = `
  .email-body {
    font-family: var(--font-family-sans), system-ui, -apple-system, sans-serif;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .email-body * {
    max-width: 100%;
    box-sizing: border-box;
  }
  .email-body p { margin: 0 0 1em; }
  .email-body p:last-child { margin-bottom: 0; }
  .email-body br { display: block; content: ""; margin-bottom: 0.3em; }
  .email-body a {
    color: var(--radius-accent, #C4785A);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .email-body a:hover { color: var(--radius-accent-hover, #B56A4D); }
  .email-body h1, .email-body h2, .email-body h3,
  .email-body h4, .email-body h5, .email-body h6 {
    font-family: var(--font-family-sans), system-ui, sans-serif;
    font-weight: 600;
    color: var(--radius-text-primary, #292827);
    margin: 1.5em 0 0.6em;
    line-height: 1.25;
  }
  .email-body h1 { font-size: 1.5em; }
  .email-body h2 { font-size: 1.3em; }
  .email-body h3 { font-size: 1.15em; }
  .email-body h4 { font-size: 1.05em; }
  .email-body h5, .email-body h6 { font-size: 1em; }
  .email-body blockquote {
    border-left: 2px solid var(--radius-border, #D5D0C9);
    margin: 1.25em 0;
    padding: 0.25em 0 0.25em 1em;
    color: var(--radius-text-secondary, #5C5A57);
    font-style: italic;
  }
  .email-body ul, .email-body ol { margin: 1em 0; padding-left: 1.5em; }
  .email-body li { margin-bottom: 0.35em; }
  .email-body dl { margin: 1em 0; }
  .email-body dt { font-weight: 600; margin-top: 0.5em; }
  .email-body dd { margin-left: 1.5em; }
  .email-body img {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    display: inline-block;
  }
  .email-body figure { margin: 1em 0; }
  .email-body figcaption {
    font-size: 0.85em;
    color: var(--radius-text-muted, #8C8A87);
    text-align: center;
    margin-top: 0.3em;
  }
  .email-body video, .email-body audio {
    max-width: 100%;
    border-radius: 4px;
    margin: 1em 0;
  }
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
    vertical-align: top;
  }
  .email-body th {
    background: var(--radius-bg-secondary, #F7F6F3);
    font-weight: 600;
  }
  .email-body caption {
    font-weight: 600;
    margin-bottom: 0.5em;
    text-align: left;
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
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .email-body pre code { background: none; padding: 0; font-size: 1em; }
  .email-body hr {
    border: none;
    border-top: 1px solid var(--radius-border-subtle, #E5E0D9);
    margin: 1.5em 0;
  }
  .email-body center { text-align: center; display: block; }
  .email-body center table { margin-left: auto; margin-right: auto; }
  .email-body table[align="left"],
  .email-body table[align="right"] {
    max-width: 50%;
  }
  .email-body > table {
    table-layout: fixed;
  }
  .email-body table td img {
    max-width: 100%;
  }
`;

export const ReaderView = memo(function ReaderView({
  message,
  sidebarOpen,
  onOpenSidebar,
}: ReaderViewProps) {
  const handleBodyClick = useCallback(async (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;

    const rawHref = link.getAttribute("href");
    if (!rawHref) return;

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawHref, window.location.href).toString();
    } catch {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      const result = await radiusRpc.request.openExternalUrl({ url: resolvedUrl });
      if (!result.success) {
        console.error("Failed to open external URL:", result.error);
      }
    } catch (err) {
      console.error("Failed to open external URL:", err);
    }
  }, []);

  const rawHtml = message?.bodyHtml ?? null;

  const sanitizedHtml = useMemo(() => {
    if (!rawHtml) return null;

    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
      ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORCE_BODY: true,
    });
  }, [rawHtml]);

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

  const sender = parseAddress(message.from);
  const recipient = parseAddress(message.to);

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary overflow-auto relative pt-9">
      <InboxWidget visible={!sidebarOpen} onClick={onOpenSidebar} />

      <div className="flex-1 email-enter" key={message.id}>
        <article className="max-w-[720px] mx-auto px-6 pt-8 pb-24">
          {/* Subject */}
          <h1 className="font-[family-name:var(--font-family-serif)] text-[32px] font-semibold text-radius-text-primary leading-[1.1] tracking-wide mb-10">
            {message.subject}
          </h1>

          {/* Metadata */}
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

          {/* Body */}
          {sanitizedHtml ? (
            <div
              className="email-body text-[15px] leading-[1.7] text-radius-text-primary"
              onClick={handleBodyClick}
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <div className="font-[family-name:var(--font-family-serif)] text-[17px] leading-[1.75] text-radius-text-primary whitespace-pre-wrap">
              {message.bodyText || message.snippet}
            </div>
          )}
        </article>
      </div>

      <style>{EMAIL_BODY_STYLES}</style>
    </div>
  );
});
