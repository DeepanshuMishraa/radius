import { useState, useCallback, useEffect, useMemo } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox, useMessage } from "./hooks/useInbox";
import { CommandK } from "@/components/cmd";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";

function App() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);

  const { isAuthenticated, startOAuth } = useAuth();
  const syncStatus = useSyncStatus();
  const { messages, total } = useInbox(
    1000,
    0,
    syncStatus.status === "syncing" ? 2000 : 15000
  );
  const { message: fullMessage } = useMessage(selectedMessageId);
  const hasAuthSignal = isAuthenticated === true || Boolean(syncStatus.lastSyncAt);
  const messagesById = useMemo(() => {
    return new Map(messages.map((message) => [message.id, message]));
  }, [messages]);
  const selectedMessagePreview = selectedMessageId
    ? messagesById.get(selectedMessageId) ?? null
    : null;
  const selectedMessage = fullMessage ?? selectedMessagePreview;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleConnect = useCallback(async () => {
    await startOAuth();
  }, [startOAuth]);

  const handleSelectMessage = useCallback((id: string) => {
    setSelectedMessageId(id);
    setSidebarOpen(false);
  }, []);

  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  if (isAuthenticated === null && !hasAuthSignal) {
    return (
      <div className="relative h-full bg-radius-bg-primary">
        <DragRegion />
      </div>
    );
  }

  if (!hasAuthSignal) {
    return (
      <div className="relative h-full bg-radius-bg-primary">
        <DragRegion />
        <Onboarding
          onConnect={handleConnect}
          error={syncStatus.status === "error" ? syncStatus.error : undefined}
        />
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <div className="relative flex h-full bg-radius-bg-primary overflow-hidden">
      <DragRegion />
      <aside
        className="sidebar-panel h-full border-r border-radius-border-subtle bg-radius-bg-primary will-change-transform"
        data-open={sidebarOpen}
      >
        <InboxList
          messages={messages}
          total={total}
          selectedId={selectedMessageId}
          onSelect={handleSelectMessage}
          syncStatus={syncStatus}
        />
      </aside>
      <main className="flex-1 min-w-0 h-full">
        <ReaderView
          message={selectedMessage}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={handleOpenSidebar}
        />
      </main>
      <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <DialogContent className="w-full max-w-xl p-0 overflow-hidden border-0 bg-transparent shadow-none">
          <CommandK />
        </DialogContent>
      </Dialog>

      {/* Minimal sync indicator — bottom left, never blocks */}
      <SyncPill syncStatus={syncStatus} />
      </div>
    </ThemeProvider>
  );
}

function DragRegion() {
  return (
    <div
      className="electrobun-webkit-app-region-drag fixed top-0 left-0 right-0 h-9 z-50"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    />
  );
}

function SyncPill({ syncStatus }: { syncStatus: ReturnType<typeof useSyncStatus> }) {
  if (syncStatus.status !== "syncing") return null;

  const current = syncStatus.progress?.current ?? 0;
  const total = syncStatus.progress?.total ?? 0;
  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-radius-bg-secondary/90 backdrop-blur-sm border border-radius-border-subtle shadow-sm">
      <svg
        className="animate-spin text-radius-text-muted shrink-0"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <span className="text-[11px] text-radius-text-secondary font-[family-name:var(--font-family-sans)]">
        {total > 0 ? `${pct}% · ${current.toLocaleString()}/${total.toLocaleString()}` : "Syncing"}
      </span>
    </div>
  );
}

export default App;
