import type { SyncMode } from "../../shared/types";

interface OnboardingProps {
  onConnect: (mode: SyncMode) => void;
  selectedMode: SyncMode | null;
  onSelectMode: (mode: SyncMode) => void;
  error?: string;
  onRetry?: () => void;
}

function RadiusMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer ring — subtle, breathing */}
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.12"
        className="onboarding-ring-outer"
      />
      {/* Inner ring */}
      <circle
        cx="24"
        cy="24"
        r="16"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.2"
        className="onboarding-ring-inner"
      />
      {/* Core dot */}
      <circle
        cx="24"
        cy="24"
        r="3"
        fill="currentColor"
        fillOpacity="0.9"
        className="onboarding-dot"
      />
    </svg>
  );
}

export function Onboarding({
  onConnect,
  selectedMode,
  onSelectMode,
  error,
  onRetry,
}: OnboardingProps) {
  const isReadyToConnect = selectedMode !== null;

  return (
    <div className="flex flex-col items-center justify-center min-h-full bg-radius-bg-primary px-6 onboarding-enter">
      <div className="flex w-full max-w-[520px] flex-col items-center text-center">
        {/* Mark */}
        <div className="relative mb-12">
          <RadiusMark className="w-12 h-12 text-radius-accent" />
        </div>

        {/* Masthead */}
        <h1 className="font-[family-name:var(--font-family-serif)] text-[42px] font-semibold text-radius-text-primary leading-none tracking-tight mb-5">
          Radius
        </h1>

        {/* Tagline — one breath */}
        <p className="font-[family-name:var(--font-family-sans)] text-[14px] text-radius-text-muted leading-relaxed tracking-wide mb-14">
          A quiet place for your email.
        </p>

        {/* Error — minimal inline */}
        {error && (
          <div className="mb-8 text-center">
            <p className="text-[12px] text-radius-error font-[family-name:var(--font-family-sans)]">
              {error}
            </p>
          </div>
        )}

        <div className="mb-8 grid w-full gap-3 text-left">
          <button
            type="button"
            onClick={() => onSelectMode("recent")}
            className={`rounded-[24px] border px-5 py-4 transition-colors duration-200 ${
              selectedMode === "recent"
                ? "border-radius-accent bg-radius-bg-secondary"
                : "border-radius-border-subtle bg-radius-bg-primary hover:bg-radius-bg-secondary/60"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
                  Fetch 3,000 emails
                </p>
                <p className="mt-1 text-[11px] leading-[1.55] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                  Clean migration. Fastest setup. Radius brings in your latest 3,000 emails and gets you reading quickly.
                </p>
              </div>
              <span
                className={`mt-1 inline-flex h-4 w-4 shrink-0 rounded-full border ${
                  selectedMode === "recent"
                    ? "border-radius-accent bg-radius-accent"
                    : "border-radius-border-subtle"
                }`}
              />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectMode("all")}
            className={`rounded-[24px] border px-5 py-4 transition-colors duration-200 ${
              selectedMode === "all"
                ? "border-radius-accent bg-radius-bg-secondary"
                : "border-radius-border-subtle bg-radius-bg-primary hover:bg-radius-bg-secondary/60"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-radius-text-primary font-[family-name:var(--font-family-sans)]">
                  Fetch all emails
                </p>
                <p className="mt-1 text-[11px] leading-[1.55] text-radius-text-muted font-[family-name:var(--font-family-sans)]">
                  Takes longer. Radius fetches your first 3,000 upfront, then keeps pulling older mail in batches while the app is open.
                </p>
              </div>
              <span
                className={`mt-1 inline-flex h-4 w-4 shrink-0 rounded-full border ${
                  selectedMode === "all"
                    ? "border-radius-accent bg-radius-accent"
                    : "border-radius-border-subtle"
                }`}
              />
            </div>
          </button>
        </div>

        {/* Action */}
        <button
          onClick={() => {
            if (onRetry) {
              onRetry();
              return;
            }
            if (selectedMode) {
              onConnect(selectedMode);
            }
          }}
          disabled={!isReadyToConnect}
          className="
            group
            relative
            px-8 py-3
            text-[13px] font-medium
            text-radius-text-inverse
            bg-radius-accent
            hover:bg-radius-accent-hover
            rounded-full
            transition-all duration-200 ease-out
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-radius-accent focus-visible:ring-offset-2 focus-visible:ring-offset-radius-bg-primary
            font-[family-name:var(--font-family-sans)]
            active:scale-[0.97]
            disabled:bg-radius-bg-secondary disabled:text-radius-text-muted disabled:hover:bg-radius-bg-secondary disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          <span className="relative z-10 flex items-center gap-2">
            {error ? "Try Again" : "Connect Gmail"}
            {!error && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-70 group-hover:translate-x-0.5 transition-transform duration-200"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            )}
          </span>
        </button>

        {/* Footnote — almost invisible */}
        <p className="mt-10 text-[10px] text-radius-text-muted/60 tracking-wide font-[family-name:var(--font-family-sans)]">
          Read-only. We never touch your mail. Full migrations continue gently in the background.
        </p>
      </div>

      <style>{`
        @keyframes onboarding-enter {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .onboarding-enter {
          animation: onboarding-enter 500ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }

        @keyframes ring-breathe {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.08);
            opacity: 0.5;
          }
        }
        .onboarding-ring-outer {
          transform-origin: center;
          animation: ring-breathe 4s ease-in-out infinite;
        }
        .onboarding-ring-inner {
          transform-origin: center;
          animation: ring-breathe 4s ease-in-out infinite 0.6s;
        }
        .onboarding-dot {
          transform-origin: center;
          animation: ring-breathe 4s ease-in-out infinite 1.2s;
        }

        @media (prefers-reduced-motion: reduce) {
          .onboarding-enter {
            animation: none;
            opacity: 1;
            transform: none;
          }
          .onboarding-ring-outer,
          .onboarding-ring-inner,
          .onboarding-dot {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
