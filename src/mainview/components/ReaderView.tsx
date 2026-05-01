import DOMPurify from "dompurify";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { Message, EmailCategory } from "../hooks/useInbox";
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
  const isRegular = message.category === "regular";

  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-radius-border-subtle bg-radius-bg-secondary/70 px-3 py-2 text-[11px] font-[family-name:var(--font-family-sans)]">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 ${
          message.isRead
            ? "bg-radius-bg-primary text-radius-text-muted"
            : "bg-radius-accent/14 text-radius-accent"
        }`}
      >
        {message.isRead ? "Read" : "Unread"}
      </span>
      <span className="text-radius-text-muted">•</span>
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5"
        style={{
          backgroundColor: isRegular ? "var(--radius-bg-primary)" : meta.bg,
          color: isRegular ? "var(--radius-text-muted)" : meta.text,
          border: `1px solid ${isRegular ? "var(--radius-border-subtle)" : meta.border}`,
        }}
        title="Mail category"
      >
        {isRegular ? "Regular" : meta.label}
      </span>
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

function getDeclaredWidth(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)px/i) ?? value.match(/^(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRichNode(node: Element): boolean {
  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  const style = element.getAttribute("style")?.toLowerCase() ?? "";
  const textLength = (element.textContent ?? "").replace(/\s+/g, " ").trim().length;

  if (
    element.hasAttribute("bgcolor") ||
    element.hasAttribute("background") ||
    style.includes("background") ||
    style.includes("box-shadow") ||
    style.includes("border-radius")
  ) {
    return true;
  }

  if (tagName === "table") {
    const widthAttr = getDeclaredWidth(element.getAttribute("width"));
    const styleWidth = getDeclaredWidth(element.style.width);
    if ((widthAttr ?? 0) >= 320 || (styleWidth ?? 0) >= 320) return true;
    if (element.querySelectorAll("img").length > 0) return true;
    if (element.querySelectorAll("tr").length >= 2) return true;
  }

  if (tagName === "img") {
    const widthAttr = getDeclaredWidth(element.getAttribute("width"));
    const styleWidth = getDeclaredWidth(element.style.width);
    return (widthAttr ?? 0) >= 220 || (styleWidth ?? 0) >= 220;
  }

  if (tagName === "div" || tagName === "section" || tagName === "article") {
    if (element.querySelector("table")) return true;
    if (element.querySelectorAll("img").length >= 2) return true;
    if (style.includes("border") && textLength < 500) return true;
  }

  return false;
}

function splitHtmlIntoSections(html: string): {
  html: string;
  hasRichSections: boolean;
  richSectionCount: number;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  if (!root) return { html, hasRichSections: false, richSectionCount: 0 };

  const topLevelNodes = Array.from(root.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? "").trim().length > 0;
    }
    return node.nodeType === Node.ELEMENT_NODE;
  });

  if (topLevelNodes.length === 0) {
    return { html, hasRichSections: false, richSectionCount: 0 };
  }

  const firstRichIndex = topLevelNodes.findIndex((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return isRichNode(node as Element);
  });

  if (firstRichIndex <= 0) {
    return {
      html,
      hasRichSections: firstRichIndex === 0,
      richSectionCount: firstRichIndex === 0 ? 1 : 0,
    };
  }

  const plainWrapper = doc.createElement("div");
  plainWrapper.className = "email-section email-section--simple";

  const richWrapper = doc.createElement("div");
  richWrapper.className = "email-section email-section--rich";

  topLevelNodes.forEach((node, index) => {
    const target = index < firstRichIndex ? plainWrapper : richWrapper;
    target.appendChild(node);
  });

  root.replaceChildren(plainWrapper, richWrapper);

  return {
    html: root.innerHTML,
    hasRichSections: true,
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
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .email-body * { box-sizing: border-box; }
  .email-body--simple {
    font-family: var(--font-family-serif), Georgia, serif;
    color: var(--radius-text-primary, #292827);
    background: transparent;
    font-size: 1.08rem;
    line-height: 1.85;
  }
  .email-body--rich {
    font-family: Arial, Helvetica, sans-serif;
    color: #202124;
    background: #ffffff;
  }
  .email-section--simple {
    font-family: var(--font-family-serif), Georgia, serif;
    color: var(--radius-text-primary, #292827);
    font-size: 1.08rem;
    line-height: 1.85;
  }
  .email-section--rich {
    margin-top: 2.25rem;
    overflow-x: auto;
    border-radius: 20px;
    background: color-mix(in srgb, var(--radius-bg-primary, #ffffff) 96%, transparent);
    padding: 1rem;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
    outline: 1px solid rgba(0, 0, 0, 0.08);
  }
  .dark .email-section--rich {
    background: #fbfbfa;
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
    font-family: var(--font-family-serif), Georgia, serif;
    color: var(--radius-text-primary, #292827);
  }
  .email-section--rich h1, .email-section--rich h2, .email-section--rich h3,
  .email-section--rich h4, .email-section--rich h5, .email-section--rich h6 {
    font-family: Arial, Helvetica, sans-serif;
    color: #202124;
  }
  .email-body--simple h1, .email-body--simple h2, .email-body--simple h3,
  .email-body--simple h4, .email-body--simple h5, .email-body--simple h6 {
    font-family: var(--font-family-serif), Georgia, serif;
    color: var(--radius-text-primary, #292827);
  }
  .email-body--rich h1, .email-body--rich h2, .email-body--rich h3,
  .email-body--rich h4, .email-body--rich h5, .email-body--rich h6 {
    font-family: Arial, Helvetica, sans-serif;
    color: #202124;
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
  const htmlRender = useMemo(
    () =>
      sanitizedHtml
        ? splitHtmlIntoSections(sanitizedHtml)
        : { html: null, hasRichSections: false, richSectionCount: 0 },
    [sanitizedHtml]
  );

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
  const hasHtmlBody = Boolean(sanitizedHtml);

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary overflow-auto relative pt-11">
      <InboxWidget visible={!sidebarOpen} onClick={onOpenSidebar} />

      <div className="flex-1 email-enter" key={message.id}>
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

          {hasHtmlBody ? (
            <div className={`mx-auto ${htmlRender.hasRichSections ? "max-w-[1160px]" : "max-w-[720px]"}`}>
              <div
                className={`email-body min-w-0 ${
                  htmlRender.hasRichSections
                    ? "text-[15px] leading-[1.6]"
                    : "email-body--simple"
                }`}
                onClick={handleBodyClick}
                dangerouslySetInnerHTML={{
                  __html: htmlRender.html ?? sanitizedHtml ?? "",
                }}
              />
            </div>
          ) : (
            <div className="max-w-[720px] mx-auto font-[family-name:var(--font-family-serif)] text-[17px] leading-[1.75] text-radius-text-primary whitespace-pre-wrap">
              {message.bodyText || message.snippet}
            </div>
          )}
        </article>
      </div>

      <style>{EMAIL_BODY_STYLES}</style>
    </div>
  );
});
