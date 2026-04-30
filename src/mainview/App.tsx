import { useState, useCallback, useEffect } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { SyncProgress } from "./components/SyncProgress";
import { useAuth, useSyncStatus, useInbox } from "./hooks/useInbox";
import {  CommandK } from "@/components/cmd";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";

function App() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);

  const { isAuthenticated, startOAuth } = useAuth();
  const syncStatus = useSyncStatus();
  const { messages, total } = useInbox(200, 0);

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

  if (isAuthenticated === null) {
    return (
      <div className="relative h-full bg-radius-bg-primary">
        <DragRegion />
      </div>
    );
  }

  if (!isAuthenticated) {
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

  // Show full-screen sync progress on first startup (initial sync only)
  if (syncStatus.phase === "initial") {
    return (
      <div className="relative h-full bg-radius-bg-primary">
        <DragRegion />
        <SyncProgress
          current={syncStatus.progress?.current ?? 0}
          total={syncStatus.progress?.total ?? 0}
        />
      </div>
    );
  }

  const selectedMessage = messages.find((m) => m.id === selectedMessageId) ?? null;

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

export default App;
