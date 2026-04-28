interface SyncProgressProps {
  current: number;
  total: number;
}

export function SyncProgress({ current, total }: SyncProgressProps) {
  const percentage = total > 0 ? Math.min((current / total) * 100, 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-radius-bg-primary px-6">
      <div className="flex flex-col items-center max-w-md text-center">
        {/* Logo */}
        <div className="w-12 h-12 rounded-xl bg-radius-accent flex items-center justify-center mb-8">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-radius-text-inverse"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-radius-text-primary mb-2">
          Syncing your inbox
        </h1>

        <p className="text-sm text-radius-text-secondary mb-8 leading-relaxed">
          Fetching your emails from Gmail and storing them locally for instant
          access. This only happens once.
        </p>

        {/* Progress bar */}
        <div className="w-full max-w-xs mb-3">
          <div className="h-1 bg-radius-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-radius-accent rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-radius-text-muted">
          {current.toLocaleString()} of {total.toLocaleString()} emails synced
        </p>
      </div>
    </div>
  );
}
