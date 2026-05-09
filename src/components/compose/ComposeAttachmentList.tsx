import { motion, AnimatePresence } from "motion/react";
import { File as FileIcon, LinkSimple, X } from "@phosphor-icons/react";
import { type Attachment } from "./types";

interface ComposeAttachmentListProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

function formatBytes(bytes: number, decimals = 1) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function ComposeAttachmentList({ attachments, onRemove }: ComposeAttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <motion.div layout className="flex w-full overflow-x-auto px-5 py-2 no-scrollbar gap-2">
      <AnimatePresence mode="popLayout">
        {attachments.map((attachment) => (
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            key={attachment.id}
            className="group relative flex shrink-0 items-center gap-2 rounded-lg border border-radius-border-subtle bg-radius-bg-primary p-1.5 pr-2.5 shadow-sm"
          >
            {/* Icon or Thumbnail */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-radius-bg-secondary text-radius-text-muted">
              {attachment.type === "image" && attachment.url ? (
                <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
              ) : attachment.type === "link" ? (
                <LinkSimple size={14} />
              ) : (
                <FileIcon size={14} />
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col justify-center max-w-[120px]">
              <span className="truncate text-[11px] font-medium text-radius-text-primary leading-tight">
                {attachment.name}
              </span>
              {(attachment.size !== undefined || attachment.type === "link") && (
                <span className="truncate text-[9px] text-radius-text-muted leading-tight">
                  {attachment.type === "link" ? "Link" : formatBytes(attachment.size || 0)}
                </span>
              )}
            </div>

            {/* Remove Button (Hover overlay) */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onRemove(attachment.id)}
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-radius-border-subtle bg-radius-bg-primary text-radius-text-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-radius-error hover:border-radius-error/30"
              aria-label="Remove attachment"
            >
              <X size={10} weight="bold" />
            </motion.button>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
