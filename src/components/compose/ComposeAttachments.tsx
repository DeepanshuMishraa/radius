import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, File as FileIcon, Image as ImageIcon, LinkSimple, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import { type Attachment, isValidUrl } from "./types";

interface ComposeAttachmentsProps {
  onAddAttachment: (attachment: Attachment) => void;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function ComposeAttachments({ onAddAttachment }: ComposeAttachmentsProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "link">("menu");
  const [linkInput, setLinkInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setMode("menu");
        setLinkInput("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (mode === "link") {
      setTimeout(() => linkInputRef.current?.focus(), 50);
    }
  }, [mode]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const nextAttachments = await Promise.all(
        Array.from(files).map(async (file) => {
          const isImage = file.type.startsWith("image/");
          return {
            id: crypto.randomUUID(),
            type: isImage ? "image" : "file",
            name: file.name,
            size: file.size,
            mimeType: file.type || (isImage ? "image/png" : "application/octet-stream"),
            dataBase64: await fileToBase64(file),
            file,
            url: isImage ? URL.createObjectURL(file) : undefined,
          } satisfies Attachment;
        }),
      );
      nextAttachments.forEach((attachment) => onAddAttachment(attachment));
    } catch (error) {
      console.error("Failed to stage attachment:", error);
      toast.error("Attachment upload failed");
    }

    setOpen(false);
    // Reset input so the same file can be selected again if needed
    e.target.value = "";
  };

  const handleAddLink = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) {
      setMode("menu");
      return;
    }

    let formattedUrl = trimmed;
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = "https://" + formattedUrl;
    }

    if (!isValidUrl(formattedUrl)) {
      toast.error("Please enter a valid URL");
      return;
    }

    onAddAttachment({
      id: crypto.randomUUID(),
      type: "link",
      name: formattedUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      url: formattedUrl,
    });

    setLinkInput("");
    setMode("menu");
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        type="button"
        onClick={() => {
          setOpen(!open);
          setMode("menu");
        }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-radius-border-subtle shadow-sm transition-colors ${
          open ? "bg-radius-bg-secondary text-radius-text-primary" : "bg-radius-bg-primary text-radius-text-muted hover:text-radius-text-primary hover:bg-radius-bg-secondary"
        }`}
        aria-label="Add attachment"
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
          <Plus size={14} />
        </motion.div>
      </motion.button>

      {/* Hidden Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={(e) => handleFileChange(e)} 
        className="hidden" 
        accept=".pdf,.doc,.docx,.txt,.csv,.xlsx" 
        multiple 
      />
      <input 
        type="file" 
        ref={imageInputRef} 
        onChange={(e) => handleFileChange(e)} 
        className="hidden" 
        accept="image/*" 
        multiple 
      />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 5 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute bottom-[calc(100%+8px)] left-0 z-50 min-w-[160px] overflow-hidden rounded-xl border border-radius-border-subtle bg-radius-bg-primary p-1 shadow-xl"
          >
            <AnimatePresence mode="wait">
              {mode === "menu" ? (
                <motion.div
                  key="menu"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col"
                >
                  <AttachmentOption icon={<FileIcon size={14} />} label="Upload file" onClick={() => fileInputRef.current?.click()} />
                  <AttachmentOption icon={<ImageIcon size={14} />} label="Add image" onClick={() => imageInputRef.current?.click()} />
                  <AttachmentOption icon={<LinkSimple size={14} />} label="Insert link" onClick={() => setMode("link")} />
                </motion.div>
              ) : (
                <motion.div
                  key="link"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="flex w-[200px] items-center gap-1.5 px-1 py-1"
                >
                  <LinkSimple size={14} className="text-radius-text-muted shrink-0 ml-1.5" />
                  <input
                    ref={linkInputRef}
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddLink();
                      }
                    }}
                    placeholder="Paste link..."
                    className="flex-1 bg-transparent text-[12px] text-radius-text-primary outline-none placeholder:text-radius-text-muted"
                  />
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddLink}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-radius-text-primary text-radius-bg-primary shadow-sm hover:opacity-90 transition-opacity"
                  >
                    <ArrowRight size={12} weight="bold" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AttachmentOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ backgroundColor: "var(--radius-bg-secondary)" }}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-radius-text-secondary transition-colors hover:text-radius-text-primary"
    >
      <span className="text-radius-text-muted">{icon}</span>
      {label}
    </motion.button>
  );
}
