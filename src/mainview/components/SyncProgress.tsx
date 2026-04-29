interface SyncProgressProps {
  current: number;
  total: number;
}

export function SyncProgress({ current, total }: SyncProgressProps) {
  const showProgress = total > 0;
  const pct = showProgress ? Math.min(Math.round((current / total) * 100), 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-radius-bg-primary px-6">
      <div className="flex flex-col items-center max-w-md text-center">
        <div className="w-10 h-10 rounded-2xl bg-radius-accent flex items-center justify-center mb-10">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-radius-text-inverse"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <h1 className="font-[family-name:var(--font-family-sans)] text-[22px] font-semibold text-radius-text-primary mb-3 leading-[1.1] -tracking-[0.4px]">
          Syncing your inbox
        </h1>

        <p className="text-[15px] text-radius-text-secondary mb-8 leading-[1.5] max-w-[320px] font-[family-name:var(--font-family-sans)]">
          Fetching your emails from Gmail and storing them locally for instant access. This only happens once.
        </p>

        {showProgress && (
          <>
            <div className="w-full max-w-xs mb-3">
              <div className="h-[2px] bg-radius-border-subtle rounded-full overflow-hidden">
                <div
                  className="h-full bg-radius-accent rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <p className="text-[12px] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
              {current.toLocaleString()} / {total.toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
