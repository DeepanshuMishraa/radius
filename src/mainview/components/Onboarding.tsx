interface OnboardingProps {
  onConnect: () => void;
  error?: string;
  onRetry?: () => void;
}

export function Onboarding({ onConnect, error, onRetry }: OnboardingProps) {
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
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>

        <h1 className="font-[family-name:var(--font-family-sans)] text-[28px] font-semibold text-radius-text-primary mb-4 leading-[1.1] -tracking-[0.6px]">
          Welcome to Radius
        </h1>

        <p className="text-[15px] text-radius-text-secondary mb-10 leading-[1.5] max-w-[320px] font-[family-name:var(--font-family-sans)]">
          A calm, distraction-free space for your email. Connect your Gmail account to get started.
        </p>

        {error && (
          <div className="mb-8 p-4 rounded-lg border border-radius-error/30 bg-radius-error/5 text-left w-full">
            <p className="text-[13px] font-medium text-radius-error mb-1 font-[family-name:var(--font-family-sans)]">Couldn&apos;t connect</p>
            <p className="text-[12px] text-radius-text-secondary leading-[1.4] font-[family-name:var(--font-family-sans)]">{error}</p>
          </div>
        )}

        <button
          onClick={onRetry ?? onConnect}
          className="px-6 py-3 bg-radius-accent hover:bg-radius-accent-hover text-radius-text-inverse text-[15px] font-medium rounded-lg transition-colors duration-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-radius-accent focus-visible:ring-offset-2 focus-visible:ring-offset-radius-bg-primary font-[family-name:var(--font-family-sans)]"
        >
          {error ? "Try Again" : "Connect Gmail Account"}
        </button>

        <p className="mt-5 text-[11px] text-radius-text-muted leading-[1.4] font-[family-name:var(--font-family-sans)]">
          Read-only access. We never send, delete, or modify your emails.
        </p>
      </div>
    </div>
  );
}
