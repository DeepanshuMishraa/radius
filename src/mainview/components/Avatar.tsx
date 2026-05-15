import { useState, useCallback, useEffect } from "react";

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
}

export function Avatar({ name, email, cachedUrl, size = 40 }: AvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const initial = (name || email || "?").charAt(0).toUpperCase();

  const colorIndex = email
    ? email.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % COLORS.length
    : 0;
  const bgColor = COLORS[colorIndex];

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    setLoaded(false);
  }, [cachedUrl]);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[10px] border border-radius-border-subtle"
      style={{ width: size, height: size }}
    >
      {/* Fallback initial — always rendered underneath */}
      <div
        className="absolute inset-0 flex items-center justify-center text-white font-medium shadow-sm"
        style={{
          backgroundColor: bgColor,
          fontSize: size * 0.4,
          opacity: loaded && cachedUrl ? 0 : 1,
          transition: "opacity 150ms ease-out",
        }}
      >
        {initial}
      </div>

      {/* Logo image — rendered on top once it has loaded */}
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
