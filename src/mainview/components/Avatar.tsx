import { useState, useCallback } from "react";

const COLORS = [
  "#4A90E2",
  "#E26D5C",
  "#5AA8C4",
  "#C47D5A",
  "#5A8C6F",
  "#A35AC4",
  "#c4a35a",
  "#a35ac4",
];

interface AvatarProps {
  name: string;
  email: string;
  cachedUrl?: string | null;
  size?: number;
  isPersonal?: boolean;
}

function PersonIcon({ size }: { size: number }) {
  return (
    <svg
      width={size * 0.5}
      height={size * 0.5}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/90"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

export function Avatar({ name, email, cachedUrl, size = 40, isPersonal = false }: AvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const initial = (name || email || "?").charAt(0).toUpperCase();

  const colorIndex = email
    ? email.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % COLORS.length
    : 0;
  const bgColor = COLORS[colorIndex];

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full border border-radius-border-subtle"
      style={{ width: size, height: size }}
    >
      {/* Fallback initial or person icon — always rendered underneath */}
      <div
        className="absolute inset-0 flex items-center justify-center font-medium shadow-sm"
        style={{
          backgroundColor: bgColor,
          fontSize: size * 0.4,
          opacity: loaded && cachedUrl ? 0 : 1,
          transition: "opacity 150ms ease-out",
        }}
      >
        {isPersonal && !cachedUrl ? (
          <PersonIcon size={size} />
        ) : (
          <span className="text-white">{initial}</span>
        )}
      </div>

      {/* Logo / Gravatar image — rendered on top once it has loaded */}
      {cachedUrl && (
        <img
          src={cachedUrl}
          alt=""
          onLoad={handleLoad}
          className="absolute inset-0 h-full w-full object-cover bg-white"
          style={{
            opacity: loaded ? 1 : 0,
            transition: "opacity 150ms ease-out",
          }}
        />
      )}
    </div>
  );
}
