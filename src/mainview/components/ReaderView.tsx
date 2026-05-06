import DOMPurify from "dompurify";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { Message, EmailCategory } from "../hooks/useInbox";
import { ListIcon, FileIcon, ArrowSquareOut } from "@phosphor-icons/react";
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

function AddressReveal({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const primaryLabel = name || email || "Unknown";
  const secondaryLabel = email || primaryLabel;
  const canReveal = secondaryLabel !== primaryLabel;

  return (
    <span
      className="group/address relative inline-grid min-h-[1.35rem] max-w-full text-[14px] font-[family-name:var(--font-family-serif)] text-radius-text-primary"
      title={secondaryLabel}
    >
      <span
        className={`col-start-1 row-start-1 truncate transition-all duration-300 ease-out ${
          canReveal
            ? "group-hover/address:translate-y-[-3px] group-hover/address:opacity-0"
            : ""
        }`}
      >
        {primaryLabel}
      </span>
      {canReveal ? (
        <span className="pointer-events-none col-start-1 row-start-1 truncate text-radius-text-secondary opacity-0 translate-y-1 transition-all duration-300 ease-out group-hover/address:translate-y-0 group-hover/address:opacity-100">
          {secondaryLabel}
        </span>
      ) : null}
    </span>
  );
}

const CATEGORY_META: Record<
  EmailCategory,
  { label: string; bg: string; text: string; border: string }
> = {
  important: {
    label: "Important",
    bg: "rgba(196, 163, 90, 0.12)",
    text: "#c4a35a",
    border: "rgba(196, 163, 90, 0.25)",
  },
  promotional: {
    label: "Promotional",
    bg: "rgba(163, 90, 196, 0.12)",
    text: "#a35ac4",
    border: "rgba(163, 90, 196, 0.25)",
  },
  social: {
    label: "Social",
    bg: "rgba(90, 125, 196, 0.12)",
    text: "#5a7dc4",
    border: "rgba(90, 125, 196, 0.25)",
  },
  updates: {
    label: "Updates",
    bg: "rgba(90, 140, 111, 0.12)",
    text: "#5a8c6f",
    border: "rgba(90, 140, 111, 0.25)",
  },
  forums: {
    label: "Forums",
    bg: "rgba(196, 125, 90, 0.12)",
    text: "#c47d5a",
    border: "rgba(196, 125, 90, 0.25)",
  },
  spam: {
    label: "Spam",
    bg: "rgba(196, 90, 90, 0.12)",
    text: "#c45a5a",
    border: "rgba(196, 90, 90, 0.25)",
  },
  personal: {
    label: "Personal",
    bg: "rgba(90, 168, 196, 0.12)",
    text: "#5aa8c4",
    border: "rgba(90, 168, 196, 0.25)",
  },
  regular: {
    label: "Regular",
    bg: "transparent",
    text: "var(--radius-text-muted)",
    border: "transparent",
  },
};

function MessageStatusWidget({ message }: { message: Message }) {
  const meta = CATEGORY_META[message.category];

  return (
    <div className="inline-flex items-center gap-[5px] text-[11px] font-medium font-[family-name:var(--font-family-sans)]">
      <span
        className="inline-block rounded-full"
        style={{ width: 4, height: 4, backgroundColor: meta.text }}
      />
      <span style={{ color: meta.text }}>
        {meta.label}
      </span>
    </div>
  );
}

function AttachmentList({ attachments, messageId }: { attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>; messageId: string }) {
  if (attachments.length === 0) return null;

  const handlePreview = useCallback(async (attachment: { filename: string; attachmentId: string }) => {
    try {
      const result = await radiusRpc.request.previewAttachment({
        messageId,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
      });
      if (!result.success) {
        console.error("Failed to preview attachment:", result.error);
      }
    } catch (err) {
      console.error("Preview attachment error:", err);
    }
  }, [messageId]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mt-6 space-y-2">
      <div className="text-[11px] font-medium text-radius-text-muted uppercase tracking-wide font-[family-name:var(--font-family-sans)]">
        {attachments.length} attachment{attachments.length > 1 ? "s" : ""}
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => (
          <button
            key={att.attachmentId}
            onClick={() => void handlePreview(att)}
            className="inline-flex items-center gap-2 rounded-lg border border-radius-border-subtle bg-radius-bg-secondary px-3 py-2 text-left transition-colors hover:bg-radius-bg-tertiary"
            title={`Open ${att.filename}`}
          >
            <FileIcon size={16} className="shrink-0 text-radius-text-muted" />
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)] max-w-[200px]">
                {att.filename}
              </div>
              <div className="text-[10px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                {formatSize(att.size)}
              </div>
            </div>
            <ArrowSquareOut size={14} className="shrink-0 text-radius-text-muted ml-1" />
          </button>
        ))}
      </div>
    </div>
  );
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
        fixed top-[50px] left-4 z-30
        p-2
        rounded-lg
        text-radius-text-muted
        hover:text-radius-text-secondary
        transition-colors duration-150 ease-out
        active:scale-[0.98]
      "
      style={
        {
          appRegion: "no-drag",
          WebkitAppRegion: "no-drag",
        } as CSSProperties
      }
      title="Open inbox"
    >
      <ListIcon size={16} />
    </button>
  );
}

function hasActualRichContent(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return false;

  const text = body.textContent ?? "";
  const textLength = text.trim().length;
  if (textLength < 50) return false;

  const htmlLength = body.innerHTML.length;
  const ratio = htmlLength / textLength;

  // Newsletters have lots of markup relative to text (styled divs, images, etc.)
  // Transactional emails are mostly text with minimal HTML wrapper → low ratio
  if (ratio > 2.0) return true;

  // Tables for layout = newsletter
  if (body.querySelectorAll("table").length > 0) return true;

  // Multiple images = newsletter
  const images = body.querySelectorAll("img");
  if (images.length >= 2) return true;

  // Single large image
  for (const img of images) {
    const w = img.getAttribute("width");
    const h = img.getAttribute("height");
    if (w && Number.parseInt(w, 10) > 150) return true;
    if (h && Number.parseInt(h, 10) > 150) return true;
  }

  return false;
}

function splitHtmlIntoSections(html: string): {
  html: string;
  hasRichSections: boolean;
  hasSimpleSections: boolean;
  richSectionCount: number;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  if (!root) return { html, hasRichSections: false, hasSimpleSections: false, richSectionCount: 0 };

  const richWrapper = doc.createElement("div");
  richWrapper.className = "email-section email-section--rich";

  while (root.firstChild) {
    richWrapper.appendChild(root.firstChild);
  }
  root.appendChild(richWrapper);

  return {
    html: root.innerHTML,
    hasRichSections: true,
    hasSimpleSections: false,
    richSectionCount: 1,
  };
}

// Comprehensive allowlists for email HTML — tables, inline styles, images,
// alignment attributes, and common legacy email markup.
const EMAIL_ALLOWED_TAGS = [
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
];

const EMAIL_BODY_STYLES = `
  .email-body {
    font-family: var(--font-family-sans), ui-monospace, SFMono-Regular, monospace;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .email-body * { box-sizing: border-box; }
  .email-body :is(div, span, p, td, th, li, a, strong, em, b, i, font) {
    font-family: inherit !important;
  }
  .email-body--simple {
    font-family: var(--font-family-sans), ui-monospace, SFMono-Regular, monospace;
    color: var(--radius-text-primary, #292827);
    background: transparent;
    font-size: 1.08rem;
    line-height: 1.85;
  }
  .email-section--simple {
    font-family: var(--font-family-sans), ui-monospace, SFMono-Regular, monospace;
    color: var(--radius-text-primary, #292827);
    font-size: 1.08rem;
    line-height: 1.85;
  }
  /* ── Newsletter / rich-email card ─────────────────────────── */
  .email-section--rich {
    overflow-x: auto;
  }
  /* Newsletter view: minimal safety styles only. Let the email's own HTML
     dominate typography — no reading-oriented margins, serif fonts, etc. */
  .newsletter-view {
    font-family: var(--font-family-sans), ui-monospace, SFMono-Regular, monospace;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .newsletter-view * { box-sizing: border-box; }
  .newsletter-view img {
    max-width: 100%;
    height: auto;
    display: inline-block;
  }
  .newsletter-view a {
    color: var(--radius-accent, #C4785A);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .newsletter-view a:hover {
    color: var(--radius-accent-hover, #B56A4D);
  }
  .newsletter-view table {
    max-width: 100%;
  }
  .newsletter-view figure {
    margin: 1em 0;
  }
  .newsletter-view figcaption {
    font-size: 0.85em;
    color: #6e6a62;
    text-align: center;
    margin-top: 0.3em;
  }
  .dark .newsletter-view figcaption {
    color: #8c8a87;
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
    font-weight: 600;
    margin: 1.5em 0 0.6em;
    line-height: 1.25;
  }
  .email-section--simple h1, .email-section--simple h2, .email-section--simple h3,
  .email-section--simple h4, .email-section--simple h5, .email-section--simple h6 {
    font-family: var(--font-family-sans), ui-monospace, SFMono-Regular, monospace;
    color: var(--radius-text-primary, #292827);
  }

  .email-body--simple h1, .email-body--simple h2, .email-body--simple h3,
  .email-body--simple h4, .email-body--simple h5, .email-body--simple h6 {
    font-family: var(--font-family-sans), ui-monospace, SFMono-Regular, monospace;
    color: var(--radius-text-primary, #292827);
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
  .email-section--simple :is(div, span, p, td, th, li, a, strong, em, b, i, font) {
    color: inherit !important;
    font-family: inherit !important;
  }
  .email-body--simple :is(div, span, p, td, th, li, a, strong, em, b, i, font) {
    color: inherit !important;
    font-family: inherit !important;
  }
  .email-section--simple img {
    border-radius: 14px;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--radius-border-subtle, #E5E0D9) 75%, transparent);
  }
  .email-body--simple img {
    border-radius: 14px;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--radius-border-subtle, #E5E0D9) 75%, transparent);
  }
  .email-body img {
    max-width: 100%;
    height: auto;
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
    margin: 1em 0;
  }
  .email-body table {
    max-width: 100%;
  }
  .email-section--simple table {
    background: color-mix(in srgb, var(--radius-bg-secondary, #F7F6F3) 92%, transparent);
    border-radius: 16px;
    overflow: hidden;
  }
  .email-body--simple table {
    background: color-mix(in srgb, var(--radius-bg-secondary, #F7F6F3) 92%, transparent);
    border-radius: 16px;
    overflow: hidden;
  }
  .email-body th, .email-body td {
    vertical-align: top;
  }
  .email-body--simple td,
  .email-body--simple th {
    padding: 0.5em 0.75em;
  }
  .email-section--simple td,
  .email-section--simple th {
    padding: 0.5em 0.75em;
  }
  .email-body caption {
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

  const hasRichHtml = useMemo(() => {
    if (!sanitizedHtml) return false;
    return hasActualRichContent(sanitizedHtml);
  }, [sanitizedHtml]);

  const htmlRender = useMemo(
    () => {
      if (!sanitizedHtml || !hasRichHtml) {
        return { html: null, hasRichSections: false, hasSimpleSections: false, richSectionCount: 0 };
      }
      return splitHtmlIntoSections(sanitizedHtml);
    },
    [sanitizedHtml, hasRichHtml]
  );

  const isPureNewsletter = htmlRender.hasRichSections && !htmlRender.hasSimpleSections;

  if (!message) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-radius-bg-primary relative pt-11">
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
    <div className="flex flex-col h-full bg-radius-bg-primary overflow-auto relative pt-11">
      <InboxWidget visible={!sidebarOpen} onClick={onOpenSidebar} />

      <div className="flex-1 email-enter" key={message.id}>
        {isPureNewsletter ? (
          /* ═════ DOCUMENT MODE — Newsletters ═════ */
          <article className="w-full px-6 pt-6 pb-24">
            {/* Compact sender bar */}
            <div className="max-w-[720px] mx-auto mb-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[15px] font-semibold text-radius-text-primary truncate font-[family-name:var(--font-family-sans)]">
                    {sender.name || sender.email}
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-[5px] text-[11px] font-medium font-[family-name:var(--font-family-sans)] px-2 py-0.5 rounded-full bg-[rgba(163,90,196,0.10)] text-[#a35ac4]">
                    <span className="inline-block rounded-full bg-[#a35ac4]" style={{ width: 4, height: 4 }} />
                    Newsletter
                  </span>
                </div>
                <time className="shrink-0 text-[12px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                  {formatFullDate(message.internalDate)}
                </time>
              </div>
            </div>

            {/* Newsletter card — contained document */}
            <div className="max-w-[720px] mx-auto">
              <div
                className="newsletter-view min-w-0"
                onClick={handleBodyClick}
                dangerouslySetInnerHTML={{
                  __html: htmlRender.html ?? sanitizedHtml ?? "",
                }}
              />
              <AttachmentList attachments={message.attachments} messageId={message.id} />
            </div>
          </article>
        ) : (
          /* ═════ READING MODE — Text emails ═════ */
          <article className="w-full px-6 pt-8 pb-24">
            <header className="max-w-[720px] mx-auto">
              <h1 className="font-[family-name:var(--font-family-serif)] text-[32px] font-semibold text-radius-text-primary leading-[1.1] tracking-wide mb-4">
                {message.subject}
              </h1>

              <div className="mb-8">
                <MessageStatusWidget message={message} />
              </div>

              <div className="mb-10 pb-8 border-b border-radius-border-subtle space-y-2">
                <div className="flex items-start gap-6">
                  <span className="text-[13px] text-radius-text-muted w-8 shrink-0 font-[family-name:var(--font-family-serif)]">
                    From
                  </span>
                  <AddressReveal name={sender.name} email={sender.email} />
                </div>
                <div className="flex items-start gap-6">
                  <span className="text-[13px] text-radius-text-muted w-8 shrink-0 font-[family-name:var(--font-family-serif)]">
                    To
                  </span>
                  <AddressReveal name={recipient.name} email={recipient.email} />
                </div>
                <div className="flex items-baseline gap-6 pt-1">
                  <span className="text-[13px] text-radius-text-muted w-8 shrink-0 font-[family-name:var(--font-family-serif)]"></span>
                  <time className="text-[12px] text-radius-text-muted font-[family-name:var(--font-family-serif)]">
                    {formatFullDate(message.internalDate)}
                  </time>
                </div>
              </div>
            </header>

            {sanitizedHtml ? (
              <div className="max-w-[720px] mx-auto">
                <div
                  className={hasRichHtml ? "email-body min-w-0 text-[15px] leading-[1.6]" : "email-body email-body--simple min-w-0 text-[17px] leading-[1.85]"}
                  onClick={handleBodyClick}
                  dangerouslySetInnerHTML={{
                    __html: hasRichHtml ? (htmlRender.html ?? sanitizedHtml) : sanitizedHtml,
                  }}
                />
                <AttachmentList attachments={message.attachments} messageId={message.id} />
              </div>
            ) : (
              <div className="max-w-[720px] mx-auto">
                <div className="font-[family-name:var(--font-family-sans)] text-[17px] leading-[1.75] text-radius-text-primary whitespace-pre-wrap">
                  {message.bodyText || message.snippet}
                </div>
                <AttachmentList attachments={message.attachments} messageId={message.id} />
              </div>
            )}
          </article>
        )}
      </div>

      <style>{EMAIL_BODY_STYLES}</style>
    </div>
  );
});
