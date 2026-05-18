import type { SyncMode } from "../../shared/types";

interface OnboardingProps {
  onConnect: (mode: SyncMode) => void;
  selectedMode: SyncMode | null;
  onSelectMode: (mode: SyncMode) => void;
  error?: string;
  onRetry?: () => void;
}

function CommandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function RadiusMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.15"
        className="onboarding-ring-outer"
      />
      <circle
        cx="24"
        cy="24"
        r="14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
        className="onboarding-ring-inner"
      />
      <circle
        cx="24"
        cy="24"
        r="4"
        fill="currentColor"
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
     <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#141519] px-6 py-12 relative overflow-hidden font-mono">
        {/* Ambient background fx */}
        <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>

        <div className="relative z-10 w-full max-w-[940px] grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* Left Column: Brand & Editorial */}
          <div className="flex flex-col text-left onboarding-slide-up">
             <div className="mb-12 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#18191d] border border-white/[0.04] shadow-sm">
                <RadiusMark className="w-6 h-6 text-white/50" />
             </div>

             <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#181a23] border border-[#232838] mb-8 w-max">
                <span className="w-1.5 h-1.5 rounded-full bg-[#526488]"></span>
                <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-[#6b7c9e]">Welcome to Radius</span>
             </div>

             <h1 className="text-5xl lg:text-[52px] font-medium text-[#e8e9eb] leading-[1.1] tracking-tight mb-12">
               A quiet place<br/>for your email.
             </h1>

             <div className="flex flex-col gap-8 max-w-[380px]">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center border border-white/10 shrink-0">
                    <ZapIcon className="w-3.5 h-3.5 text-white/70" />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-medium text-[#e0e0e0] mb-1.5">Faster reading</h3>
                    <p className="text-[11px] text-[#7a7a7a] leading-relaxed">A denser, calmer inbox built for triage rather than endless tab juggling.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center border border-white/10 shrink-0">
                    <CommandIcon className="w-3 h-3 text-white/70" />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-medium text-[#e0e0e0] mb-1.5">Quiet shortcuts</h3>
                    <p className="text-[11px] text-[#7a7a7a] leading-relaxed">Press <kbd className="font-mono bg-[#24262b] border border-[#31333a] rounded-[4px] px-1.5 py-0.5 text-[9px] text-[#a0a0a0] mx-0.5">/</kbd> to search, <kbd className="font-mono bg-[#24262b] border border-[#31333a] rounded-[4px] px-1.5 py-0.5 text-[9px] text-[#a0a0a0] mx-0.5">C</kbd> to compose, and <kbd className="font-mono bg-[#24262b] border border-[#31333a] rounded-[4px] px-1.5 py-0.5 text-[9px] text-[#a0a0a0] mx-0.5">Cmd+K</kbd> for everything else.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center border border-white/10 shrink-0">
                    <ShieldIcon className="w-3.5 h-3.5 text-white/70" />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-medium text-[#e0e0e0] mb-1.5">Gentle sync</h3>
                    <p className="text-[11px] text-[#7a7a7a] leading-relaxed">Read-only. We never touch your mail. Migrations happen quietly in the background.</p>
                  </div>
                </div>
             </div>
          </div>

          {/* Right Column: Interaction Card (Double-Bezel) */}
          <div className="w-full onboarding-slide-up-delayed">
             <div className="p-3.5 rounded-[32px] bg-[#17181c] border border-[#1e2026] shadow-2xl">
                <div className="rounded-[22px] bg-[#1a1b20] shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] border border-[#2a2c34] overflow-hidden">
                   
                   <div className="p-8 sm:p-10 flex flex-col h-full">
                      <h2 className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#63666f] mb-8 flex items-center gap-4">
                         <span className="h-px bg-[#2f3139] flex-1"></span>
                         Setup your inbox
                         <span className="h-px bg-[#2f3139] flex-1"></span>
                      </h2>

                      {error && (
                         <div className="mb-8 w-full rounded-xl border border-red-900/30 bg-red-900/10 px-4 py-3 text-left">
                           <div className="flex items-center gap-2 mb-1.5">
                             <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                             <p className="text-[9px] font-mono font-medium uppercase tracking-[0.1em] text-red-500">Gmail needs attention</p>
                           </div>
                           <p className="text-[11px] text-[#e0e0e0] mb-1">{error}</p>
                           <p className="text-[11px] text-[#7a7a7a] leading-relaxed">
                             If the Google window didn't appear, check for blocked pop-ups.
                           </p>
                         </div>
                      )}

                      <div className="flex flex-col gap-3 mb-10 flex-1">
                         <button
                           type="button"
                           onClick={() => onSelectMode("recent")}
                           className={`group relative w-full text-left p-5 rounded-[16px] transition-all duration-300 border ${
                             selectedMode === "recent"
                               ? 'bg-white/[0.02] border-[#42444c]' 
                               : 'bg-transparent border-[#26282f] hover:border-[#383a42]'
                           }`}
                         >
                           <div className="flex justify-between items-center gap-4">
                             <div>
                               <h3 className={`text-[12px] font-medium transition-colors duration-300 mb-1.5 ${selectedMode === "recent" ? 'text-[#f0f0f0]' : 'text-[#d5d5d5] group-hover:text-[#f0f0f0]'}`}>
                                 Quick start
                               </h3>
                               <p className="text-[11px] leading-[1.6] text-[#73757b]">
                                 Latest 3,000 emails. Best if you want<br/>Radius ready in a minute or two.
                               </p>
                             </div>
                             <div className={`shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-all duration-300 ${
                               selectedMode === "recent"
                                 ? 'border-[#d5d5d5] bg-transparent' 
                                 : 'border-[#383a42] group-hover:border-[#525560]'
                             }`}>
                               {selectedMode === "recent" && (
                                 <div className="w-[6px] h-[6px] rounded-full bg-[#d5d5d5]"></div>
                               )}
                             </div>
                           </div>
                         </button>

                         <button
                           type="button"
                           onClick={() => onSelectMode("all")}
                           className={`group relative w-full text-left p-5 rounded-[16px] transition-all duration-300 border ${
                             selectedMode === "all"
                               ? 'bg-white/[0.02] border-[#42444c]' 
                               : 'bg-transparent border-[#26282f] hover:border-[#383a42]'
                           }`}
                         >
                           <div className="flex justify-between items-center gap-4">
                             <div>
                               <h3 className={`text-[12px] font-medium transition-colors duration-300 mb-1.5 ${selectedMode === "all" ? 'text-[#f0f0f0]' : 'text-[#d5d5d5] group-hover:text-[#f0f0f0]'}`}>
                                 Complete archive
                               </h3>
                               <p className="text-[11px] leading-[1.6] text-[#73757b]">
                                 Bring in everything. Quietly fills<br/>older conversations in the background.
                               </p>
                             </div>
                             <div className={`shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-all duration-300 ${
                               selectedMode === "all"
                                 ? 'border-[#d5d5d5] bg-transparent' 
                                 : 'border-[#383a42] group-hover:border-[#525560]'
                             }`}>
                               {selectedMode === "all" && (
                                 <div className="w-[6px] h-[6px] rounded-full bg-[#d5d5d5]"></div>
                               )}
                             </div>
                           </div>
                         </button>
                      </div>

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
                        className="group relative w-full flex items-center justify-between p-2 pl-6 bg-[#7d828f] hover:bg-[#8f94a1] text-[#121317] rounded-full transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                         <span className="font-medium text-[13px] tracking-wide">
                           {error ? "Try Again" : "Connect Gmail"}
                         </span>
                         <div className="w-[34px] h-[34px] rounded-full bg-[#121317]/15 flex items-center justify-center transition-transform duration-300 group-hover:bg-[#121317]/25">
                           <ArrowRightIcon className="w-4 h-4 text-[#121317] group-hover:translate-x-0.5 transition-transform duration-300" />
                         </div>
                      </button>

                   </div>
                </div>
             </div>
          </div>

        </div>

        <style>{`
          @keyframes onboarding-slide-up {
            from { opacity: 0; transform: translateY(40px) scale(0.98); filter: blur(8px); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          .onboarding-slide-up {
            animation: onboarding-slide-up 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .onboarding-slide-up-delayed {
            opacity: 0;
            animation: onboarding-slide-up 1s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards;
          }

          @keyframes ring-breathe {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.15); opacity: 0.6; }
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
            .onboarding-slide-up, .onboarding-slide-up-delayed {
              animation: none;
              opacity: 1;
              transform: none;
              filter: none;
            }
            .onboarding-ring-outer, .onboarding-ring-inner, .onboarding-dot {
              animation: none;
            }
          }
        `}</style>
     </div>
  );
}
