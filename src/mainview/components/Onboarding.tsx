interface OnboardingProps {
  onConnect: () => void;
}

export function Onboarding({ onConnect }: OnboardingProps) {
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
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-radius-text-primary mb-3 tracking-tight">
          Welcome to Radius
        </h1>

        <p className="text-base text-radius-text-secondary mb-8 leading-relaxed">
          A calm, distraction-free space for your email. Connect your Gmail
          account to get started.
        </p>

        <button
          onClick={onConnect}
          className="px-6 py-3 bg-radius-accent hover:bg-radius-accent-hover text-radius-text-inverse font-medium rounded-lg transition-colors duration-80 text-base"
        >
          Connect Gmail Account
        </button>

        <p className="mt-4 text-xs text-radius-text-muted">
          Read-only access. We never send, delete, or modify your emails.
        </p>
      </div>
    </div>
  );
}
