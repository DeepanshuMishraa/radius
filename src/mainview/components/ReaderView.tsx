import DOMPurify from "dompurify";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { useTheme } from "@/components/theme-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Message, EmailCategory } from "../hooks/useInbox";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SidebarRight01Icon,
  File01Icon,
  ArrowUpRight01Icon,
  Delete01Icon,
  Forward02Icon,
  MailReply01Icon,
} from "@hugeicons/core-free-icons";
import { radiusRpc } from "../lib/rpc";
import { UI_SETTINGS_EVENT } from "@/lib/font-utils";

interface ReaderViewProps {
  message: Message | null;
  mailbox: "inbox" | "sent" | "drafts" | "trash";
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete?: () => void;
  onForward?: () => void;
  onReply?: () => void;
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
      className="group/address relative inline-grid min-h-[1.35rem] max-w-full text-[14px] font-[family-name:var(--font-family-serif)] text-radius-text-primary cursor-pointer select-none"
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
    <div className="inline-flex items-center gap-[6px] text-[11px] font-semibold uppercase tracking-[0.14em] font-[family-name:var(--font-family-sans)]">
      <span
        className="inline-block rounded-full"
        style={{ width: 5, height: 5, backgroundColor: meta.text }}
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
            <HugeiconsIcon icon={File01Icon} size={16} className="shrink-0 text-radius-text-muted" />
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)] max-w-[200px]">
                {att.filename}
              </div>
              <div className="text-[10px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                {formatSize(att.size)}
              </div>
            </div>
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} className="shrink-0 text-radius-text-muted ml-1" />
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
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Open inbox"
          onClick={onClick}
          className="
            electrobun-webkit-app-region-no-drag
            fixed top-[46px] left-6 z-30
            p-1.5
            rounded-lg
            text-radius-text-muted
            bg-radius-bg-primary/70 backdrop-blur-md
            border border-radius-border-subtle
            shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]
            hover:text-radius-text-primary
            hover:bg-radius-bg-primary/90
            transition-all duration-200 ease-out
            active:scale-[0.96]
          "
          style={
            {
              appRegion: "no-drag",
              WebkitAppRegion: "no-drag",
            } as CSSProperties
          }
        >
          <HugeiconsIcon icon={SidebarRight01Icon} size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="bg-radius-bg-primary text-radius-text-primary border border-radius-border-subtle shadow-md">
        Open inbox
      </TooltipContent>
    </Tooltip>
  );
}

function ActionButton({ icon, tooltip, onClick, className = "" }: { icon: React.ReactNode, tooltip: string, onClick?: () => void, className?: string }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={tooltip}
          onClick={onClick}
          className={`p-1.5 rounded-md text-radius-text-muted hover:text-radius-text-primary hover:bg-radius-bg-secondary transition-colors duration-150 ease-out active:scale-[0.96] ${className}`}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="bg-radius-bg-primary text-radius-text-primary border border-radius-border-subtle shadow-md">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function ActionBarWidget({
  visible,
  onReply,
  onForward,
  onDelete
}: {
  visible: boolean;
  onReply?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
}) {
  if (!visible) return null;

  return (
    <div
      className="
        fixed top-[46px] right-6 z-30
        flex items-center gap-1.5
        p-1
        rounded-lg
        bg-radius-bg-primary/70 backdrop-blur-md
        border border-radius-border-subtle
        shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]
        electrobun-webkit-app-region-no-drag
      "
      style={{
        appRegion: "no-drag",
        WebkitAppRegion: "no-drag",
      } as CSSProperties}
    >
      <ActionButton icon={<HugeiconsIcon icon={MailReply01Icon} size={16} />} tooltip="Reply" onClick={onReply} />
      <ActionButton icon={<HugeiconsIcon icon={Forward02Icon} size={16} />} tooltip="Forward" onClick={onForward} />
      <div className="w-[1px] h-3.5 bg-radius-border-subtle/75" />
      <ActionButton 
        icon={<HugeiconsIcon icon={Delete01Icon} size={16} />} 
        tooltip="Delete" 
        onClick={onDelete} 
        className="hover:text-red-500 hover:bg-red-500/10" 
      />
    </div>
  );
}

function ReplyThreadCard({ message }: { message: Message }) {
  const author = parseAddress(message.from);
  const bodyText = (message.bodyText || message.snippet || "").trim();
  
  let replyText = bodyText;
  let quotedText = "";
  
  const quoteRegex = /(?:\n|^)(?:On\s.*?wrote:.*|>\s.*|From:\s.*|--- Original Message ---.*)/is;
  const match = bodyText.match(quoteRegex);
  
  if (match && match.index !== undefined) {
    replyText = bodyText.substring(0, match.index).trim();
    quotedText = bodyText.substring(match.index).trim();
  }

  if (!replyText && quotedText) {
    replyText = quotedText;
    quotedText = "";
  }

  const avatarLetter = (author.name || author.email || "?").charAt(0).toUpperCase();

  return (
    <article className="group flex flex-col gap-1 py-6 border-t border-radius-border-subtle/20 first:border-0 transition-colors">
      <header className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-radius-bg-secondary/80 border border-radius-border-subtle/50 text-[11px] font-medium text-radius-text-primary shadow-sm">
            {avatarLetter}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
              {author.name || author.email || "Unknown"}
            </span>
            {author.name && author.email && author.email !== author.name && (
              <span className="text-[12px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                {author.email}
              </span>
            )}
          </div>
        </div>
        <time className="text-[12px] text-radius-text-muted font-[family-name:var(--font-family-sans)] tracking-wide">
          {formatFullDate(message.internalDate)}
        </time>
      </header>
      
      <div className="pl-10">
        <div className="whitespace-pre-wrap text-[14.5px] leading-[1.65] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
          {replyText || "No content"}
        </div>
        
        {quotedText && (
          <details className="mt-3 group/quote">
            <summary className="cursor-pointer text-radius-text-muted hover:text-radius-text-primary select-none flex h-6 w-8 items-center justify-center rounded bg-radius-bg-secondary/30 hover:bg-radius-bg-secondary/80 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-radius-border-strong">
              <span className="text-[14px] leading-none tracking-widest translate-x-[1px]">•••</span>
            </summary>
            <div className="mt-4 border-l-2 border-radius-border-subtle/40 pl-4 py-0.5">
              <div className="whitespace-pre-wrap text-[13px] leading-[1.6] text-radius-text-muted font-[family-name:var(--font-family-sans)] opacity-60">
                {quotedText}
              </div>
            </div>
          </details>
        )}
        
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-4">
            <AttachmentList attachments={message.attachments} messageId={message.id} />
          </div>
        )}
      </div>
    </article>
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

function buildNewsletterSrcDoc(
  html: string,
  frameId: string,
  theme: {
    appearance: "light" | "dark";
    surface: string;
    elevatedSurface: string;
    text: string;
    mutedText: string;
    border: string;
    accent: string;
    readerFont: string;
  }
): string {
  const escapedFrameId = JSON.stringify(frameId);
  const escapedTheme = JSON.stringify(theme);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="${theme.appearance}" />
    <base target="_blank" />
    <style>
      :root {
        --radius-newsletter-surface: ${theme.surface};
        --radius-newsletter-elevated: ${theme.elevatedSurface};
        --radius-newsletter-text: ${theme.text};
        --radius-newsletter-muted: ${theme.mutedText};
        --radius-newsletter-border: ${theme.border};
        --radius-newsletter-accent: ${theme.accent};
        --radius-newsletter-font: ${theme.readerFont};
      }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--radius-newsletter-surface);
        color: var(--radius-newsletter-text);
        font-family: var(--radius-newsletter-font);
        overflow-x: hidden;
      }
      * {
        box-sizing: border-box;
      }
      img, video {
        max-width: 100%;
        height: auto;
      }
      table {
        max-width: 100% !important;
      }
      body {
        display: flex;
        justify-content: center;
      }
      .radius-email-root {
        width: 100%;
        display: flex;
        justify-content: center;
      }
      .radius-email-inner {
        width: max-content;
        max-width: 100%;
      }
      .radius-email-root,
      .radius-email-inner {
        color: var(--radius-newsletter-text);
        font-family: var(--radius-newsletter-font);
      }
      .radius-email-inner :is(body, table, tbody, thead, tfoot, tr, td, th, div, section, article, main, aside, p, span, li, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, font, a, strong, em, b, i) {
        font-family: var(--radius-newsletter-font) !important;
      }
      .radius-email-inner :is(pre, code, kbd, samp) {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      }
      body[data-radius-appearance="dark"] .radius-email-inner,
      body[data-radius-appearance="dark"] .radius-email-inner :is(body, table, tbody, thead, tfoot, tr, td, th, div, section, article, main, aside, p, span, li, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, font) {
        background-color: transparent !important;
        color: var(--radius-newsletter-text) !important;
        border-color: var(--radius-newsletter-border) !important;
      }
      body[data-radius-appearance="dark"] .radius-email-inner table,
      body[data-radius-appearance="dark"] .radius-email-inner td,
      body[data-radius-appearance="dark"] .radius-email-inner th {
        background-image: none !important;
      }
      body[data-radius-appearance="dark"] .radius-email-inner a {
        color: var(--radius-newsletter-accent) !important;
      }
      body[data-radius-appearance="dark"] .radius-email-inner :is(svg, path) {
        color: inherit;
      }
      body[data-radius-appearance="dark"] .radius-email-inner img {
        background: transparent !important;
      }
    </style>
  </head>
  <body data-radius-appearance="${theme.appearance}">
    <div class="radius-email-root">
      <div class="radius-email-inner">${html}</div>
    </div>
    <script>
      const frameId = ${escapedFrameId};
      const theme = ${escapedTheme};
      const IGNORED_TAGS = new Set(["IMG", "SVG", "PATH", "VIDEO", "SOURCE", "PICTURE", "CANVAS"]);
      const CODE_TAGS = new Set(["PRE", "CODE", "KBD", "SAMP"]);
      const SURFACE_TAGS = new Set(["TABLE", "TBODY", "THEAD", "TFOOT", "TR", "TD", "TH", "DIV", "SECTION", "ARTICLE", "MAIN", "ASIDE"]);

      const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

      const parseColor = (input) => {
        if (!input) return null;
        const value = input.trim().toLowerCase();
        if (!value || value === "transparent" || value === "inherit" || value === "initial") {
          return null;
        }

        if (value.startsWith("#")) {
          const hex = value.slice(1);
          const expanded =
            hex.length === 3 || hex.length === 4
              ? hex.split("").map((part) => part + part).join("")
              : hex;
          if (expanded.length !== 6 && expanded.length !== 8) return null;
          const r = parseInt(expanded.slice(0, 2), 16);
          const g = parseInt(expanded.slice(2, 4), 16);
          const b = parseInt(expanded.slice(4, 6), 16);
          const a = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1;
          return { r, g, b, a };
        }

        const match = value.match(/rgba?\\(([^)]+)\\)/);
        if (!match) return null;
        const parts = match[1].split(",").map((part) => part.trim());
        if (parts.length < 3) return null;
        const r = Number(parts[0]);
        const g = Number(parts[1]);
        const b = Number(parts[2]);
        const a = parts.length > 3 ? Number(parts[3]) : 1;
        if ([r, g, b, a].some((part) => Number.isNaN(part))) return null;
        return { r, g, b, a };
      };

      const luminance = (color) => {
        if (!color) return null;
        const toLinear = (channel) => {
          const normalized = clamp(channel / 255, 0, 1);
          return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
      };

      const adaptNewsletterForTheme = () => {
        const root = document.querySelector(".radius-email-inner");
        if (!root) return;

        document.documentElement.style.setProperty("background-color", theme.surface, "important");
        document.body.style.setProperty("background-color", theme.surface, "important");
        document.body.style.setProperty("color", theme.text, "important");
        root.style.setProperty("background-color", theme.surface, "important");
        root.style.setProperty("color", theme.text, "important");

        for (const element of root.querySelectorAll("*")) {
          if (!(element instanceof HTMLElement)) continue;
          if (IGNORED_TAGS.has(element.tagName)) continue;

          if (CODE_TAGS.has(element.tagName)) {
            element.style.setProperty(
              "font-family",
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              "important"
            );
          } else {
            element.style.setProperty("font-family", theme.readerFont, "important");
          }

          const computed = window.getComputedStyle(element);
          const bg = parseColor(computed.backgroundColor);
          const fg = parseColor(computed.color);
          const borderTop = parseColor(computed.borderTopColor);
          const borderRight = parseColor(computed.borderRightColor);
          const borderBottom = parseColor(computed.borderBottomColor);
          const borderLeft = parseColor(computed.borderLeftColor);

          const bgLum = luminance(bg);
          const fgLum = luminance(fg);
          const borderValues = [borderTop, borderRight, borderBottom, borderLeft]
            .filter(Boolean)
            .map((color) => luminance(color));

          const shouldAdaptLightSurface =
            theme.appearance === "dark" &&
            bg &&
            bg.a > 0.75 &&
            bgLum !== null &&
            bgLum > 0.72;

          const shouldAdaptPaperSurface =
            theme.appearance === "light" &&
            bg &&
            bg.a > 0.82 &&
            bgLum !== null &&
            bgLum > 0.94;

          if (shouldAdaptLightSurface || shouldAdaptPaperSurface) {
            element.style.setProperty("background-image", "none", "important");
            element.style.setProperty(
              "background-color",
              SURFACE_TAGS.has(element.tagName) ? theme.elevatedSurface : "transparent",
              "important"
            );
            element.style.setProperty("background", "none", "important");
            if (element.hasAttribute("bgcolor")) {
              element.removeAttribute("bgcolor");
            }
            if (element.hasAttribute("background")) {
              element.removeAttribute("background");
            }
          }

          if (
            fg &&
            fg.a > 0.4 &&
            fgLum !== null &&
            ((theme.appearance === "dark" && fgLum < 0.3) ||
              (theme.appearance === "light" && fgLum > 0.96)) &&
            element.tagName !== "A"
          ) {
            element.style.setProperty("color", theme.text, "important");
          }

          if (
            borderValues.some((value) =>
              value !== null &&
              ((theme.appearance === "dark" && value > 0.75) ||
                (theme.appearance === "light" && value > 0.94))
            )
          ) {
            element.style.setProperty("border-color", theme.border, "important");
          }
        }
      };

      const postHeight = () => {
        const body = document.body;
        const html = document.documentElement;
        const height = Math.max(
          body ? body.scrollHeight : 0,
          html ? html.scrollHeight : 0,
          body ? body.offsetHeight : 0,
          html ? html.offsetHeight : 0
        );
        parent.postMessage({ type: "radius-newsletter-height", frameId, height }, "*");
      };

      document.documentElement.style.colorScheme = theme.appearance;

      window.addEventListener("load", () => {
        adaptNewsletterForTheme();
        postHeight();
        setTimeout(postHeight, 50);
        setTimeout(postHeight, 250);
      });

      new ResizeObserver(() => postHeight()).observe(document.documentElement);
    </script>
  </body>
</html>`;
}

function NewsletterFrame({
  html,
  messageId,
  themeConfig,
}: {
  html: string;
  messageId: string;
  themeConfig: {
    id: string;
    appearance: "light" | "dark";
    surface: string;
    elevatedSurface: string;
    text: string;
    mutedText: string;
    border: string;
    accent: string;
    readerFont: string;
  };
}) {
  const [height, setHeight] = useState(900);
  const frameId = useMemo(() => `newsletter-${messageId}`, [messageId]);
  const srcDoc = useMemo(
    () => buildNewsletterSrcDoc(html, frameId, themeConfig),
    [frameId, html, themeConfig]
  );

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; frameId?: string; height?: number }
        | undefined;
      if (!data || data.type !== "radius-newsletter-height" || data.frameId !== frameId) {
        return;
      }
      if (typeof data.height === "number" && Number.isFinite(data.height)) {
        setHeight(Math.max(320, Math.ceil(data.height)));
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [frameId]);

  return (
    <iframe
      title="Newsletter content"
      className="newsletter-frame"
      sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      style={{ height }}
    />
  );
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
  "div", "hr", "wbr", "noscript", "style",
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
    font-family: var(--font-family-reader, var(--font-family-sans)), ui-monospace, SFMono-Regular, monospace;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .email-body * { box-sizing: border-box; }
  .email-body :is(div, span, p, td, th, li, a, strong, em, b, i, font) {
    font-family: inherit !important;
  }
  .email-body--simple {
    font-family: var(--font-family-reader, var(--font-family-sans)), ui-monospace, SFMono-Regular, monospace;
    color: var(--radius-text-primary, #292827);
    background: transparent;
    font-size: 1.08rem;
    line-height: 1.85;
  }
  .email-section--simple {
    font-family: var(--font-family-reader, var(--font-family-sans)), ui-monospace, SFMono-Regular, monospace;
    color: var(--radius-text-primary, #292827);
    font-size: 1.08rem;
    line-height: 1.85;
  }
  /* ── Newsletter / rich-email card ─────────────────────────── */
  .email-section--rich {
    overflow-x: auto;
  }
  .newsletter-stage {
    padding-top: 4px;
  }
  .newsletter-frame {
    width: 100%;
    display: block;
    border: 0;
    border-radius: 20px;
    background: var(--radius-bg-primary, #ffffff);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--radius-border-subtle, #E5E0D9) 72%, transparent);
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
    font-family: var(--font-family-reader, var(--font-family-sans)), ui-monospace, SFMono-Regular, monospace;
    color: var(--radius-text-primary, #292827);
  }

  .email-body--simple h1, .email-body--simple h2, .email-body--simple h3,
  .email-body--simple h4, .email-body--simple h5, .email-body--simple h6 {
    font-family: var(--font-family-reader, var(--font-family-sans)), ui-monospace, SFMono-Regular, monospace;
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
  mailbox,
  sidebarOpen,
  onOpenSidebar,
  onPrev,
  onNext,
  onReply,
  onForward,
  onDelete,
}: ReaderViewProps) {
  const { theme, appearance, resolvedTheme } = useTheme();
  const [readerFontFamily, setReaderFontFamily] = useState(() => {
    if (typeof window === "undefined") {
      return '"JetBrains Mono", ui-sans-serif, system-ui, sans-serif';
    }

    const computedStyles = window.getComputedStyle(document.documentElement);
    return (
      computedStyles.getPropertyValue("--font-family-reader").trim() ||
      computedStyles.getPropertyValue("--font-family-sans").trim() ||
      '"JetBrains Mono", ui-sans-serif, system-ui, sans-serif'
    );
  });
  
  const [textSize] = useState<"sm" | "md" | "lg">(() => {
    const saved = localStorage.getItem("radius.reader.textsize");
    return (saved === "sm" || saved === "md" || saved === "lg") ? saved : "md";
  });

  const richTextClass = 
    textSize === "sm" 
      ? "text-[13px] leading-[1.5]" 
      : textSize === "lg" 
        ? "text-[17px] leading-[1.7]" 
        : "text-[15px] leading-[1.6]";

  const simpleTextClass = 
    textSize === "sm" 
      ? "text-[15px] leading-[1.65]" 
      : textSize === "lg" 
        ? "text-[20px] leading-[2.0]" 
        : "text-[17px] leading-[1.85]";

  const plainTextClass = 
    textSize === "sm" 
      ? "text-[15px] leading-[1.55]" 
      : textSize === "lg" 
        ? "text-[20px] leading-[1.95]" 
        : "text-[17px] leading-[1.75]";
  const newsletterThemeConfig = useMemo(() => {
    const variables = resolvedTheme?.variables ?? {};

    return {
      id: theme,
      appearance,
      surface: variables["--radius-bg-primary"] ?? "#ffffff",
      elevatedSurface: variables["--radius-bg-secondary"] ?? "#f7f6f3",
      text: variables["--radius-text-primary"] ?? "#292827",
      mutedText: variables["--radius-text-secondary"] ?? "#5c5a57",
      border: variables["--radius-border-subtle"] ?? "#e5e0d9",
      accent: variables["--radius-accent"] ?? "#c4785a",
      readerFont: readerFontFamily,
    };
  }, [appearance, readerFontFamily, resolvedTheme, theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncReaderFont = () => {
      const computedStyles = window.getComputedStyle(document.documentElement);
      setReaderFontFamily(
        computedStyles.getPropertyValue("--font-family-reader").trim() ||
          computedStyles.getPropertyValue("--font-family-sans").trim() ||
          '"JetBrains Mono", ui-sans-serif, system-ui, sans-serif'
      );
    };

    const handleSettingsChanged = () => {
      syncReaderFont();
    };

    window.addEventListener(UI_SETTINGS_EVENT, handleSettingsChanged as EventListener);
    return () => {
      window.removeEventListener(UI_SETTINGS_EVENT, handleSettingsChanged as EventListener);
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [message, onPrev, onNext]);

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
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const threadRequestIdRef = useRef(0);

  const loadThreadMessages = useCallback(async () => {
    if (!message?.threadId || mailbox !== "inbox") {
      threadRequestIdRef.current += 1;
      setThreadMessages([]);
      return;
    }
    const requestId = ++threadRequestIdRef.current;
    try {
      const result = await radiusRpc.request.getThreadMessages({
        threadId: message.threadId,
        limit: 16,
      });
      if (threadRequestIdRef.current !== requestId) return;
      setThreadMessages(result.messages);
    } catch (error) {
      if (threadRequestIdRef.current !== requestId) return;
      console.error("Failed to load thread messages:", error);
      setThreadMessages([]);
    }
  }, [mailbox, message?.threadId]);

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

  const [systemName, setSystemName] = useState<string>("there");

  useEffect(() => {
    void loadThreadMessages();
  }, [loadThreadMessages, message?.id]);

  useEffect(() => {
    if (!message?.threadId || mailbox !== "inbox") return;
    const handleComposeStatus = () => {
      void loadThreadMessages();
    };
    radiusRpc.addMessageListener("composeStatusChanged", handleComposeStatus);
    return () => {
      radiusRpc.removeMessageListener("composeStatusChanged", handleComposeStatus);
    };
  }, [loadThreadMessages, mailbox, message?.threadId]);

  useEffect(() => {
    radiusRpc.request.getSystemFullName({}).then(res => {
      // Use just the first name if available
      const firstName = res.name.split(' ')[0];
      setSystemName(firstName);
    }).catch(err => {
      console.error("Failed to fetch system name", err);
    });
  }, []);

  const repliedMessages = useMemo(
    () =>
      !message
        ? []
        : threadMessages
            .filter(
              (threadMessage) =>
                threadMessage.id !== message.id &&
                Boolean(threadMessage.isSent) &&
                threadMessage.internalDate >= message.internalDate,
            )
            .sort((a, b) => a.internalDate - b.internalDate),
    [message, threadMessages],
  );

  if (!message) {
    const hour = new Date().getHours();
    let timeGreeting = "evening";
    let subtext = "Ready to wrap up your day?";
    
    if (hour < 12) {
      timeGreeting = "morning";
      subtext = "Ready to start your day?";
    } else if (hour < 17) {
      timeGreeting = "afternoon";
      subtext = "Hope your day is going well.";
    }

    const greeting = `Good ${timeGreeting}, ${systemName}.`;
    const mailboxTitle =
      mailbox === "sent"
        ? "Welcome to Sent mail."
        : mailbox === "drafts"
          ? "Welcome to Drafts."
          : mailbox === "trash"
            ? "Welcome to Trash."
            : greeting;
    const mailboxSubtext =
      mailbox === "sent"
        ? "Pick a sent message from the left to review what you shipped."
        : mailbox === "drafts"
          ? "Your saved drafts are waiting on the left."
          : mailbox === "trash"
            ? "Recently deleted mail lives here until you empty trash."
            : subtext;

    return (
      <div className="flex flex-col items-center justify-center h-full bg-radius-bg-primary relative w-full overflow-hidden">
        {/* Subtle Background Matrix */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='currentColor'/%3E%3C/svg%3E")`,
            backgroundSize: '24px 24px',
            color: 'var(--radius-text-primary)'
          }}
        />
        
        <InboxWidget visible={!sidebarOpen} onClick={onOpenSidebar} />
        
        <div className="relative z-10 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] fill-mode-both">
          <h1 className="text-[32px] md:text-[42px] font-medium tracking-[-0.03em] text-radius-text-primary font-[family-name:var(--font-family-serif)] mb-3 text-center leading-[1.1]">
            {mailboxTitle}
          </h1>
          <p className="text-[15px] text-radius-text-secondary font-[family-name:var(--font-family-sans)] tracking-[-0.01em]">
            {mailboxSubtext}
          </p>
        </div>
      </div>
    );
  }

  const sender = parseAddress(message.from);
  const recipient = parseAddress(message.to);

  return (
    <div className="flex flex-col h-full bg-radius-bg-primary overflow-auto relative pt-11">
      <InboxWidget visible={!sidebarOpen} onClick={onOpenSidebar} />
      <ActionBarWidget 
        visible={true} 
        onReply={onReply}
        onForward={onForward}
        onDelete={onDelete}
      />

      <div className="flex-1 email-enter relative" key={message.id}>
        {isPureNewsletter ? (
          /* ═════ DOCUMENT MODE — Newsletters ═════ */
          <article className="w-full px-6 pt-6 pb-24">
            <div className="mx-auto max-w-[920px]">
              <header className="mb-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-[6px] rounded-full border border-[rgba(163,90,196,0.22)] bg-[rgba(163,90,196,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a35ac4] font-[family-name:var(--font-family-sans)]">
                    <span className="inline-block rounded-full bg-[#a35ac4]" style={{ width: 5, height: 5 }} />
                    Newsletter
                  </span>
                  <span className="truncate text-[12px] uppercase tracking-[0.16em] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                    {sender.name || sender.email}
                  </span>
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <h1 className="min-w-0 max-w-[42rem] text-[28px] leading-[1.08] tracking-[-0.02em] text-radius-text-primary font-[family-name:var(--font-family-serif)]">
                    {message.subject || "Newsletter"}
                  </h1>
                  <time className="shrink-0 text-[12px] uppercase tracking-[0.16em] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                    {formatFullDate(message.internalDate)}
                  </time>
                </div>
              </header>

              <div className="newsletter-stage">
                <NewsletterFrame
                  messageId={message.id}
                  html={htmlRender.html ?? sanitizedHtml ?? ""}
                  themeConfig={newsletterThemeConfig}
                />
              </div>
              <AttachmentList attachments={message.attachments} messageId={message.id} />
              {mailbox === "inbox" && repliedMessages.length > 0 ? (
                <div className="mt-16">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-radius-border-subtle/30" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-radius-bg-primary px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-radius-text-muted/70 font-[family-name:var(--font-family-sans)]">
                        Replies
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    {repliedMessages.map((reply) => (
                      <ReplyThreadCard key={reply.id} message={reply} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        ) : (
          /* ═════ READING MODE — Text emails ═════ */
          <article className="w-full px-6 pt-8 pb-24">
            <header className="max-w-[720px] mx-auto">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <MessageStatusWidget message={message} />
                <div className="w-1 h-1 rounded-full bg-radius-border-subtle" />
                <time className="text-[12px] tracking-wide text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                  {formatFullDate(message.internalDate)}
                </time>
              </div>

              <h1 className="font-[family-name:var(--font-family-serif)] text-[32px] md:text-[36px] font-medium text-radius-text-primary leading-[1.1] tracking-tight mb-8">
                {message.subject}
              </h1>

              <div className="mb-10 pb-8 border-b border-radius-border-subtle/50 flex flex-col gap-1.5">
                <div className="flex items-center gap-4">
                  <span className="text-[12px] uppercase tracking-widest text-radius-text-muted w-10 shrink-0 font-[family-name:var(--font-family-sans)]">
                    From
                  </span>
                  <AddressReveal name={sender.name} email={sender.email} />
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[12px] uppercase tracking-widest text-radius-text-muted w-10 shrink-0 font-[family-name:var(--font-family-sans)]">
                    To
                  </span>
                  <AddressReveal name={recipient.name} email={recipient.email} />
                </div>
              </div>
            </header>

            {sanitizedHtml ? (
              <div className="max-w-[720px] mx-auto">
                <div
                  className={`email-body min-w-0 ${hasRichHtml ? `email-body--rich ${richTextClass}` : `email-body--simple ${simpleTextClass}`}`}
                  onClick={handleBodyClick}
                  dangerouslySetInnerHTML={{
                    __html: hasRichHtml ? (htmlRender.html ?? sanitizedHtml) : sanitizedHtml,
                  }}
                />
                <AttachmentList attachments={message.attachments} messageId={message.id} />
              </div>
            ) : (
              <div className="max-w-[720px] mx-auto">
                <div className={`font-[family-name:var(--font-family-sans)] text-radius-text-primary whitespace-pre-wrap ${plainTextClass}`}>
                  {message.bodyText || message.snippet}
                </div>
                <AttachmentList attachments={message.attachments} messageId={message.id} />
              </div>
            )}
            {mailbox === "inbox" && repliedMessages.length > 0 ? (
              <div className="max-w-[720px] mx-auto mt-16">
                <div className="relative mb-8">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-radius-border-subtle/30" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-radius-bg-primary px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-radius-text-muted/70 font-[family-name:var(--font-family-sans)]">
                      Replies
                    </span>
                  </div>
                </div>
                <div className="flex flex-col">
                  {repliedMessages.map((reply) => (
                    <ReplyThreadCard key={reply.id} message={reply} />
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        )}
      </div>

      <style>{EMAIL_BODY_STYLES}</style>
    </div>
  );
});
