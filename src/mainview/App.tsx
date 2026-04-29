import { useState, useCallback, useEffect } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox } from "./hooks/useInbox";
import { CommandDemo } from "@/components/cmd";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
      <div className="relative h-screen bg-radius-bg-primary">
        <DragRegion />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative h-screen bg-radius-bg-primary">
        <DragRegion />
        <Onboarding
          onConnect={handleConnect}
          error={syncStatus.status === "error" ? syncStatus.error : undefined}
        />
      </div>
    );
  }

  const selectedMessage = messages.find((m) => m.id === selectedMessageId) ?? null;

  return (
    <div className="relative flex h-screen bg-radius-bg-primary overflow-hidden">
      <DragRegion />

      {/* Sidebar — slides in/out with GPU-accelerated transform only */}
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

      {/* Reader view — fills remaining space */}
      <main className="flex-1 min-w-0 h-full">
        <ReaderView
          message={selectedMessage}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={handleOpenSidebar}
        />
      </main>

      {/* Command Palette */}
      <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <DialogContent className="w-full max-w-lg p-0 overflow-hidden border-0 bg-transparent shadow-none">
          <CommandDemo />
        </DialogContent>
      </Dialog>
    </div>
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
