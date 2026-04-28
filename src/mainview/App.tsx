import { useState, useCallback } from "react";
import { Onboarding } from "./components/Onboarding";
import { SyncProgress } from "./components/SyncProgress";
import { InboxList } from "./components/InboxList";
import { ReaderView } from "./components/ReaderView";
import { useAuth, useSyncStatus, useInbox } from "./hooks/useInbox";

type View = "onboarding" | "syncing" | "inbox" | "reader";

function App() {
  const [view, setView] = useState<View>("onboarding");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );

  const { isAuthenticated, startOAuth } = useAuth();
  const syncStatus = useSyncStatus();
  const { messages, total, refresh } = useInbox(100, 0);

  const handleConnect = useCallback(async () => {
    const success = await startOAuth();
    if (success) {
      setView("syncing");
    }
  }, [startOAuth]);

  const handleSelectMessage = useCallback(
    (id: string) => {
      setSelectedMessageId(id);
      setView("reader");
    },
    []
  );

  const handleBackToInbox = useCallback(() => {
    setSelectedMessageId(null);
    setView("inbox");
  }, []);

  // Show onboarding if not authenticated
  if (isAuthenticated === false && view === "onboarding") {
    return <Onboarding onConnect={handleConnect} />;
  }

  // Show sync progress
  if (view === "syncing" || syncStatus.status === "syncing") {
    return (
      <SyncProgress
        current={syncStatus.progress?.current ?? 0}
        total={syncStatus.progress?.total ?? 1000}
      />
    );
  }

  // Show inbox + reader split view
  const selectedMessage = messages.find((m) => m.id === selectedMessageId) ?? null;

  return (
    <div className="flex h-screen bg-radius-bg-primary">
      {/* Inbox sidebar */}
      <div className="w-[420px] flex-shrink-0 border-r border-radius-border-subtle">
        <InboxList
          messages={messages}
          total={total}
          selectedId={selectedMessageId}
          onSelect={handleSelectMessage}
          onLoadMore={refresh}
        />
      </div>

      {/* Reader pane */}
      <div className="flex-1 min-w-0">
        <ReaderView message={selectedMessage} onBack={handleBackToInbox} />
      </div>
    </div>
  );
}

export default App;
