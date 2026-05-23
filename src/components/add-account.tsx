import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { ImapSettings, SyncMode } from "@/shared/types";

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
  onConnect: (mode: SyncMode) => void;
  selectedMode: SyncMode | null;
  onSelectMode: (mode: SyncMode) => void;
  onConnectImap?: (email: string, password: string, imapSettings: ImapSettings) => Promise<void>;
  onTestImapConnection?: (email: string, password: string, imapSettings: ImapSettings) => Promise<{ success: boolean; error?: string }>;
}

export function AddAccountDialog({
  open, onClose, onConnect, selectedMode, onSelectMode,
  onConnectImap, onTestImapConnection,
}: AddAccountDialogProps) {
  const [providerTab, setProviderTab] = useState<"gmail" | "imap">("gmail");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapUseTls, setImapUseTls] = useState(true);
  const [imapEmail, setImapEmail] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapTestResult, setImapTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapConnecting, setImapConnecting] = useState(false);

  if (!open) return null;

  const isReadyToConnect = providerTab === "imap"
    ? Boolean(imapEmail && imapPassword && imapHost)
    : selectedMode !== null;

  const handleTestImap = async () => {
    if (!onTestImapConnection || !imapEmail || !imapPassword || !imapHost) return;
    setImapTesting(true);
    setImapTestResult(null);
    const result = await onTestImapConnection(imapEmail, imapPassword, {
      host: imapHost, port: parseInt(imapPort, 10), useTls: imapUseTls,
    });
    setImapTestResult(result);
    setImapTesting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-radius-bg-primary/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div role="dialog" aria-modal="true" className="w-full max-w-[400px] rounded-2xl border border-radius-border-subtle bg-radius-bg-primary p-6 shadow-[0_16px_48px_rgba(0,0,0,0.16)] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[15px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">Add Account</h2>
          <button type="button" onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-radius-text-muted transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary"
            aria-label="Close">
            <HugeiconsIcon icon={Cancel01Icon} size={14} className="text-radius-text-muted" />
          </button>
        </div>

        <div className="flex gap-1 mb-5 p-0.5 rounded-full bg-radius-bg-secondary/50 border border-radius-border-subtle">
          <button type="button" onClick={() => setProviderTab("gmail")}
            className={`px-4 py-1.5 text-[12px] font-medium rounded-full transition-all font-[family-name:var(--font-family-sans)] ${
              providerTab === "gmail"
                ? "bg-radius-bg-primary text-radius-text-primary shadow-sm"
                : "text-radius-text-muted hover:text-radius-text-primary"
            }`}>
            Gmail
          </button>
          <button type="button" onClick={() => setProviderTab("imap")}
            className={`px-4 py-1.5 text-[12px] font-medium rounded-full transition-all font-[family-name:var(--font-family-sans)] ${
              providerTab === "imap"
                ? "bg-radius-bg-primary text-radius-text-primary shadow-sm"
                : "text-radius-text-muted hover:text-radius-text-primary"
            }`}>
            IMAP
          </button>
        </div>

        {providerTab === "gmail" ? (
          <>
            <p className="mb-5 text-[13px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
              Connect another Gmail account to Radius.
            </p>
            <div className="mb-6 grid gap-2">
              <button type="button" onClick={() => onSelectMode("recent")}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors duration-200 ${
                  selectedMode === "recent" ? "border-radius-accent bg-radius-bg-secondary" : "border-radius-border-subtle hover:bg-radius-bg-secondary/60"
                }`}>
                <div className="text-left">
                  <p className="text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">Recent emails</p>
                  <p className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">Fetch latest 3,000 emails</p>
                </div>
                <span className={`inline-flex h-4 w-4 shrink-0 rounded-full border ${
                  selectedMode === "recent" ? "border-radius-accent bg-radius-accent" : "border-radius-border-subtle"
                }`} />
              </button>
              <button type="button" onClick={() => onSelectMode("all")}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors duration-200 ${
                  selectedMode === "all" ? "border-radius-accent bg-radius-bg-secondary" : "border-radius-border-subtle hover:bg-radius-bg-secondary/60"
                }`}>
                <div className="text-left">
                  <p className="text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">All emails</p>
                  <p className="text-[11px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">Full migration in background</p>
                </div>
                <span className={`inline-flex h-4 w-4 shrink-0 rounded-full border ${
                  selectedMode === "all" ? "border-radius-accent bg-radius-accent" : "border-radius-border-subtle"
                }`} />
              </button>
            </div>
          </>
        ) : (
          <div className="mb-5 space-y-4">
            <div>
              <label className="text-[11px] font-medium text-radius-text-muted font-[family-name:var(--font-family-sans)]">Email</label>
              <input type="email" value={imapEmail} onChange={(e) => setImapEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-1 w-full rounded-xl border border-radius-border-subtle bg-radius-bg-primary px-4 py-2.5 text-[13px] text-radius-text-primary placeholder:text-radius-text-muted/50 outline-none focus:border-radius-accent font-[family-name:var(--font-family-sans)]" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-radius-text-muted font-[family-name:var(--font-family-sans)]">Password</label>
              <input type="password" value={imapPassword} onChange={(e) => setImapPassword(e.target.value)}
                placeholder="App password or mailbox password"
                className="mt-1 w-full rounded-xl border border-radius-border-subtle bg-radius-bg-primary px-4 py-2.5 text-[13px] text-radius-text-primary placeholder:text-radius-text-muted/50 outline-none focus:border-radius-accent font-[family-name:var(--font-family-sans)]" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-radius-text-muted font-[family-name:var(--font-family-sans)]">IMAP Server</label>
              <input type="text" value={imapHost} onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.company.com"
                className="mt-1 w-full rounded-xl border border-radius-border-subtle bg-radius-bg-primary px-4 py-2.5 text-[13px] text-radius-text-primary placeholder:text-radius-text-muted/50 outline-none focus:border-radius-accent font-[family-name:var(--font-family-sans)]" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-radius-text-muted font-[family-name:var(--font-family-sans)]">Port</label>
                <input type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)}
                  placeholder="993"
                  className="mt-1 w-full rounded-xl border border-radius-border-subtle bg-radius-bg-primary px-4 py-2.5 text-[13px] text-radius-text-primary placeholder:text-radius-text-muted/50 outline-none focus:border-radius-accent font-[family-name:var(--font-family-sans)]" />
              </div>
              <div className="flex items-end pb-2.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={imapUseTls} onChange={(e) => setImapUseTls(e.target.checked)}
                    className="h-4 w-4 rounded border-radius-border-subtle text-radius-accent focus:ring-radius-accent" />
                  <span className="text-[12px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">Use SSL/TLS</span>
                </label>
              </div>
            </div>
            <button type="button" onClick={handleTestImap}
              disabled={imapTesting || !imapHost || !imapEmail || !imapPassword}
              className="w-full rounded-xl border border-radius-border-subtle px-4 py-2 text-[12px] font-medium text-radius-text-secondary transition-colors hover:bg-radius-bg-secondary hover:text-radius-text-primary disabled:cursor-not-allowed disabled:opacity-50 font-[family-name:var(--font-family-sans)]">
              {imapTesting ? "Testing..." : "Test Connection"}
            </button>
            {imapTestResult && (
              <p className={`text-center text-[11px] font-[family-name:var(--font-family-sans)] ${imapTestResult.success ? "text-radius-success" : "text-radius-error"}`}>
                {imapTestResult.success ? "Connection successful" : imapTestResult.error || "Connection failed"}
              </p>
            )}
          </div>
        )}

        <button type="button"
          onClick={async () => {
            if (providerTab === "imap") {
              if (onConnectImap && imapEmail && imapPassword && imapHost) {
                setImapConnecting(true);
                try {
                  await onConnectImap(imapEmail, imapPassword, { host: imapHost, port: parseInt(imapPort, 10), useTls: imapUseTls });
                } finally {
                  setImapConnecting(false);
                }
              }
            } else if (selectedMode) {
              onConnect(selectedMode);
            }
          }}
          disabled={!isReadyToConnect || imapConnecting}
          className="w-full rounded-xl bg-radius-accent px-4 py-2.5 text-[13px] font-medium text-radius-text-inverse transition-colors hover:bg-radius-accent-hover disabled:bg-radius-bg-secondary disabled:text-radius-text-muted disabled:cursor-not-allowed font-[family-name:var(--font-family-sans)]">
          {imapConnecting ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Connecting...
            </span>
          ) : providerTab === "imap" ? "Connect IMAP" : "Connect Gmail"}
        </button>
      </div>
    </div>
  );
}
