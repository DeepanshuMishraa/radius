import { useState, useCallback } from "react";
import { Onboarding } from "./components/Onboarding";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox } from "./hooks/useInbox";

function App() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const { isAuthenticated, startOAuth } = useAuth();
  const syncStatus = useSyncStatus();
  const { messages, total } = useInbox(200, 0);

  const handleConnect = useCallback(async () => {
    await startOAuth();
  }, [startOAuth]);

  const handleSelectMessage = useCallback((id: string) => {
    setSelectedMessageId(id);
  }, []);

  const handleBackToInbox = useCallback(() => {
    setSelectedMessageId(null);
  }, []);

  // Still checking auth
  if (isAuthenticated === null) {
    return (
      <div className="relative h-screen bg-radius-bg-primary">
        <DragRegion />
      </div>
    );
  }

  // Not authenticated — show onboarding
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

  // Authenticated — show inbox immediately, stream messages as they arrive
  const selectedMessage = messages.find((m) => m.id === selectedMessageId) ?? null;

  if (selectedMessageId && selectedMessage) {
    return (
      <div className="relative h-screen bg-radius-bg-primary">
        <DragRegion />
        <div className="h-full pt-9">
          <ReaderView message={selectedMessage} onBack={handleBackToInbox} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen bg-radius-bg-primary">
      <DragRegion />
      <div className="w-[420px] flex-shrink-0 border-r border-radius-border-subtle pt-9">
        <InboxList
          messages={messages}
          total={total}
          selectedId={selectedMessageId}
          onSelect={handleSelectMessage}
          syncStatus={syncStatus}
        />
      </div>
      <div className="flex-1 min-w-0 pt-9">
        <ReaderView message={selectedMessage} onBack={handleBackToInbox} />
      </div>
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
